import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorizedPOS } from "~/lib/pos-auth";
import { db } from "~/server/db";
import { posStorageScope } from "~/server/pos/scope";



function toGroupKey(input: { variationId: number; stockGroupId?: string | null }) {
  if (input.stockGroupId && input.stockGroupId.trim().length > 0) {
    return `group:${input.stockGroupId}`;
  }
  return `var:${input.variationId}`;
}

const bodySchema = z.object({
  direction: z.enum(["INVENTORY_TO_POS", "POS_TO_INVENTORY"]),
  variationId: z.number().int().positive(),
  qty: z.number().int().positive(),
});

export async function POST(request: Request) {
  if (posStorageScope.getStore() !== "dealership") {
    return NextResponse.json({ error: "POS product requests and direct stock transfers are disabled. Management controls allocations in OMS." }, { status: 403 });
  }
  const authz = await isAuthorizedPOS(request);
  if (!authz.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: authz.status });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { direction, variationId, qty } = parsed.data;

  const variation = await db.productVariation.findUnique({
    where: { id: variationId },
    select: { id: true, product_id: true, stock: true, stockGroupId: true },
  });

  if (!variation) {
    return NextResponse.json({ error: "Variation not found" }, { status: 404 });
  }

  const groupKey = toGroupKey({ variationId: variation.id, stockGroupId: variation.stockGroupId });

  const groupVariationIds =
    variation.stockGroupId && variation.stockGroupId.trim().length > 0
      ? (
          await db.productVariation.findMany({
            where: { product_id: variation.product_id, stockGroupId: variation.stockGroupId },
            select: { id: true },
          })
        ).map((v) => v.id)
      : [variation.id];

  const result = await db.$transaction(async (tx) => {
    const posInventory = (tx as any)?.posInventory;
    const posStockTransferLog = (tx as any)?.posStockTransferLog;
    if (!posInventory?.upsert || !posInventory?.findUnique || !posInventory?.update || !posStockTransferLog?.create) {
      return NextResponse.json(
        {
          error:
            "POS tables are not initialized. Run: npx prisma db execute --file prisma/migrations/SAFE_add_pos_models.sql, then npx prisma generate, then restart the dev server.",
        },
        { status: 500 },
      );
    }

    if (direction === "INVENTORY_TO_POS") {
      const groupStocks =
        groupVariationIds.length > 1
          ? await tx.productVariation.findMany({ where: { id: { in: groupVariationIds } }, select: { stock: true } })
          : [{ stock: variation.stock ?? 0 }];

      const minStock = Math.min(...groupStocks.map((s) => s.stock ?? 0));
      if (minStock < qty) {
        return NextResponse.json(
          { error: `Insufficient inventory stock. Available: ${minStock}, Requested: ${qty}` },
          { status: 400 },
        );
      }

      await tx.productVariation.updateMany({ where: { id: { in: groupVariationIds } }, data: { stock: { decrement: qty } } });

      await posInventory.upsert({
        where: { groupKey },
        create: { groupKey, stockGroupId: variation.stockGroupId, variationId: variation.id, qty },
        update: { qty: { increment: qty }, variationId: variation.id, stockGroupId: variation.stockGroupId },
      });
    } else {
      const existing = await posInventory.findUnique({ where: { groupKey }, select: { qty: true } });
      if (!existing || existing.qty < qty) {
        return NextResponse.json(
          { error: `Insufficient POS stock. Available: ${existing?.qty ?? 0}, Requested: ${qty}` },
          { status: 400 },
        );
      }

      await posInventory.update({
        where: { groupKey },
        data: { qty: { decrement: qty }, variationId: variation.id, stockGroupId: variation.stockGroupId },
      });

      await tx.productVariation.updateMany({ where: { id: { in: groupVariationIds } }, data: { stock: { increment: qty } } });
    }

    await posStockTransferLog.create({
      data: { direction, variationId: variation.id, groupKey, qty, performedById: null },
    });

    return { ok: true as const };
  });

  if (result instanceof NextResponse) {
    return result;
  }

  return NextResponse.json({ data: { success: true } }, { status: 200 });
}

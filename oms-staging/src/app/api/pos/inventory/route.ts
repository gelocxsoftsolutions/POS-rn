import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorizedPOS } from "~/lib/pos-auth";
import { db } from "~/server/db";
import { posStorageScope } from "~/server/pos/scope";
import { Prisma } from "@prisma/client";
import { pendingNctAllocations } from "~/server/pos/nct-pending-allocations";



const querySchema = z.object({
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  deviceId: z.string().trim().optional(),
});

export async function GET(request: Request) {
  const authz = await isAuthorizedPOS(request);
  if (!authz.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: authz.status });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    search: url.searchParams.get("search") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    deviceId: url.searchParams.get("deviceId") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const { search, limit, deviceId } = parsed.data;
  const pendingSaleIds = (url.searchParams.get("pendingSaleIds") ?? "").split(',').filter(Boolean);
  if (!z.array(z.string().uuid()).max(100).safeParse(pendingSaleIds).success) return NextResponse.json({ error: "Invalid pending sale IDs" }, { status: 400 });
  const nct = posStorageScope.getStore() !== "dealership";
  if (nct && !authz.deviceId) return NextResponse.json({ error: "A registered NCT device is required" }, { status: 401 });
  if (nct && deviceId && deviceId !== authz.deviceId) return NextResponse.json({ error: "Cannot read another device's stock" }, { status: 403 });

  const where: Record<string, unknown> = {};
  if (nct) where.deviceId = authz.deviceId;

  if (deviceId && deviceId !== "ALL") {
    where.deviceId = deviceId;
  }

  if (search) {
    where.OR = [
      { variation: { product: { name: { contains: search, mode: "insensitive" } } } },
      { variation: { product_name: { contains: search, mode: "insensitive" } } },
      { variation: { product_variation_name: { contains: search, mode: "insensitive" } } },
      { groupKey: { contains: search, mode: "insensitive" } },
    ];
  }

  const { items, acknowledgedSaleIds } = await db.$transaction(async (tx) => {
  const items = await tx.posInventory.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    take: nct ? undefined : limit ?? 500,
    orderBy: [{ qty: "desc" }, { id: "asc" }],
    include: {
      variation: {
        include: {
          unit: true,
          product: { select: { id: true, name: true, image_url: true } },
        },
      },
    },
  });

  let acknowledgedSaleIds: string[] = [];
  if (nct && pendingSaleIds.length) {
    const [schema] = await tx.$queryRaw<Array<{ ready: boolean }>>`SELECT to_regclass('pos.sale_sync_receipts') IS NOT NULL AS ready`;
    if (schema?.ready) {
      const receipts = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT client_sale_id::text AS id FROM pos.sale_sync_receipts WHERE device_id = ${authz.deviceId} AND client_sale_id::text IN (${Prisma.join(pendingSaleIds)})`);
      acknowledgedSaleIds = receipts.map((r) => r.id);
    }
  }
  const unreceived = nct ? await pendingNctAllocations(tx, [authz.deviceId!]) : new Map<string, number>();
  return { items: items.map((item) => ({ ...item, qty: Math.max(0, item.qty - (unreceived.get(`${item.deviceId}:${item.groupKey}`) ?? 0)) })), acknowledgedSaleIds };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

  const deviceIds = [...new Set(items.map((i) => i.deviceId))];
  const devices = deviceIds.length > 0
    ? await db.posDevice.findMany({
        where: { id: { in: deviceIds } },
        select: { id: true, deviceName: true, deviceCode: true },
      })
    : [];
  const deviceMap = new Map(devices.map((d) => [d.id, d]));

  return NextResponse.json(
    {
      ...(nct ? { complete: !search, acknowledgedSaleIds } : {}),
      data: items.map((row) => ({
        groupKey: row.groupKey,
        stockGroupId: row.stockGroupId ?? null,
        qty: row.qty,
        deviceId: row.deviceId,
        deviceName: deviceMap.get(row.deviceId)?.deviceName ?? (row.deviceId === "" ? "General Pool" : row.deviceId),
        variation: {
          id: row.variation.id,
          productId: row.variation.product_id,
          productName: row.variation.product?.name ?? row.variation.product_name ?? "",
          variationName: row.variation.product_variation_name ?? "",
          barcode: row.variation.barcode ?? null,
          unit: row.variation.unit?.name ?? null,
          weight: Number(row.variation.weight ?? 0),
          posPrice: Number(row.variation.pos_price ?? 0),
          price: Number(row.variation.price ?? 0),
          imageUrl: row.variation.product?.image_url ?? null,
        },
      })),
    },
    { status: 200 },
  );
}

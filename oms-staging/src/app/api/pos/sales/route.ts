import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { isAuthorizedPOS } from "~/lib/pos-auth";
import { db } from "~/server/db";
import { saleContract } from "~/server/pos/sale-contract";
import { employeeAccessReady } from "~/server/pos/employee-directory";
import { pendingNctAllocations } from "~/server/pos/nct-pending-allocations";

class SaleError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function POST(request: Request) {
  const auth = await isAuthorizedPOS(request);
  if (!auth.ok || !auth.deviceId) return NextResponse.json({ error: "A registered NCT POS device key is required" }, { status: 401 });
  // Dealership devices must retain their existing local-sales behavior.
  if (await db.dealershipDevice.findUnique({ where: { posDeviceId: auth.deviceId }, select: { id: true } })) {
    return NextResponse.json({ error: "Dealership sales are retained in device backups" }, { status: 403 });
  }
  const parsed = saleContract.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid sale receipt", issues: parsed.error.flatten() }, { status: 400 });
  const sale = parsed.data;
  if (sale.deviceId !== auth.deviceId) return NextResponse.json({ error: "Sale belongs to another device" }, { status: 403 });

  const [schema] = await db.$queryRaw<Array<{ ready: boolean }>>`SELECT to_regclass('pos.sale_sync_receipts') IS NOT NULL AS ready`;
  if (!schema?.ready || !await employeeAccessReady()) return NextResponse.json({ error: "NCT sales synchronization is awaiting approved database setup. The sale remains on the POS." }, { status: 503 });

  const hash = createHash("sha256").update(JSON.stringify(sale)).digest("hex");
  try {
    const result = await db.$transaction(async (tx) => {
      // Serialize concurrent retries before inspecting the durable receipt key.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${auth.deviceId}:${sale.clientSaleId}`}))::text`;
      const [existing] = await tx.$queryRaw<Array<{ saleId: number; payloadHash: string }>>`
        SELECT pos_sale_id AS "saleId", payload_hash AS "payloadHash" FROM pos.sale_sync_receipts
        WHERE device_id = ${auth.deviceId} AND client_sale_id = ${sale.clientSaleId}::uuid`;
      if (existing) {
        if (existing.payloadHash !== hash) throw new SaleError("This sale ID was already used with a different receipt", 409);
        return { saleId: existing.saleId, duplicate: true };
      }
      const device = await tx.posDevice.findUnique({ where: { id: auth.deviceId! }, select: { branchId: true } });
      if (!device || Number(device.branchId) !== sale.branchId) throw new SaleError("Sale branch does not match the registered device", 409);
      const [employee] = await tx.$queryRaw<Array<{ id: number }>>`SELECT employee_id AS id FROM pos.employee_pos_access WHERE pos_user_id = ${sale.cashierId}`;
      if (!employee) throw new SaleError("Sale cashier is not linked to OMS Employees", 422);
      const variations = await tx.productVariation.findMany({ where: { id: { in: sale.items.map((i) => i.variationId) } }, select: { id: true, stockGroupId: true } });
      const byId = new Map(variations.map((v) => [v.id, v]));
      const lines = sale.items.map((item) => {
        const variation = byId.get(item.variationId);
        if (!variation) throw new SaleError(`Variation ${item.variationId} not found`, 422);
        return { ...item, groupKey: variation.stockGroupId?.trim() ? `group:${variation.stockGroupId}` : `var:${variation.id}` };
      });
      const quantities = new Map<string, number>();
      for (const item of lines) quantities.set(item.groupKey, (quantities.get(item.groupKey) ?? 0) + item.qty);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM pos.pos_inventories WHERE "deviceId"=${auth.deviceId} AND "groupKey" IN (${Prisma.join([...quantities.keys()])}) ORDER BY "groupKey" FOR UPDATE`);
      const unreceived = await pendingNctAllocations(tx, [auth.deviceId]);
      // Stable order avoids deadlocks between distinct concurrent sales.
      for (const [groupKey, qty] of [...quantities].sort(([a], [b]) => a.localeCompare(b))) {
        const updated = await tx.posInventory.updateMany({
          where: { groupKey, deviceId: auth.deviceId!, qty: { gte: qty + (unreceived.get(`${auth.deviceId}:${groupKey}`) ?? 0) } }, data: { qty: { decrement: qty } },
        });
        if (updated.count !== 1) throw new SaleError(`Insufficient stock for ${groupKey}; sale preserved for reconciliation`, 409);
      }
      const created = await tx.posSale.create({ data: {
        created_at: new Date(sale.createdAt), cashierUserId: employee.id,
        total_amount: new Prisma.Decimal(sale.total), payment_method: sale.paymentMethod,
        items: { create: lines.map((line) => ({ variationId: line.variationId, groupKey: line.groupKey, qty: line.qty,
          unit_price: new Prisma.Decimal(line.unitPrice), subtotal: new Prisma.Decimal(line.unitPrice).mul(line.qty) })) },
      } });
      await tx.$executeRaw`
        INSERT INTO pos.sale_sync_receipts
        (device_id, client_sale_id, pos_sale_id, receipt_number, branch_id, cashier_id, cashier_name, payload_hash, subtotal, discount, tax, occurred_at)
        VALUES (${auth.deviceId}, ${sale.clientSaleId}::uuid, ${created.id}, ${sale.receiptNumber}, ${BigInt(sale.branchId)},
          ${sale.cashierId}, ${sale.cashierName}, ${hash}, ${sale.subtotal}, ${sale.discount}, ${sale.tax}, ${new Date(sale.createdAt)})`;
      return { saleId: created.id, duplicate: false };
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof SaleError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Receipt identity already exists; review the local receipt before retrying" }, { status: 409 });
    console.error("NCT POS sale sync failed", error);
    return NextResponse.json({ error: "Sale synchronization failed; retry later" }, { status: 503 });
  }
}

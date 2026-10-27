import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorizedPOS } from "~/lib/pos-auth";
import { db } from "~/server/db";
import { posStorageScope } from "~/server/pos/scope";



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

  const items = await db.posInventory.findMany({
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
      ...(nct ? { complete: !search } : {}),
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

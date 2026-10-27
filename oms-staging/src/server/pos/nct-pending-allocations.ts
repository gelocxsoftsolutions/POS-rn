import type { Prisma } from "@prisma/client";

// Approval credits the device bucket before physical receipt. Keep that stock
// unavailable until the matching inbound transfer is actually received.
export async function pendingNctAllocations(
  database: Pick<Prisma.TransactionClient, "inventoryTransfer" | "productVariation">,
  deviceIds: string[],
) {
  const transfers = await database.inventoryTransfer.findMany({
    where: {
      targetDeviceId: { in: deviceIds },
      direction: "INVENTORY_TO_POS",
      status: { in: ["APPROVED", "IN_TRANSIT"] },
    },
    select: { targetDeviceId: true, items: { select: { variationId: true, allocatedQty: true } } },
  });
  const variations = await database.productVariation.findMany({
    where: {
      id: {
        in: [
          ...new Set(
            transfers.flatMap((transfer) => transfer.items.map((item) => item.variationId)),
          ),
        ],
      },
    },
    select: { id: true, stockGroupId: true },
  });
  const groups = new Map(
    variations.map((variation) => [
      variation.id,
      variation.stockGroupId?.trim() ? `group:${variation.stockGroupId}` : `var:${variation.id}`,
    ]),
  );
  const reserved = new Map<string, number>();
  for (const transfer of transfers)
    for (const item of transfer.items) {
      const key = `${transfer.targetDeviceId}:${groups.get(item.variationId) ?? `var:${item.variationId}`}`;
      reserved.set(key, (reserved.get(key) ?? 0) + item.allocatedQty);
    }
  return reserved;
}

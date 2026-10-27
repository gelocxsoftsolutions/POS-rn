import { v4 as uuid } from "uuid";
import { api } from "@/lib/api/http";
import { query } from "@/lib/db/connection";
import { localTransaction } from "@/lib/db/local-operation";
import { serializeNctSync } from "./nct-sync-coordinator";
import { TransferRepository } from "@/lib/repositories/transfer.repository";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useCashierStore } from "@/lib/stores/cashier-store";

export async function receiveNctTransfer(
  id: string,
  checklist: Array<{ itemId: string; actualQty: number; notes?: string }> | undefined,
  receivedByName: string,
  omsTransferId?: number,
) {
  return serializeNctSync(async () => {
    const transfer = await TransferRepository.findById(id);
    if (!transfer) return null;
    if (transfer.status === "RECEIVED") return transfer;
    if (["REJECTED", "CANCELLED", "COMPLETED"].includes(transfer.status))
      throw new Error("This transfer cannot be received.");
    const device = useDeviceStore.getState().device,
      actor = useCashierStore.getState().session;
    if (!device.deviceId) throw new Error("Reconnect this device before receiving products.");
    const quantities = transfer.items.map((item) => {
      const override = checklist?.find((c) => c.itemId === item.id);
      return { item, actualQty: override?.actualQty ?? item.allocatedQty, notes: override?.notes };
    });
    if (
      checklist &&
      (checklist.length !== transfer.items.length ||
        new Set(checklist.map((c) => c.itemId)).size !== checklist.length ||
        checklist.some((c) => !transfer.items.some((i) => i.id === c.itemId)))
    )
      throw new Error("Complete the checklist for every transferred item.");
    if (
      quantities.some(
        ({ item, actualQty, notes }) =>
          !Number.isInteger(actualQty) ||
          actualQty < 0 ||
          actualQty > item.allocatedQty ||
          !Number.isInteger(Number(item.productSku)) ||
          Number(item.productSku) <= 0 ||
          (actualQty !== item.allocatedQty && !notes?.trim()),
      )
    )
      throw new Error(
        "Use valid received quantities and explain discrepancies. Products must be linked to OMS.",
      );
    const grouped = new Map<number, { variationId: number; actualQty: number; notes?: string }>();
    for (const row of quantities) {
      const key = Number(row.item.productSku),
        prior = grouped.get(key);
      grouped.set(key, {
        variationId: key,
        actualQty: (prior?.actualQty ?? 0) + row.actualQty,
        notes: [prior?.notes, row.notes].filter(Boolean).join("; ") || undefined,
      });
    }
    const pending = await query<{ id: string }>(
      "SELECT id FROM Sale WHERE synced=0 AND status='COMPLETED' AND originMode='NCT_DEPENDENT' LIMIT 1001",
    );
    if (pending.length > 1000)
      throw new Error("Sync the pending sales backlog before receiving this transfer.");
    const response = await api.post<{
      success: boolean;
      balances: Array<{ variationId: number; qty: number }>;
      acknowledgedSaleIds: string[];
    }>("/api/pos/transfers/receive", {
      transferId: omsTransferId,
      transferNumber: transfer.transferNumber,
      deviceId: device.deviceId,
      cashierId: actor?.cashierId,
      cashierName: receivedByName,
      items: [...grouped.values()],
      pendingSaleIds: pending.map((s) => s.id),
    });
    if (
      !response.ok ||
      !response.data?.success ||
      !Array.isArray(response.data.balances) ||
      !Array.isArray(response.data.acknowledgedSaleIds)
    )
      throw new Error(
        response.error?.error ??
          "OMS did not acknowledge receipt. Your checklist was retained for retry.",
      );
    const snapshot = response.data,
      ack = snapshot.acknowledgedSaleIds.filter((candidate) =>
        pending.some((s) => s.id === candidate),
      );
    const balances = new Map(snapshot.balances.map((b) => [String(b.variationId), b.qty]));
    await localTransaction(async (tx) => {
      const current = await tx.getFirstAsync<{ status: string }>(
        "SELECT status FROM InventoryTransfer WHERE id=?",
        [id],
      );
      if (current?.status === "RECEIVED") return;
      const products = await tx.getAllAsync<{ id: string; sku: string; availableQty: number }>(
        "SELECT p.id,p.sku,COALESCE(i.availableQty,0) availableQty FROM Product p LEFT JOIN PosInventory i ON i.productId=p.id WHERE p.sku<>'' AND p.sku NOT GLOB '*[^0-9]*'",
      );
      const before = new Map(products.map((p) => [p.id, p.availableQty]));
      const after = new Map<string, number>();
      const now = new Date().toISOString();
      for (const product of products) {
        const unsynced = await tx.getFirstAsync<{ qty: number }>(
          `SELECT COALESCE(SUM(i.quantity),0) qty FROM SaleItem i JOIN Sale s ON s.id=i.saleId WHERE i.productId=? AND s.status='COMPLETED' AND s.synced=0 ${ack.length ? `AND s.id NOT IN (${ack.map(() => "?").join(",")})` : ""}`,
          [product.id, ...ack],
        );
        const qty = Math.max(0, (balances.get(product.sku) ?? 0) - (unsynced?.qty ?? 0));
        after.set(product.id, qty);
        await tx.runAsync(
          "INSERT INTO PosInventory(id,productId,availableQty) VALUES (?,?,?) ON CONFLICT(productId) DO UPDATE SET availableQty=excluded.availableQty,updatedAt=?",
          [uuid(), product.id, qty, now],
        );
      }
      for (const row of quantities) {
        await tx.runAsync(
          "UPDATE InventoryTransferItem SET receivedQty=?,remarks=?,updatedAt=? WHERE id=?",
          [row.actualQty, row.notes ?? null, now, row.item.id],
        );
        await tx.runAsync(
          "INSERT INTO InventoryLedger(id,movementType,referenceNumber,productId,quantity,balanceBefore,balanceAfter,createdById,createdByName,createdAt) VALUES (?,'TRANSFER_IN',?,?,?,?,?,?,?,?)",
          [
            uuid(),
            id,
            row.item.productId,
            row.actualQty,
            before.get(row.item.productId) ?? 0,
            after.get(row.item.productId) ?? 0,
            actor?.cashierId ?? null,
            receivedByName,
            now,
          ],
        );
      }
      await tx.runAsync(
        "UPDATE InventoryTransfer SET status='RECEIVED',receivedById=?,receivedByName=?,receivedAt=?,updatedAt=? WHERE id=?",
        [actor?.cashierId ?? null, receivedByName, now, now, id],
      );
    });
    return TransferRepository.findById(id);
  });
}

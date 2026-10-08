import { SaleRepository } from "@/lib/repositories/sale.repository";
import { SyncQueueRepository } from "@/lib/repositories/sync-queue.repository";
import { SyncQueueService } from "@/lib/services/sync-queue.service";
import { OmsSyncService } from "@/lib/services/oms-sync.service";
import type { SaleSyncStatus } from "@/lib/types/sales";

export interface RetrySaleResult {
  success: boolean;
  status: SaleSyncStatus;
  error?: string;
}

export const SaleSyncService = {
  /**
   * Re-push a locally stored sale to the OMS. Idempotent: the OMS dedupes on
   * receiptNumber, so retrying a sale that already landed will not create a
   * duplicate PosSale.
   */
  async retrySale(saleId: string): Promise<RetrySaleResult> {
    const sale = await SaleRepository.findById(saleId);
    if (!sale) {
      return { success: false, status: "UNSYNCED", error: "Sale not found" };
    }

    const rawItems = sale.items ?? [];
    const items = rawItems
      .map((item) => ({ variationId: Number(item.sku), qty: Number(item.quantity) }))
      .filter((item) => Number.isFinite(item.variationId) && item.variationId > 0 && item.qty > 0);

    if (rawItems.length === 0 || items.length !== rawItems.length) {
      const reason = "Not recorded in OMS: sale items are not linked to OMS products.";
      await SyncQueueService.enqueue("Sale", saleId, "CREATE", {
        receiptNumber: sale.receiptNumber,
        items: [],
      });
      await SyncQueueRepository.markEntityFailed("Sale", saleId, reason);
      return { success: false, status: "FAILED", error: reason };
    }

    const payload = {
      receiptNumber: sale.receiptNumber,
      cashierId: sale.cashierId,
      cashierName: sale.cashierName,
      cashierUserId: sale.cashierId,
      paymentMethod: sale.paymentMethod,
      total: sale.total,
      items,
      payments:
        sale.payments?.map((p) => ({ method: p.method, amount: p.amount })) ?? [
          { method: sale.paymentMethod, amount: sale.total },
        ],
      deviceId: sale.deviceId ?? null,
      branchId: sale.branchId ?? null,
    };

    try {
      const result = await OmsSyncService.pushSale(payload as any);
      if (result.success) {
        await SaleRepository.markSynced(saleId);
        await SyncQueueRepository.markEntitySynced("Sale", saleId);
        return { success: true, status: "SYNCED" };
      }

      const error = result.error ?? `HTTP ${result.status}`;
      await SyncQueueService.enqueue("Sale", saleId, "CREATE", payload);
      if (!result.retryable) {
        await SyncQueueRepository.markEntityFailed("Sale", saleId, error);
        return { success: false, status: "FAILED", error };
      }
      await SyncQueueRepository.reopenByEntity("Sale", saleId);
      return { success: false, status: "PENDING", error };
    } catch (e: any) {
      const error = e?.message ?? "Network error";
      await SyncQueueService.enqueue("Sale", saleId, "CREATE", payload);
      await SyncQueueRepository.reopenByEntity("Sale", saleId);
      return { success: false, status: "PENDING", error };
    }
  },
};

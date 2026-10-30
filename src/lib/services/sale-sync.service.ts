import { SaleRepository } from "@/lib/repositories/sale.repository";
import { SyncQueueRepository } from "@/lib/repositories/sync-queue.repository";
import { SyncQueueService } from "@/lib/services/sync-queue.service";
import { OmsSyncService } from "@/lib/services/oms-sync.service";
import { nctSalePayload } from "@/lib/services/nct-sale-payload";
import { isNctPos } from "./nct-scope";
import { queryFirst } from "@/lib/db/connection";
import { acquireSaleSync, releaseSaleSync } from "@/lib/services/sale-sync-lock";
import type { SaleSyncStatus } from "@/lib/types/sales";

export interface RetrySaleResult { success: boolean; status: SaleSyncStatus; error?: string }

export const SaleSyncService = {
  // Retries preserve the persisted UUID, receipt prices, time and device identity.
  async retrySale(saleId: string): Promise<RetrySaleResult> {
    if (!isNctPos()) {
      return { success: false, status: "UNSYNCED", error: "Only NCT-dependent receipts can be synchronized." };
    }
    if (!acquireSaleSync(saleId)) return { success: false, status: "PENDING", error: "Sale is already syncing." };
    try {
      const sale = await SaleRepository.findById(saleId);
      if (!sale) return { success: false, status: "UNSYNCED", error: "Sale not found" };
      if (sale.synced) {
        await SyncQueueRepository.markEntitySynced("Sale", saleId);
        return { success: true, status: "SYNCED" };
      }
      const origin = await queryFirst<{ originMode: string }>("SELECT originMode FROM Sale WHERE id = ?", [saleId]);
      if (origin?.originMode !== "NCT_DEPENDENT") return { success: false, status: "UNSYNCED", error: "Independent sales cannot be replayed into OMS." };
      let payload: ReturnType<typeof nctSalePayload>;
      try { payload = nctSalePayload(sale); }
      catch (error) {
        const message = error instanceof Error ? error.message : "Invalid sale";
        await SyncQueueService.enqueue("Sale", saleId, "CREATE", { receiptNumber: sale.receiptNumber });
        await SyncQueueRepository.markEntityFailed("Sale", saleId, message);
        return { success: false, status: "FAILED", error: message };
      }
      const result = await OmsSyncService.pushSale(payload);
      if (result.success) {
        await SaleRepository.markSynced(saleId);
        await SyncQueueRepository.markEntitySynced("Sale", saleId);
        return { success: true, status: "SYNCED" };
      }
      const message = result.error ?? `HTTP ${result.status}`;
      await SyncQueueService.enqueue("Sale", saleId, "CREATE", payload);
      if (result.retryable) await SyncQueueRepository.reopenByEntity("Sale", saleId);
      else await SyncQueueRepository.markEntityFailed("Sale", saleId, message);
      return { success: false, status: result.retryable ? "PENDING" : "FAILED", error: message };
    } catch (error) {
      return { success: false, status: "PENDING", error: error instanceof Error ? error.message : "Network error" };
    } finally { releaseSaleSync(saleId); }
  },
};

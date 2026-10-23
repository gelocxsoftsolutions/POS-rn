import { OmsSyncService } from "@/lib/services/oms-sync.service";
import { SyncQueueService } from "@/lib/services/sync-queue.service";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useNetworkStore } from "@/lib/services/network.service";
import { useSyncStore } from "@/lib/stores/sync-store";
import { SaleRepository } from "@/lib/repositories/sale.repository";
import { acquireSaleSync, releaseSaleSync } from "@/lib/services/sale-sync-lock";
import { BusinessConfigurationService } from "@/lib/business/configuration.service";
import { queryFirst } from "@/lib/db/connection";

const SYNC_INTERVAL_MS = 15_000;
let syncTimer: ReturnType<typeof setInterval> | null = null;

async function pushUnsyncedSales(): Promise<void> {
  try {
    const unsynced = await SaleRepository.findUnsynced(50);
    for (const sale of unsynced) {
      const identity = await queryFirst<{ originMode: string }>(
        "SELECT originMode FROM Sale WHERE id = ?",
        [sale.id]
      );
      // Independent sales are summarized through EOD uploads. They must never
      // be replayed into operational OMS sale tables after a later mode switch.
      if (identity?.originMode === "INDEPENDENT") continue;
      if (!acquireSaleSync(sale.id)) continue;
      try {
      const rawItems = sale.items ?? [];
      const items = rawItems
        .map((item) => ({
          variationId: Number(item.sku),
          qty: Number(item.quantity),
        }))
        .filter((item) => Number.isFinite(item.variationId) && item.variationId > 0 && item.qty > 0);

      // Never push a partial sale. If any line is not linked to an OMS variation,
      // keep the whole sale as Failed with a visible reason.
      if (rawItems.length === 0 || items.length !== rawItems.length) {
        const bad = rawItems
          .filter((item) => !Number.isFinite(Number(item.sku)) || Number(item.sku) <= 0)
          .map((item) => item.sku ?? item.productName ?? "unknown item");
        const reason = `Not recorded in OMS: ${bad.length > 0 ? bad.join(", ") : "sale has no items"} not linked to an OMS product.`;
        const queued = await SyncQueueService.enqueue("Sale", sale.id, "CREATE", {
          receiptNumber: sale.receiptNumber,
          items: [],
        });
        if (queued) {
          const { SyncQueueRepository } = await import("@/lib/repositories/sync-queue.repository");
          await SyncQueueRepository.markEntityFailed("Sale", sale.id, reason);
        }
        continue;
      }

      const payload = {
        receiptNumber: sale.receiptNumber,
        cashierId: sale.cashierId,
        cashierName: sale.cashierName,
        cashierUserId: sale.cashierId,
        paymentMethod: sale.paymentMethod,
        total: sale.total,
        items,
        payments: sale.payments?.map((p: any) => ({
          method: p.method,
          amount: p.amount,
        })) ?? [{ method: sale.paymentMethod, amount: sale.total }],
        deviceId: sale.deviceId ?? null,
        branchId: sale.branchId ?? null,
      };

      const pushResult = await OmsSyncService.pushSale(payload);
      if (pushResult.success) {
        await SaleRepository.markSynced(sale.id);
      } else {
        const queued = await SyncQueueService.enqueue("Sale", sale.id, "CREATE", payload);
        if (queued && !pushResult.retryable) {
          const { SyncQueueRepository } = await import("@/lib/repositories/sync-queue.repository");
          await SyncQueueRepository.markEntityFailed(
            "Sale",
            sale.id,
            pushResult.error ?? `HTTP ${pushResult.status}`
          );
        }
      }
      } finally {
        releaseSaleSync(sale.id);
      }
    }
  } catch {
    // non-blocking
  }
}

async function processSyncQueue(): Promise<void> {
  try {
    const result = await SyncQueueService.processPending();
    if (result.processed > 0 || result.failed > 0) {
      await useSyncStore.getState().refreshPendingCount();
    }
  } catch {
    // non-blocking
  }
}

async function syncFromOms(): Promise<void> {
  try {
    if (!BusinessConfigurationService.capabilities().importNctCatalog) return;
    const device = useDeviceStore.getState().device;
    if (!device.deviceId) return;

    await OmsSyncService.syncInventory(device.deviceId);
    if (device.branchId) {
      await OmsSyncService.syncBranchProducts(device.branchId);
    }
    await OmsSyncService.syncPendingTransfers(device.deviceId);
  } catch {
    // non-blocking
  }
}

export async function runSyncCycle(): Promise<void> {
  const isOnline = useNetworkStore.getState().isOnline;
  if (!isOnline) return;

  useSyncStore.getState().setIsSyncing(true);
  try {
    await pushUnsyncedSales();
    await processSyncQueue();
    await syncFromOms();
    useSyncStore.getState().setLastSyncTime(new Date().toISOString());
    await useSyncStore.getState().refreshPendingCount();
  } finally {
    useSyncStore.getState().setIsSyncing(false);
  }
}

export function startBackgroundSync(): void {
  if (syncTimer) return;

  // Initial sync after 5s
  setTimeout(() => {
    runSyncCycle().catch(() => {});
  }, 5000);

  syncTimer = setInterval(() => {
    runSyncCycle().catch(() => {});
  }, SYNC_INTERVAL_MS);
}

export function stopBackgroundSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

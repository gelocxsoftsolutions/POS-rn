import { OmsSyncService } from "@/lib/services/oms-sync.service";
import { SyncQueueService } from "@/lib/services/sync-queue.service";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useNetworkStore } from "@/lib/services/network.service";
import { useSyncStore } from "@/lib/stores/sync-store";
import { SaleRepository } from "@/lib/repositories/sale.repository";

const SYNC_INTERVAL_MS = 15_000;
let syncTimer: ReturnType<typeof setInterval> | null = null;

async function pushUnsyncedSales(): Promise<void> {
  try {
    const unsynced = await SaleRepository.findUnsynced(50);
    for (const sale of unsynced) {
      const items = (sale.items ?? [])
        .map((item) => ({
          variationId: Number(item.sku),
          qty: Number(item.quantity),
        }))
        .filter((item) => Number.isFinite(item.variationId) && item.variationId > 0 && item.qty > 0);

      if (items.length === 0) continue;

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

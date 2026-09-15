import { OmsSyncService } from "@/lib/services/oms-sync.service";
import { SyncQueueService } from "@/lib/services/sync-queue.service";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useNetworkStore } from "@/lib/services/network.service";
import { useSyncStore } from "@/lib/stores/sync-store";
import { SaleRepository } from "@/lib/repositories/sale.repository";

const SYNC_INTERVAL_MS = 30_000;
let syncTimer: ReturnType<typeof setInterval> | null = null;

async function pushUnsyncedSales(): Promise<void> {
  try {
    const unsynced = await SaleRepository.findUnsynced(50);
    for (const sale of unsynced) {
      const payload = {
        receiptNumber: sale.receiptNumber,
        cashierId: sale.cashierId,
        cashierName: sale.cashierName,
        total: sale.total,
        items: (sale.items ?? []).map((item: any) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
        payments: sale.payments?.map((p: any) => ({
          method: p.method,
          amount: p.amount,
        })) ?? [{ method: sale.paymentMethod, amount: sale.total }],
      };

      const pushed = await OmsSyncService.pushSale(payload);
      if (pushed) {
        await SaleRepository.markSynced(sale.id);
      } else {
        await SyncQueueService.enqueue("Sale", sale.id, "CREATE", payload);
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

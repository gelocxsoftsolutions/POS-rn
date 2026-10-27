import { OmsSyncService } from "./oms-sync.service";
import { SyncQueueService } from "./sync-queue.service";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useNetworkStore } from "./network.service";
import { useSyncStore } from "@/lib/stores/sync-store";
import { query } from "@/lib/db/connection";
import { SaleSyncService } from "./sale-sync.service";
import { EmployeeSyncService } from "./employee-sync.service";
import { syncNctAuditLogs } from "./audit-sync.service";
import { syncNctEndOfDay } from "./end-of-day-sync.service";
import { isNctPos } from "./nct-scope";

async function pushNewNctSales() {
  const pending = await query<{ id: string }>(
    `SELECT s.id FROM Sale s WHERE s.synced=0 AND s.status='COMPLETED'
     AND s.originMode='NCT_DEPENDENT'
     AND NOT EXISTS (SELECT 1 FROM SyncQueue q WHERE q.entityType='Sale'
       AND q.entityId=s.id AND q.status IN ('PENDING','PROCESSING','FAILED'))
     ORDER BY s.createdAt LIMIT 50`,
  );
  for (const sale of pending) await SaleSyncService.retrySale(sale.id);
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
export async function runSyncCycle(): Promise<void> {
  if (running || !isNctPos() || !useNetworkStore.getState().isOnline || !useDeviceStore.getState().device.deviceId) return;
  running = true;
  useSyncStore.getState().setIsSyncing(true);
  try {
    // Queue retries own queued sales; discovery owns only receipts without jobs.
    await SyncQueueService.processPending();
    await pushNewNctSales();
    await syncNctAuditLogs();
    await syncNctEndOfDay();
    await EmployeeSyncService.refresh();
    const device = useDeviceStore.getState().device;
    if (device.deviceId) {
      await OmsSyncService.syncPendingTransfers(device.deviceId);
      await OmsSyncService.syncInventory(device.deviceId);
      if (device.branchId) await OmsSyncService.syncBranchProducts(device.branchId);
    }
    useSyncStore.getState().setLastSyncTime(new Date().toISOString());
  } finally {
    running = false;
    useSyncStore.getState().setIsSyncing(false);
    await useSyncStore.getState().refreshPendingCount();
  }
}
export function startBackgroundSync(): void {
  if (timer) return;
  void runSyncCycle().catch(() => {});
  timer = setInterval(() => { void runSyncCycle().catch(() => {}); }, 15000);
}
export function stopBackgroundSync(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

import { OmsSyncService } from "@/lib/services/oms-sync.service";
import { SyncQueueService } from "@/lib/services/sync-queue.service";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useNetworkStore } from "@/lib/services/network.service";
import { useSyncStore } from "@/lib/stores/sync-store";
import { BusinessConfigurationService } from "@/lib/business/configuration.service";
import { getCloudConnection, reportBackupStatus } from "@/lib/services/dealership-cloud.service";
import { useBackupSettingsStore } from "@/lib/stores/backup-settings-store";
import { nextBackupAt } from "@/lib/backup/schedule";
import { getApiConfig } from "@/lib/api/http";
import { query } from "@/lib/db/connection";
import { SaleSyncService } from "@/lib/services/sale-sync.service";
import { EmployeeSyncService } from "./employee-sync.service";
import { syncNctAuditLogs } from "./audit-sync.service";

async function pushNctSales() {
  const pending = await query<{ id: string }>(
    `SELECT s.id FROM Sale s WHERE s.synced = 0 AND s.status = 'COMPLETED'
     AND s.originMode = 'NCT_DEPENDENT'
     AND NOT EXISTS (SELECT 1 FROM SyncQueue q WHERE q.entityType = 'Sale' AND q.entityId = s.id AND q.status = 'FAILED')
     ORDER BY s.createdAt ASC LIMIT 50`
  );
  for (const sale of pending) await SaleSyncService.retrySale(sale.id);
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
export async function runSyncCycle(): Promise<void> {
  const nct = !getApiConfig().dealership && BusinessConfigurationService.current().operatingMode === "NCT_DEPENDENT";
  if (running || !useNetworkStore.getState().isOnline || (!nct && !getCloudConnection())) return;
  running = true;
  useSyncStore.getState().setIsSyncing(true);
  try {
    if (nct) {
      await pushNctSales();
      await syncNctAuditLogs();
      await EmployeeSyncService.refresh();
    }
    await SyncQueueService.processPending();
    const backup = useBackupSettingsStore.getState();
    const stats = await SyncQueueService.getStats();
    if (backup.hydrated) await reportBackupStatus({
      enabled: backup.autoBackupEnabled, mode: backup.scheduleMode, intervalHours: backup.autoBackupIntervalHours,
      dailyTime: backup.dailyTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Device local time",
      nextBackupAt: nextBackupAt(backup)?.toISOString() ?? null, lastBackupAt: backup.lastAutoBackupAt,
      pending: stats.pending + stats.processing, failed: stats.failed, error: backup.lastCloudError?.slice(0, 1000) ?? null,
    }).catch(() => {});
    if (BusinessConfigurationService.capabilities().importNctCatalog) {
      const device = useDeviceStore.getState().device;
      if (device.deviceId) {
        await OmsSyncService.syncInventory(device.deviceId);
        if (device.branchId) await OmsSyncService.syncBranchProducts(device.branchId);
        await OmsSyncService.syncPendingTransfers(device.deviceId);
      }
    }
    useSyncStore.getState().setLastSyncTime(new Date().toISOString());
    await useSyncStore.getState().refreshPendingCount();
  } finally {
    running = false;
    useSyncStore.getState().setIsSyncing(false);
  }
}
export function startBackgroundSync(): void {
  if (timer) return;
  void runSyncCycle().catch(() => {});
  timer = setInterval(() => { runSyncCycle().catch(() => {}); }, 15000);
}
export function stopBackgroundSync(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

import { OmsSyncService } from "@/lib/services/oms-sync.service";
import { SyncQueueService } from "@/lib/services/sync-queue.service";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useNetworkStore } from "@/lib/services/network.service";
import { useSyncStore } from "@/lib/stores/sync-store";
import { BusinessConfigurationService } from "@/lib/business/configuration.service";
import { getCloudConnection } from "@/lib/services/dealership-cloud.service";

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
export async function runSyncCycle(): Promise<void> {
  if (running || !useNetworkStore.getState().isOnline || !getCloudConnection()) return;
  running = true;
  useSyncStore.getState().setIsSyncing(true);
  try {
    await SyncQueueService.processPending();
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
  timer = setInterval(() => { runSyncCycle().catch(() => {}); }, 15000);
}
export function stopBackgroundSync(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

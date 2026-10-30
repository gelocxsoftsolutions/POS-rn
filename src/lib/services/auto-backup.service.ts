import { RecoveryService } from "@/lib/backup/recovery.service";
import { useBackupSettingsStore, cachedBranchBackupTime } from "@/lib/stores/backup-settings-store";
import { useBackupListStore } from "@/lib/stores/backup-list-store";
import { SyncQueueService } from "./sync-queue.service";
import { AppState } from "react-native";
import type { NativeEventSubscription } from "react-native";
import { isNctPos } from "./nct-scope";
import { nextNctBackupAt, nctBackupReference, philippineDate } from "@/lib/backup/nct-schedule";
import { BackupScheduleService } from "./backup-schedule.service";
import { useDeviceStore } from "@/lib/stores/device-store";

const CHECK_INTERVAL_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
let resumeListener: NativeEventSubscription | null = null;

export async function runScheduledBackupCheck(): Promise<void> {
  if (running) return;
  const settings = useBackupSettingsStore.getState();
  if (!settings.hydrated || AppState.currentState !== "active") return;
  if (!isNctPos()) return;
  if (!useDeviceStore.getState().device.deviceId) return;
  running = true;
  try {
    // Configuration refresh failure must never stop offline scheduled backups.
    await BackupScheduleService.refresh().catch(() => null);
    const current = useBackupSettingsStore.getState();
    const now = new Date();
    const time = cachedBranchBackupTime(useDeviceStore.getState().device.branchId);
    const previous = current.lastAutoBackupAt ? new Date(current.lastAutoBackupAt) : null;
    const completedDate = current.lastScheduledDate ?? (previous && Number.isFinite(previous.getTime()) ? philippineDate(previous) : null);
    const next = nextNctBackupAt(current.lastAutoBackupAt, now, time, completedDate);
    if (now.getTime() < next.getTime()) return;
    const reference = nctBackupReference(now, time);
    await RecoveryService.createAutoBackup(reference);
    current.markAutoBackup(reference.slice("nct-daily:".length));
    await useBackupListStore.getState().refresh();
    await SyncQueueService.processPending();
  } catch (error) {
    settings.setCloudError(error instanceof Error ? error.message : "NCT backup could not be queued.");
    // Background auto-backups are best-effort; the scheduler retries next cycle.
  } finally {
    running = false;
  }
}

export function startAutoBackupScheduler(): void {
  if (timer) return;
  runScheduledBackupCheck().catch(() => {});
  timer = setInterval(() => {
    runScheduledBackupCheck().catch(() => {});
  }, CHECK_INTERVAL_MS);
  resumeListener = AppState.addEventListener("change", (state) => { if (state === "active") void runScheduledBackupCheck().catch(() => {}); });
}

export function stopAutoBackupScheduler(): void {
  resumeListener?.remove();
  resumeListener = null;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export async function runAutoBackupNow(): Promise<void> {
  // A user pressing Back Up Now creates a manual backup and keeps the automatic schedule.
  await RecoveryService.createBackup();
  await useBackupListStore.getState().refresh();
  await SyncQueueService.processPending();
}

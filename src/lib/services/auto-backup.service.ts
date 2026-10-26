import { deviceTransitionActive } from "@/lib/business/device-transition";
import { RecoveryService } from "@/lib/backup/recovery.service";
import { useBackupSettingsStore } from "@/lib/stores/backup-settings-store";
import { useBackupListStore } from "@/lib/stores/backup-list-store";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { nextBackupAt } from "@/lib/backup/schedule";
import { SyncQueueService } from "./sync-queue.service";
import { AppState } from "react-native";

const CHECK_INTERVAL_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running || deviceTransitionActive()) return;
  const settings = useBackupSettingsStore.getState();
  const { autoBackupEnabled, markAutoBackup, hydrated } = settings;
  if (!hydrated || AppState.currentState !== "active") return;
  if (!autoBackupEnabled) return;
  if (!useCashierStore.getState().session) return;

  const next = nextBackupAt(settings);
  const due = next && Date.now() >= next.valueOf();
  if (!due) return;

  running = true;
  try {
    await RecoveryService.createAutoBackup();
    markAutoBackup();
    await useBackupListStore.getState().refresh();
    await SyncQueueService.processPending();
  } catch {
    // Background auto-backups are best-effort; the scheduler retries next cycle.
  } finally {
    running = false;
  }
}

export function startAutoBackupScheduler(): void {
  if (timer) return;
  tick().catch(() => {});
  timer = setInterval(() => {
    tick().catch(() => {});
  }, CHECK_INTERVAL_MS);
}

export function stopAutoBackupScheduler(): void {
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

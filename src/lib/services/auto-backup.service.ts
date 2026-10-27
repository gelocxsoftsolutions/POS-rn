import { RecoveryService } from "@/lib/backup/recovery.service";
import { useBackupSettingsStore } from "@/lib/stores/backup-settings-store";
import { useBackupListStore } from "@/lib/stores/backup-list-store";
import { SyncQueueService } from "./sync-queue.service";
import { AppState } from "react-native";
import type { NativeEventSubscription } from "react-native";
import { isNctPos } from "./nct-scope";
import { nextNctBackupAt } from "@/lib/backup/nct-schedule";

const CHECK_INTERVAL_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
let resumeListener: NativeEventSubscription | null = null;

async function tick(): Promise<void> {
  if (running) return;
  const settings = useBackupSettingsStore.getState();
  const { markAutoBackup, hydrated } = settings;
  if (!hydrated || AppState.currentState !== "active") return;
  if (!isNctPos()) return;

  const next = nextNctBackupAt(settings.lastAutoBackupAt);
  const due = next && Date.now() >= next.valueOf();
  if (!due) return;

  running = true;
  try {
    await RecoveryService.createAutoBackup();
    markAutoBackup();
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
  tick().catch(() => {});
  timer = setInterval(() => {
    tick().catch(() => {});
  }, CHECK_INTERVAL_MS);
  resumeListener = AppState.addEventListener("change", (state) => { if (state === "active") void tick(); });
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

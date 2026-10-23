import { RecoveryService } from "@/lib/backup/recovery.service";
import { useBackupSettingsStore } from "@/lib/stores/backup-settings-store";
import { useBackupListStore } from "@/lib/stores/backup-list-store";
import { useCashierStore } from "@/lib/stores/cashier-store";

const CHECK_INTERVAL_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  const { autoBackupEnabled, autoBackupIntervalHours, lastAutoBackupAt, markAutoBackup } =
    useBackupSettingsStore.getState();
  if (!autoBackupEnabled) return;
  if (!useCashierStore.getState().session) return;

  const intervalMs = autoBackupIntervalHours * 3_600_000;
  const due = !lastAutoBackupAt || Date.now() - new Date(lastAutoBackupAt).valueOf() >= intervalMs;
  if (!due) return;

  running = true;
  try {
    await RecoveryService.createAutoBackup();
    markAutoBackup();
    await useBackupListStore.getState().refresh();
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
  await RecoveryService.createAutoBackup();
  useBackupSettingsStore.getState().markAutoBackup();
  await useBackupListStore.getState().refresh();
}

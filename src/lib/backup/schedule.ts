export interface BackupSchedule {
  autoBackupEnabled: boolean;
  autoBackupIntervalHours: number;
  scheduleMode: "INTERVAL" | "DAILY";
  dailyTime: string;
  lastAutoBackupAt: string | null;
}

export function nextBackupAt(settings: BackupSchedule, now = new Date()): Date | null {
  if (!settings.autoBackupEnabled) return null;
  const last = settings.lastAutoBackupAt ? new Date(settings.lastAutoBackupAt) : null;
  if (settings.scheduleMode !== "DAILY") {
    return last && Number.isFinite(last.valueOf()) ? new Date(last.valueOf() + settings.autoBackupIntervalHours * 3600000) : now;
  }
  const [hours, minutes] = settings.dailyTime.split(":").map(Number);
  const next = new Date(last && Number.isFinite(last.valueOf()) ? last : now);
  next.setHours(hours!, minutes!, 0, 0);
  if (last && next <= last) next.setDate(next.getDate() + 1);
  // Without a previous backup, today's scheduled time is due immediately if missed.
  return next;
}

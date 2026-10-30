const OFFSET = 8 * 3600000;
export const DEFAULT_NCT_BACKUP_TIME = "19:00";
export function isBackupTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
export function backupTimeLabel(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}
export function philippineDate(now = new Date()) {
  return new Date(now.getTime() + OFFSET).toISOString().slice(0, 10);
}
export function nextNctBackupAt(lastBackupAt: string | null, now = new Date(), time = DEFAULT_NCT_BACKUP_TIME, completedDate?: string | null) {
  if (!isBackupTime(time)) throw new Error("Use a valid Philippine backup time in HH:mm format.");
  if (completedDate) {
    const latest = nctBackupReference(now, time).slice("nct-daily:".length);
    const nextDate = completedDate >= latest
      ? philippineDate(new Date(new Date(`${completedDate}T12:00:00+08:00`).getTime() + 86400000))
      : latest;
    return new Date(`${nextDate}T${time}:00+08:00`);
  }
  const last = lastBackupAt ? new Date(lastBackupAt) : null;
  const base = last && Number.isFinite(last.getTime()) ? last : now;
  const due = new Date(`${philippineDate(base)}T${time}:00+08:00`);
  // A previous completed local snapshot already covers that Philippine day,
  // even when its configured cutoff is subsequently moved later.
  if (last && due.getTime() <= last.getTime()) due.setUTCDate(due.getUTCDate() + 1);
  return due;
}
export function nctBackupReference(now = new Date(), time = DEFAULT_NCT_BACKUP_TIME) {
  if (!isBackupTime(time)) throw new Error("Use a valid Philippine backup time in HH:mm format.");
  const today = new Date(`${philippineDate(now)}T${time}:00+08:00`);
  return `nct-daily:${philippineDate(now < today ? new Date(now.getTime() - 86400000) : now)}`;
}

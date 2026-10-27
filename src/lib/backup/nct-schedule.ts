const OFFSET = 8 * 3600000;
export function philippineDate(now = new Date()) { return new Date(now.getTime() + OFFSET).toISOString().slice(0, 10); }
export function nextNctBackupAt(lastBackupAt: string | null, now = new Date()) {
  const last = lastBackupAt ? new Date(lastBackupAt) : null;
  const base = last && Number.isFinite(last.getTime()) ? last : now;
  const due = new Date(`${philippineDate(base)}T19:00:00+08:00`);
  if (last && due.getTime() <= last.getTime()) due.setUTCDate(due.getUTCDate() + 1);
  return due;
}
export function nctBackupReference(now = new Date()) {
  const today = new Date(`${philippineDate(now)}T19:00:00+08:00`);
  return `nct-daily:${philippineDate(now < today ? new Date(now.getTime() - 86400000) : now)}`;
}

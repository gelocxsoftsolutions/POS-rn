"use client";
import React, { useCallback, useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

interface Backup { id: string; deviceId: string; source: string; createdAt: string; byteSize: number; schemaVersion: number }
export function NctBackupsTab({ branchId }: { branchId: number }) {
  const [backups, setBackups] = useState<Backup[]>([]), [error, setError] = useState("");
  const [loading, setLoading] = useState(false), [downloading, setDownloading] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/pos/backups?branchId=${branchId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load backups");
      setBackups(data.backups);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load backups"); }
    finally { setLoading(false); }
  }, [branchId]);
  useEffect(() => { void refresh(); }, [refresh]);
  const download = async (backup: Backup) => {
    setDownloading(backup.id); setError("");
    try {
      const response = await fetch(`/api/pos/backups/${backup.id}`, { method: "POST", cache: "no-store" });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error ?? "Backup download failed"); }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${backup.id}.nctposbackup`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : "Backup download failed"); }
    finally { setDownloading(null); }
  };
  return <Card><CardHeader><CardTitle>POS Database Backups</CardTitle>
    <p className="text-sm text-gray-500">Daily at 7 PM Philippine time while POS is active; missed schedules catch up when it reopens. Download a verified backup, then use the matching POS device's Settings → Backup & Restore to import it.</p>
  </CardHeader><CardContent className="space-y-3">
    <Button onClick={() => void refresh()} disabled={loading}>Refresh</Button>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {loading ? <p>Loading backups...</p> : !backups.length ? <p>No verified backups are available for this branch.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead><tr>{["Created (Philippines)", "Device", "Type", "Size", "Restore copy"].map((h) => <th className="p-2" key={h}>{h}</th>)}</tr></thead>
      <tbody>{backups.map((backup) => <tr className="border-t" key={backup.id}><td className="p-2">{new Date(backup.createdAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</td><td className="p-2">{backup.deviceId}</td><td className="p-2">{backup.source}</td><td className="p-2">{(backup.byteSize / 1024 / 1024).toFixed(2)} MiB</td><td className="p-2"><Button disabled={Boolean(downloading)} onClick={() => void download(backup)}>{downloading === backup.id ? "Downloading..." : "Download"}</Button></td></tr>)}</tbody>
    </table></div>}
  </CardContent></Card>;
}

import { SyncQueueRepository } from "@/lib/repositories/sync-queue.repository";
import type { SyncQueueRow, SyncStats } from "@/lib/repositories/sync-queue.repository";
import { queryFirst, execute } from "@/lib/db/connection";
import { File } from "expo-file-system";
import { useBackupSettingsStore } from "@/lib/stores/backup-settings-store";
import { uploadNctBackup } from "./nct-backup.service";
import { SaleSyncService } from "./sale-sync.service";
import { isNctPos } from "./nct-scope";

let inFlight: Promise<{ processed: number; failed: number }> | null = null;
export const SyncQueueService = {
  async enqueue(entityType: string, entityId: string, operation: string, payload?: Record<string, any>, dedupeKey?: string): Promise<SyncQueueRow | null> {
    try { return await SyncQueueRepository.enqueue({ entityType, entityId, operation, payload: payload ? JSON.stringify(payload) : undefined, dedupeKey }); }
    catch { return null; }
  },
  async processPending(): Promise<{ processed: number; failed: number }> {
    if (!isNctPos()) return { processed: 0, failed: 0 };
    if (inFlight) return inFlight;
    inFlight = processNctJobs();
    try { return await inFlight; } finally { inFlight = null; }
  },
  async getStats(): Promise<SyncStats> {
    try { return await SyncQueueRepository.getStats(); }
    catch { return { total: 0, pending: 0, processing: 0, synced: 0, failed: 0 }; }
  },
};

async function processNctJobs(): Promise<{ processed: number; failed: number }> {
  let processed = 0, failed = 0;
  // Deferred returns/unknown jobs stay intact and cannot starve supported jobs.
  const pending = await SyncQueueRepository.getPending(50, ["Sale", "DatabaseBackup", "EndOfDay"]);
  for (const item of pending) {
    if (item.entityType === "Sale") {
      const sale = await queryFirst<{ originMode: string }>("SELECT originMode FROM Sale WHERE id=? AND status='COMPLETED'", [item.entityId]);
      if (!sale || sale.originMode !== "NCT_DEPENDENT") {
        await SyncQueueRepository.markEntityFailed("Sale", item.entityId, "Historical non-NCT or orphaned sale retained locally; not uploaded.");
        failed++; continue;
      }
      const result = await SaleSyncService.retrySale(item.entityId);
      if (result.success) processed++; else failed++;
      continue;
    }
    let payload: Record<string, any>;
    try { payload = JSON.parse(item.payload ?? "{}"); }
    catch { await SyncQueueRepository.markEntityFailed(item.entityType, item.entityId, "Malformed local job; preserved for review."); failed++; continue; }
    if (payload.scope !== "NCT") {
      await SyncQueueRepository.markEntityFailed(item.entityType, item.entityId, "Legacy unscoped cloud job retained locally; not sent to NCT OMS.");
      failed++; continue;
    }
    // Closure delivery has a separate idempotent audit acknowledgement handler.
    if (item.entityType === "EndOfDay") continue;
    await SyncQueueRepository.markProcessing(item.id);
    try {
      const { fileUri, scope: _scope, ...metadata } = payload;
      const contentBase64 = fileUri ? await new File(fileUri).base64() : payload.contentBase64;
      const result = await uploadNctBackup({ ...metadata, contentBase64 });
      await execute("UPDATE BackupManifest SET status='UPLOADED', remoteReference=?, uploadedAt=? WHERE id=?", [result.backupId, new Date().toISOString(), item.entityId]);
      await SyncQueueRepository.markSynced(item.id);
      useBackupSettingsStore.getState().setCloudError(null);
      processed++;
    } catch (error: any) {
      const message = error?.message ?? "NCT backup upload failed";
      useBackupSettingsStore.getState().setCloudError(message);
      if ([400,401,403,409,413].includes(error?.status)) await SyncQueueRepository.markEntityFailed("DatabaseBackup", item.entityId, message);
      else await execute("UPDATE SyncQueue SET status='PENDING',retryCount=retryCount+1,error=?,updatedAt=? WHERE id=?", [message,new Date().toISOString(),item.id]);
      failed++;
    }
  }
  return { processed, failed };
}

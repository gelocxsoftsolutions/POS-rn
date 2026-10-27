import { SyncQueueRepository } from "@/lib/repositories/sync-queue.repository";
import type { SyncQueueRow, SyncStats } from "@/lib/repositories/sync-queue.repository";
import { File } from "expo-file-system";
import { uploadCloudBackup } from "@/lib/services/dealership-cloud.service";
import { useBackupSettingsStore } from "@/lib/stores/backup-settings-store";
import { uploadNctBackup } from "./nct-backup.service";
import { isNctPos } from "./nct-scope";

let inFlight: Promise<{ processed: number; failed: number }> | null = null;

export const SyncQueueService = {
  async enqueue(
    entityType: string,
    entityId: string,
    operation: string,
    payload?: Record<string, any>,
    dedupeKey?: string
  ): Promise<SyncQueueRow | null> {
    try {
      return await SyncQueueRepository.enqueue({
        entityType,
        entityId,
        operation,
        payload: payload ? JSON.stringify(payload) : undefined,
        dedupeKey,
      });
    } catch {
      return null;
    }
  },

  async processPending(): Promise<{ processed: number; failed: number }> {
    if (inFlight) return inFlight;
    inFlight = processBackups();
    try { return await inFlight; } finally { inFlight = null; }
  },

  async getStats(): Promise<SyncStats> {
    try { return await SyncQueueRepository.getStats(); }
    catch { return { total: 0, pending: 0, processing: 0, synced: 0, failed: 0 }; }
  },
};

async function processBackups(): Promise<{ processed: number; failed: number }> {
    let processed = 0, failed = 0;
    const pending = await SyncQueueRepository.getPending(50);
    for (const item of pending) {
      if (item.entityType !== "DatabaseBackup") continue;
      await SyncQueueRepository.markProcessing(item.id);
      try {
        const payload = JSON.parse(item.payload ?? "{}");
        if (payload.scope === "NCT" && !isNctPos()) {
          await SyncQueueRepository.reopen(item.id);
          continue;
        }
        const { fileUri, scope, ...metadata } = payload;
        const contentBase64 = fileUri ? await new File(fileUri).base64() : payload.contentBase64;
        const result = scope === "NCT" ? await uploadNctBackup({ ...metadata, contentBase64 }) : await uploadCloudBackup({ ...metadata, contentBase64 });
        const { execute } = await import("@/lib/db/connection");
        await execute("UPDATE BackupManifest SET status='UPLOADED', remoteReference=?, uploadedAt=? WHERE id=?", [result.backupId,new Date().toISOString(),item.entityId]);
        await SyncQueueRepository.markSynced(item.id);
        useBackupSettingsStore.getState().setCloudError(null);
        processed++;
      } catch (error: any) {
        useBackupSettingsStore.getState().setCloudError(error?.message ?? "Cloud backup upload failed");
        if ([400,401,403,409,413].includes(error?.status)) {
          await SyncQueueRepository.markEntityFailed("DatabaseBackup", item.entityId, error?.message ?? "Cloud backup rejected");
        } else {
          const { execute } = await import("@/lib/db/connection");
          await execute("UPDATE SyncQueue SET status='PENDING', retryCount=retryCount+1, error=?, updatedAt=? WHERE id=?", [error?.message ?? "Cloud backup upload failed",new Date().toISOString(),item.id]);
        }
        failed++;
      }
    }
    return { processed, failed };
}

import { SyncQueueRepository } from "@/lib/repositories/sync-queue.repository";
import { api } from "@/lib/api/http";
import type { SyncQueueRow, SyncStats } from "@/lib/repositories/sync-queue.repository";

export const SyncQueueService = {
  async enqueue(
    entityType: string,
    entityId: string,
    operation: string,
    payload?: Record<string, any>
  ): Promise<SyncQueueRow | null> {
    try {
      return await SyncQueueRepository.enqueue({
        entityType,
        entityId,
        operation,
        payload: payload ? JSON.stringify(payload) : undefined,
      });
    } catch {
      return null;
    }
  },

  async processPending(): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    try {
      const pending = await SyncQueueRepository.getPending(50);

      for (const item of pending) {
        await SyncQueueRepository.markProcessing(item.id);

        try {
          let endpoint = "";
          let method = "POST";

          switch (item.entityType) {
            case "Sale":
              endpoint = "/api/pos/sales";
              method = "POST";
              break;
            case "Inventory":
              endpoint = "/api/pos/inventory";
              method = "PUT";
              break;
            case "Transfer":
              endpoint = "/api/pos/transfers";
              method = "PUT";
              break;
            default:
              endpoint = `/api/pos/${item.entityType.toLowerCase()}`;
          }

          const body = item.payload ? JSON.parse(item.payload) : undefined;
          const res = method === "POST"
            ? await api.post(endpoint, body)
            : await api.put(endpoint, body);

          if (res.ok) {
            await SyncQueueRepository.markSynced(item.id);
            processed++;
          } else {
            await SyncQueueRepository.markFailed(item.id, `HTTP ${res.status}`);
            failed++;
          }
        } catch (e: any) {
          await SyncQueueRepository.markFailed(item.id, e.message ?? "Sync failed");
          failed++;
        }
      }
    } catch {
      // global failure
    }

    return { processed, failed };
  },

  async getStats(): Promise<SyncStats> {
    try {
      return await SyncQueueRepository.getStats();
    } catch {
      return { total: 0, pending: 0, processing: 0, synced: 0, failed: 0 };
    }
  },
};

import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";

export interface SyncQueueRow {
  id: string;
  entityType: string;
  entityId: string;
  operation: string;
  payload: string | null;
  status: string;
  retryCount: number;
  maxRetries: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnqueueInput {
  entityType: string;
  entityId: string;
  operation: string;
  payload?: string;
  maxRetries?: number;
}

export interface SyncStats {
  total: number;
  pending: number;
  processing: number;
  synced: number;
  failed: number;
}

export const SyncQueueRepository = {
  async enqueue(input: EnqueueInput): Promise<SyncQueueRow> {
    const id = uuid();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO SyncQueue (id, entityType, entityId, operation, payload, status, retryCount, maxRetries, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?, ?, ?)`,
      [
        id,
        input.entityType,
        input.entityId,
        input.operation,
        input.payload ?? null,
        input.maxRetries ?? 5,
        now,
        now,
      ]
    );
    return queryFirst<SyncQueueRow>(
      "SELECT * FROM SyncQueue WHERE id = ?",
      [id]
    ) as Promise<SyncQueueRow>;
  },

  async getPending(limit: number = 50): Promise<SyncQueueRow[]> {
    return query<SyncQueueRow>(
      `SELECT * FROM SyncQueue
       WHERE status = 'PENDING' AND retryCount < maxRetries
       ORDER BY createdAt ASC
       LIMIT ?`,
      [limit]
    );
  },

  async markProcessing(id: string): Promise<void> {
    const now = new Date().toISOString();
    await execute(
      "UPDATE SyncQueue SET status = 'PROCESSING', updatedAt = ? WHERE id = ?",
      [now, id]
    );
  },

  async markSynced(id: string): Promise<void> {
    const now = new Date().toISOString();
    await execute(
      "UPDATE SyncQueue SET status = 'SYNCED', updatedAt = ? WHERE id = ?",
      [now, id]
    );
  },

  async markFailed(id: string, error: string): Promise<void> {
    const now = new Date().toISOString();
    await execute(
      `UPDATE SyncQueue SET status = 'FAILED', error = ?, retryCount = retryCount + 1, updatedAt = ? WHERE id = ?`,
      [error, now, id]
    );
  },

  async getStats(): Promise<SyncStats> {
    const total = await queryFirst<{ c: number }>(
      "SELECT COUNT(*) as c FROM SyncQueue"
    );
    const pending = await queryFirst<{ c: number }>(
      "SELECT COUNT(*) as c FROM SyncQueue WHERE status = 'PENDING'"
    );
    const processing = await queryFirst<{ c: number }>(
      "SELECT COUNT(*) as c FROM SyncQueue WHERE status = 'PROCESSING'"
    );
    const synced = await queryFirst<{ c: number }>(
      "SELECT COUNT(*) as c FROM SyncQueue WHERE status = 'SYNCED'"
    );
    const failed = await queryFirst<{ c: number }>(
      "SELECT COUNT(*) as c FROM SyncQueue WHERE status = 'FAILED'"
    );

    return {
      total: total?.c ?? 0,
      pending: pending?.c ?? 0,
      processing: processing?.c ?? 0,
      synced: synced?.c ?? 0,
      failed: failed?.c ?? 0,
    };
  },
};

import { api } from "@/lib/api/http";
import { query } from "@/lib/db/connection";
import { SyncQueueService } from "./sync-queue.service";
import { SyncQueueRepository } from "@/lib/repositories/sync-queue.repository";
import { isNctPos } from "./nct-scope";
import type { AuditLogRow } from "@/lib/repositories/audit.repository";

export async function syncNctAuditLogs() {
  if (!isNctPos()) return;
  const logs = await query<AuditLogRow>(`SELECT a.* FROM AuditLog a
    WHERE json_valid(a.metadata) AND json_extract(a.metadata, '$.source') = 'NCT_POS'
      AND NOT EXISTS (SELECT 1 FROM SyncQueue q WHERE q.entityType='Audit' AND q.entityId=a.id AND q.status='SYNCED')
    ORDER BY a.createdAt, a.id LIMIT 50`);
  if (!logs.length) return;
  const events = logs.map((log) => {
    const { branchId, deviceId: _deviceId, entityType, entityId, source: _source, ...metadata } = JSON.parse(log.metadata!);
    return { id: log.id, action: log.eventType, cashierId: log.cashierId, cashierName: log.cashierName,
      entityType: entityType ?? null, entityId: entityId ?? null, description: log.description,
      branchId, createdAt: log.createdAt, metadata };
  });
  const response = await api.post<{ acceptedIds: string[] }>("/api/pos/audit", { events });
  if (!response.ok || !Array.isArray(response.data?.acceptedIds)) return;
  for (const log of logs) {
    if (!response.data.acceptedIds.includes(log.id)) continue;
    await SyncQueueService.enqueue("Audit", log.id, "UPLOAD");
    await SyncQueueRepository.markEntitySynced("Audit", log.id);
  }
}

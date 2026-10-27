import { api } from "@/lib/api/http";
import { query } from "@/lib/db/connection";
import { SyncQueueRepository } from "@/lib/repositories/sync-queue.repository";
import { BusinessConfigurationService } from "@/lib/business/configuration.service";
import { isNctPos } from "./nct-scope";

// End-of-day closures are immutable audit evidence. Revenue still comes from
// individual sale receipts, so replaying a closure never double-counts revenue.
export async function syncNctEndOfDay() {
  if (!isNctPos()) return;
  const pending = await query<{ id: string; entityId: string; payload: string }>(
    "SELECT id,entityId,payload FROM SyncQueue WHERE entityType='EndOfDay' AND status='PENDING' ORDER BY createdAt LIMIT 50",
  );
  for (const row of pending) {
    const report = JSON.parse(row.payload);
    if (
      report.businessId !== BusinessConfigurationService.current().businessId ||
      !report.deviceId ||
      !report.branchId
    )
      continue;
    const response = await api.post<{ acceptedIds: string[] }>("/api/pos/audit", {
      events: [
        {
          id: row.id,
          action: "END_OF_DAY_CLOSED",
          entityType: "EndOfDay",
          entityId: row.entityId,
          cashierId: report.cashierId ?? null,
          cashierName: report.cashierName ?? null,
          description: `Closed POS business date ${report.businessDate}`,
          branchId: report.branchId,
          createdAt: report.generatedAt,
          metadata: {
            businessDate: report.businessDate,
            shiftId: report.shiftId,
            summary: report.summary,
            payments: report.payments,
            schemaVersion: report.schemaVersion,
          },
        },
      ],
    });
    if (response.ok && response.data?.acceptedIds?.includes(row.id))
      await SyncQueueRepository.markSynced(row.id);
  }
}

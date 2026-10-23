import { query, queryFirst } from "@/lib/db/connection";
import { BusinessConfigurationService } from "@/lib/business/configuration.service";
import { useDeviceStore } from "@/lib/stores/device-store";
import { SyncQueueService } from "@/lib/services/sync-queue.service";
import { RecoveryService } from "./recovery.service";
import { SCHEMA_VERSION } from "@/lib/db/schema";

export const EndOfDayService = {
  async closeAndQueue(input: { businessDate: string; shiftId?: string | null }) {
    const business = BusinessConfigurationService.current();
    const device = useDeviceStore.getState().device;
    const summary = await queryFirst<{ transactionCount: number; grossSales: number; discounts: number; tax: number }>(
      `SELECT COUNT(*) transactionCount, COALESCE(SUM(total), 0) grossSales,
              COALESCE(SUM(discount), 0) discounts, COALESCE(SUM(tax), 0) tax
       FROM Sale WHERE businessId = ? AND businessDate = ? AND status = 'COMPLETED'`,
      [business.businessId, input.businessDate]
    );
    const payments = await query<{ method: string; amount: number }>(
      `SELECT p.method, COALESCE(SUM(p.amount), 0) amount
       FROM Payment p INNER JOIN Sale s ON s.id = p.saleId
       WHERE s.businessId = ? AND s.businessDate = ? AND s.status = 'COMPLETED'
       GROUP BY p.method`, [business.businessId, input.businessDate]
    );
    const idempotencyKey = `${business.businessId}:${device.deviceId ?? "device"}:${input.businessDate}:${input.shiftId ?? "day"}:eod`;
    const queue = await SyncQueueService.enqueue("EndOfDay", input.shiftId ?? input.businessDate, "UPLOAD", {
      idempotencyKey, businessId: business.businessId, branchId: device.branchId,
      deviceId: device.deviceId, operatingMode: business.operatingMode,
      businessDate: input.businessDate, shiftId: input.shiftId ?? null,
      summary: summary ?? { transactionCount: 0, grossSales: 0, discounts: 0, tax: 0 }, payments,
      generatedAt: new Date().toISOString(), schemaVersion: SCHEMA_VERSION,
    }, idempotencyKey);
    const backup = await RecoveryService.queueBackupUpload(`${input.businessDate}:${input.shiftId ?? "day"}`);
    return { queue, backup };
  },
};

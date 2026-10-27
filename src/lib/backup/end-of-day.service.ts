import { query, queryFirst } from "@/lib/db/connection";
import { BusinessConfigurationService } from "@/lib/business/configuration.service";
import { RecoveryService } from "./recovery.service";

export const EndOfDayService = {
  async closeLocally(input: { businessDate: string; shiftId?: string | null }) {
    const business = BusinessConfigurationService.current();
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
    const { file } = await RecoveryService.createAutoBackup();
    return { summary, payments, backup: { fileUri: file.uri } };
  },
};

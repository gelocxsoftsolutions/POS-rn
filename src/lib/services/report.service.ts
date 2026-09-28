import { ReportRepository } from "@/lib/repositories/report.repository";
import type { ReportDateRange, SalesReport } from "@/lib/types/reports";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { getVisibleCashierIds } from "@/lib/stores/access-settings-store";

const emptyReport: SalesReport = {
  summary: { revenue: 0, transactionCount: 0, averageBasket: 0, itemsSold: 0, tax: 0, discounts: 0 },
  trend: [],
  payments: [],
  topProducts: [],
  itemSales: [],
  cashiers: [],
  sales: [],
};

export const ReportService = {
  async getSalesReport(range: ReportDateRange): Promise<SalesReport> {
    try {
      const cashierIds = range.cashierIds ?? getVisibleCashierIds(useCashierStore.getState().session?.cashierId);
      return await ReportRepository.getSalesReport({ ...range, cashierIds });
    } catch (error) {
      console.error("[ReportService] Failed to build sales report", error);
      return emptyReport;
    }
  },
};

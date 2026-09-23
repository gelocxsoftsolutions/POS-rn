import { ReportRepository } from "@/lib/repositories/report.repository";
import type { ReportDateRange, SalesReport } from "@/lib/types/reports";

const emptyReport: SalesReport = {
  summary: { revenue: 0, transactionCount: 0, averageBasket: 0, itemsSold: 0, tax: 0, discounts: 0 },
  trend: [],
  payments: [],
  topProducts: [],
  cashiers: [],
  sales: [],
};

export const ReportService = {
  async getSalesReport(range: ReportDateRange): Promise<SalesReport> {
    try {
      return await ReportRepository.getSalesReport(range);
    } catch (error) {
      console.error("[ReportService] Failed to build sales report", error);
      return emptyReport;
    }
  },
};

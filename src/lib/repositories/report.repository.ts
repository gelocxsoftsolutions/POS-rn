import { query, queryFirst } from "@/lib/db/connection";
import type {
  CashierPerformance,
  PaymentBreakdown,
  ProductPerformance,
  ReportDateRange,
  ReportSaleRow,
  ReportSummary,
  SalesReport,
  SalesTrendPoint,
} from "@/lib/types/reports";

export const ReportRepository = {
  async getSalesReport(range: ReportDateRange): Promise<SalesReport> {
    const cashierClause = range.cashierIds?.length
      ? ` AND s.cashierId IN (${range.cashierIds.map(() => "?").join(", ")})`
      : "";
    const completedRange = `s.status = 'COMPLETED' AND datetime(s.createdAt) >= datetime(?) AND datetime(s.createdAt) <= datetime(?)${cashierClause}`;
    const params = [range.startDate, range.endDate, ...(range.cashierIds ?? [])];
    const summary = await queryFirst<ReportSummary>(
      `SELECT
        COALESCE(SUM(s.total), 0) AS revenue,
        COUNT(*) AS transactionCount,
        COALESCE(AVG(s.total), 0) AS averageBasket,
        COALESCE(SUM(s.itemCount), 0) AS itemsSold,
        COALESCE(SUM(s.tax), 0) AS tax,
        COALESCE(SUM(s.discount), 0) AS discounts
       FROM Sale s WHERE ${completedRange}`,
      params
    );

    const trend = await query<SalesTrendPoint>(
      `SELECT date(s.createdAt, 'localtime') AS date,
        COALESCE(SUM(s.total), 0) AS revenue,
        COUNT(*) AS transactions
       FROM Sale s WHERE ${completedRange}
       GROUP BY date(s.createdAt, 'localtime') ORDER BY date ASC`,
      params
    );

    const payments = await query<PaymentBreakdown>(
      `SELECT COALESCE(NULLIF(s.paymentMethod, ''), 'UNKNOWN') AS method,
        COALESCE(SUM(s.total), 0) AS amount,
        COUNT(*) AS transactions
       FROM Sale s WHERE ${completedRange}
       GROUP BY COALESCE(NULLIF(s.paymentMethod, ''), 'UNKNOWN')
       ORDER BY amount DESC`,
      params
    );

    const topProducts = await query<ProductPerformance>(
      `SELECT si.productId, COALESCE(NULLIF(si.productName, ''), 'Unknown product') AS productName,
        si.sku, COALESCE(SUM(si.quantity), 0) AS quantity,
        COALESCE(SUM(si.lineTotal), 0) AS revenue
       FROM SaleItem si INNER JOIN Sale s ON s.id = si.saleId
       WHERE ${completedRange}
       GROUP BY si.productId, si.productName, si.sku
       ORDER BY revenue DESC, quantity DESC LIMIT 10`,
      params
    );

    const itemSales = await query<ProductPerformance>(
      `SELECT si.productId, COALESCE(NULLIF(si.productName, ''), 'Unknown product') AS productName,
        si.sku, COALESCE(SUM(si.quantity), 0) AS quantity,
        COALESCE(SUM(si.lineTotal), 0) AS revenue
       FROM SaleItem si INNER JOIN Sale s ON s.id = si.saleId
       WHERE ${completedRange}
       GROUP BY si.productId, si.productName, si.sku
       ORDER BY si.productName ASC, si.sku ASC`,
      params
    );

    const cashiers = await query<CashierPerformance>(
      `SELECT s.cashierId, COALESCE(NULLIF(s.cashierName, ''), 'Unknown cashier') AS cashierName,
        COUNT(*) AS transactions, COALESCE(SUM(s.total), 0) AS revenue,
        COALESCE(AVG(s.total), 0) AS averageBasket
       FROM Sale s WHERE ${completedRange}
       GROUP BY s.cashierId, s.cashierName ORDER BY revenue DESC`,
      params
    );

    const rawSales = await query<ReportSaleRow & { queueStatus: string | null; queueError: string | null }>(
      `SELECT s.id, s.receiptNumber, s.createdAt, s.cashierName, s.customerName,
        s.paymentMethod, s.itemCount, s.subtotal, s.discount, s.tax, s.total, s.synced,
        (SELECT q.status FROM SyncQueue q WHERE q.entityType = 'Sale' AND q.entityId = s.id ORDER BY q.updatedAt DESC LIMIT 1) AS queueStatus,
        (SELECT q.error FROM SyncQueue q WHERE q.entityType = 'Sale' AND q.entityId = s.id ORDER BY q.updatedAt DESC LIMIT 1) AS queueError
       FROM Sale s WHERE ${completedRange} ORDER BY s.createdAt DESC`,
      params
    );

    const sales: ReportSaleRow[] = rawSales.map((sale) => {
      const { queueStatus, queueError, ...rest } = sale;
      let syncStatus: ReportSaleRow["syncStatus"];
      if (queueStatus === "SYNCED" || (!queueStatus && rest.synced)) syncStatus = "SYNCED";
      else if (queueStatus === "FAILED") syncStatus = "FAILED";
      else if (queueStatus === "PENDING" || queueStatus === "PROCESSING") syncStatus = "PENDING";
      else syncStatus = "UNSYNCED";
      return { ...rest, syncStatus, syncError: queueError ?? null };
    });

    return {
      summary: summary ?? { revenue: 0, transactionCount: 0, averageBasket: 0, itemsSold: 0, tax: 0, discounts: 0 },
      trend,
      payments,
      topProducts,
      itemSales,
      cashiers,
      sales,
    };
  },
};

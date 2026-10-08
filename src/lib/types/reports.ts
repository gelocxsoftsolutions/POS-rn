export interface ReportDateRange {
  startDate: string;
  endDate: string;
  cashierIds?: string[];
}

export interface ReportSummary {
  revenue: number;
  transactionCount: number;
  averageBasket: number;
  itemsSold: number;
  tax: number;
  discounts: number;
}

export interface SalesTrendPoint {
  date: string;
  revenue: number;
  transactions: number;
}

export interface PaymentBreakdown {
  method: string;
  amount: number;
  transactions: number;
}

export interface ProductPerformance {
  productId: string | null;
  productName: string;
  sku: string | null;
  quantity: number;
  revenue: number;
}

export interface CashierPerformance {
  cashierId: string | null;
  cashierName: string;
  transactions: number;
  revenue: number;
  averageBasket: number;
}

export interface ReportSaleRow {
  id: string;
  receiptNumber: string;
  createdAt: string;
  cashierName: string;
  customerName: string | null;
  paymentMethod: string;
  itemCount: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  synced: number | boolean;
  syncStatus?: import("@/lib/types/sales").SaleSyncStatus;
  syncError?: string | null;
}

export interface SalesReport {
  summary: ReportSummary;
  trend: SalesTrendPoint[];
  payments: PaymentBreakdown[];
  topProducts: ProductPerformance[];
  itemSales: ProductPerformance[];
  cashiers: CashierPerformance[];
  sales: ReportSaleRow[];
}

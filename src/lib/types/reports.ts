export interface ReportDateRange {
  startDate: string;
  endDate: string;
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
}

export interface SalesReport {
  summary: ReportSummary;
  trend: SalesTrendPoint[];
  payments: PaymentBreakdown[];
  topProducts: ProductPerformance[];
  cashiers: CashierPerformance[];
  sales: ReportSaleRow[];
}

export interface SaleDTO {
  id: string;
  receiptNumber: string;
  cashierId: string;
  cashierName: string;
  customerName: string | null;
  itemCount: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paidAmount: number;
  changeAmount: number;
  paymentMethod: string;
  status: string;
  businessDate: string;
  shiftId: string | null;
  deviceId: string | null;
  branchId: number | null;
  synced: boolean;
  createdAt: string;
  items: SaleItemDTO[];
  payments: PaymentDTO[];
}

export interface SaleItemDTO {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  sku: string | null;
  barcode: string | null;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  lineTotal: number;
  unit: string | null;
  weight: number | null;
}

export interface PaymentDTO {
  id: string;
  saleId: string;
  method: string;
  amount: number;
  reference: string | null;
  status: string;
  createdAt: string;
}

export interface CreateSaleInput {
  cashierId: string;
  cashierName: string;
  customerName?: string;
  paymentMethod: string;
  items: Array<{
    productId: string;
    productName: string;
    sku?: string;
    barcode?: string;
    quantity: number;
    unitPrice: number;
    unit?: string;
    weight?: number | null;
  }>;
  discountCode?: string;
  paidAmount?: number;
  shiftId?: string;
  deviceId?: string;
  branchId?: number;
}

export interface CreateSaleResult {
  success: boolean;
  sale?: SaleDTO;
  error?: string;
}

export interface DiscountDTO {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: string;
  value: number;
  minPurchase: number;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentMethodDTO {
  id: string;
  code: string;
  name: string;
  type: string;
  active: boolean;
  sortOrder: number;
}

export interface ReceiptDTO {
  id: string;
  saleId: string;
  storeName: string;
  storeCode: string | null;
  address: string | null;
  phone: string | null;
  footer: string | null;
  printedAt: string | null;
  createdAt: string;
}

export interface SaleFilter {
  search?: string;
  status?: string;
  paymentMethod?: string;
  cashierId?: string;
  shiftId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

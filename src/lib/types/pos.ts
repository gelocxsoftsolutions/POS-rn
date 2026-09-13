export type ProductSort = "popular" | "name" | "priceAsc" | "stockDesc";
export type PaymentMethodType = "CASH" | "CARD" | "DIGITAL";
export type PosTransactionStatus = "COMPLETED" | "CANCELLED" | "REFUNDED";

export interface CashierProfile {
  id: string;
  name: string;
  pin: string;
  role: string;
  avatarUrl?: string;
}

export interface StoreSettings {
  storeName: string;
  storeCode: string;
  currencyCode: string;
  taxLabel: string;
  supportPhone: string;
  address: string;
  receiptFooter: string;
  taxRate: number;
}

export interface PosSessionSummary {
  id: string;
  openedById: string;
  openedByName: string;
  openedAt: string;
  openingFloat: number;
  status: "OPEN" | "CLOSED";
}

export interface DashboardOverview {
  todaysSales: number;
  transactionCount: number;
  averageBasket: number;
  lowStockCount: number;
  currentSession: PosSessionSummary | null;
  topProducts: ProductCatalogItem[];
}

export interface ProductCatalogItem {
  id: string;
  name: string;
  category: string;
  description: string;
  barcode: string;
  sku: string;
  price: number;
  stockQuantity: number;
  popularity: number;
  imageUrl?: string;
}

export interface PosCartItem {
  productId: string;
  name: string;
  sku: string;
  barcode: string;
  unitPrice: number;
  quantity: number;
  maxQuantity: number;
  imageUrl?: string;
}

export interface CheckoutPayload {
  cashierId: string;
  cashierName: string;
  paymentMethod: PaymentMethodType;
  customerName?: string;
  items: PosCartItem[];
}

export interface PosTransactionRecord {
  id: string;
  receiptNumber: string;
  sessionId: string;
  cashierId: string;
  cashierName: string;
  paymentMethod: PaymentMethodType;
  customerName?: string;
  itemCount: number;
  subtotal: number;
  tax: number;
  total: number;
  paidAmount: number;
  status: PosTransactionStatus;
  createdAt: string;
  items: PosTransactionItemRecord[];
}

export interface PosTransactionItemRecord {
  id: string;
  externalProductId: string;
  productName: string;
  sku?: string;
  barcode?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface DeviceRegistrationState {
  deviceId: string | null;
  deviceCode: string | null;
  publicIdentifier: string | null;
  branchId: number | null;
  branchName: string | null;
  branchAddress: string | null;
  deviceName: string | null;
  registeredAt: string | null;
  registrationState: "unregistered" | "registered" | "provisioned";
}

export interface RegisterDeviceInput {
  activationToken: string;
  publicKey: string;
  privateKey: string;
  machineIdentifier: string;
  computerName: string;
  appVersion: string;
  osVersion: string;
  serverUrl?: string;
}

export interface RegisterDeviceResult {
  success: boolean;
  device?: DeviceRegistrationState;
  error?: string;
}

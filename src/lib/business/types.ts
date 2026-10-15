export type OperatingMode = "NCT_DEPENDENT" | "INDEPENDENT";

export type ReceiptAlignment = "left" | "center" | "right";
export type ReceiptPaperWidth = 58 | 80;

export interface ReceiptTemplate {
  version: number;
  paperWidthMm: ReceiptPaperWidth;
  headerMessage: string;
  footerMessage: string;
  headerAlignment: ReceiptAlignment;
  footerAlignment: ReceiptAlignment;
  emphasizeBusinessName: boolean;
  showCashier: boolean;
  showCustomer: boolean;
  showPaymentDetails: boolean;
  showReceiptBarcode: boolean;
  showReceiptQr: boolean;
}

export interface BusinessConfiguration {
  businessId: string;
  operatingMode: OperatingMode;
  businessName: string;
  posSystemName: string;
  headerName: string;
  businessLogoUri: string | null;
  receiptLogoUri: string | null;
  address: string;
  supportPhone: string;
  contactEmail: string;
  receiptTemplate: ReceiptTemplate;
  receiptTemplateVersion: number;
  modeChangedAt: string | null;
}

export interface BusinessCapabilities {
  manageLocalCatalog: boolean;
  manageLocalInventory: boolean;
  receiveNctTransfers: boolean;
  importNctCatalog: boolean;
  uploadEndOfDay: boolean;
  uploadBackups: boolean;
}

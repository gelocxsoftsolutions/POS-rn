import type { BusinessConfiguration, ReceiptTemplate } from "./types";

export const DEFAULT_RECEIPT_TEMPLATE: ReceiptTemplate = {
  version: 1,
  paperWidthMm: 58,
  headerMessage: "",
  footerMessage: "Thank you for your purchase!",
  headerAlignment: "center",
  footerAlignment: "center",
  emphasizeBusinessName: true,
  showCashier: true,
  showCustomer: true,
  showPaymentDetails: true,
  showReceiptBarcode: true,
  showReceiptQr: true,
};

export const DEFAULT_BUSINESS_CONFIGURATION: BusinessConfiguration = {
  businessId: "nct-default",
  operatingMode: "INDEPENDENT",
  businessName: "NCT Seafoods",
  posSystemName: "Dealership POS",
  headerName: "NCT Seafoods",
  businessLogoUri: null,
  receiptLogoUri: null,
  address: "",
  supportPhone: "",
  contactEmail: "",
  receiptTemplate: DEFAULT_RECEIPT_TEMPLATE,
  receiptTemplateVersion: 1,
  modeChangedAt: null,
};

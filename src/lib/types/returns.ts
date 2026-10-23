export type ReturnRequestStatus =
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "COMPLETED"
  | "CANCELLED";

export type ReturnCondition = "NEW" | "USED" | "DAMAGED" | "DEFECTIVE";

export interface ReturnRequestItemDTO {
  id: string;
  returnRequestId: string;
  saleItemId: string | null;
  productId: string | null;
  productName: string;
  sku: string | null;
  barcode: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  condition: string | null;
  createdAt: string;
}

export interface ReturnExchangeItemDTO {
  id: string;
  returnRequestId: string;
  productId: string | null;
  productName: string;
  sku: string | null;
  barcode: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  unit: string | null;
  weight: number | null;
  createdAt: string;
}

export interface ReturnRequestDTO {
  id: string;
  returnNumber: string;
  saleId: string;
  receiptNumber: string;
  status: ReturnRequestStatus;
  reason: string | null;
  returnedTotal: number;
  replacementTotal: number;
  priceDifference: number;
  customerAcceptedShortfall: number;
  approvalCodeHash: string | null;
  codeExpiresAt: string | null;
  codeUsedAt: string | null;
  codeGeneratedById: string | null;
  codeGeneratedByName: string | null;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  rejectedById: string | null;
  rejectedByName: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  exchangeSaleId: string | null;
  topUpMethod: string | null;
  requestedById: string | null;
  requestedByName: string | null;
  businessDate: string | null;
  deviceId: string | null;
  branchId: number | null;
  businessId: string;
  originMode: string;
  synced: number;
  createdAt: string;
  updatedAt: string;
  items: ReturnRequestItemDTO[];
  exchangeItems: ReturnExchangeItemDTO[];
}

export interface CreateReturnRequestInput {
  saleId: string;
  reason: string;
  customerAcceptedShortfall?: boolean;
  items: Array<{
    saleItemId: string;
    quantity: number;
    condition?: ReturnCondition;
  }>;
  exchangeItems: Array<{
    productId: string;
    quantity: number;
  }>;
}

export interface ReturnRequestFilter {
  search?: string;
  status?: ReturnRequestStatus;
  page?: number;
  pageSize?: number;
}

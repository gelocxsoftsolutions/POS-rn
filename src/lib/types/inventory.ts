export interface CategoryDTO {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BrandDTO {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UnitDTO {
  id: string;
  name: string;
  abbreviation: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaxGroupDTO {
  id: string;
  name: string;
  rate: number;
  type: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductPriceDTO {
  id: string;
  productId: string;
  priceList: string;
  price: number;
  currency: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BarcodeDTO {
  id: string;
  productId: string;
  barcode: string;
  type: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDTO {
  id: string;
  sku: string;
  productCode: string | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  brandId: string | null;
  brandName: string | null;
  unitId: string | null;
  unitName: string | null;
  weight: number | null;
  taxGroupId: string | null;
  taxGroupName: string | null;
  taxRate: number | null;
  status: string;
  imageId: string | null;
  imageUrl?: string | null;
  retailPrice: number | null;
  allocatedQty?: number;
  availableQty?: number;
  reservedQty?: number;
  soldQty?: number;
  damagedQty?: number;
  adjustmentQty?: number;
  minimumStock?: number;
  maximumStock?: number;
  inventoryUpdatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDetailDTO extends ProductDTO {
  prices: ProductPriceDTO[];
  barcodes: BarcodeDTO[];
  inventory: InventoryDTO | null;
}

export interface ProductFilter {
  search?: string;
  categoryId?: string;
  brandId?: string;
  status?: string;
  stockStatus?: "IN_STOCK" | "LOW" | "OUT_OF_STOCK";
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  pageSize?: number;
}

export interface ProductInventorySummary {
  totalProducts: number;
  totalAvailable: number;
  lowStock: number;
  outOfStock: number;
}

export interface InventoryDTO {
  id: string;
  productId: string;
  allocatedQty: number;
  availableQty: number;
  reservedQty: number;
  soldQty: number;
  damagedQty: number;
  adjustmentQty: number;
  minimumStock: number;
  maximumStock: number;
  updatedAt: string;
}

export interface InventoryTransferDTO {
  id: string;
  transferNumber: string;
  sourceWarehouse: string | null;
  destinationPos: string | null;
  status: string;
  createdById: string | null;
  createdByName: string | null;
  approvedById: string | null;
  approvedByName: string | null;
  receivedById: string | null;
  receivedByName: string | null;
  notes: string | null;
  createdAt: string;
  approvedAt: string | null;
  receivedAt: string | null;
  updatedAt: string;
  items: InventoryTransferItemDTO[];
}

export interface InventoryTransferItemDTO {
  id: string;
  transferId: string;
  productId: string;
  productName: string | null;
  productSku: string | null;
  allocatedQty: number;
  receivedQty: number;
  unit: string;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryLedgerEntryDTO {
  id: string;
  movementType: string;
  referenceNumber: string | null;
  productId: string;
  productName: string | null;
  productSku: string | null;
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  notes: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface StockAlertDTO {
  id: string;
  productId: string;
  alertType: string;
  currentQty: number;
  thresholdQty: number;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

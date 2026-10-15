import { ProductRepository } from "@/lib/repositories/product.repository";
import { CategoryRepository } from "@/lib/repositories/category.repository";
import { BrandRepository } from "@/lib/repositories/brand.repository";
import { UnitRepository } from "@/lib/repositories/unit.repository";
import { TaxGroupRepository } from "@/lib/repositories/tax-group.repository";
import { BarcodeRepository } from "@/lib/repositories/barcode.repository";
import { queryFirst } from "@/lib/db/connection";
import type { ProductFilter, ProductDTO, PaginatedResult } from "@/lib/types/inventory";
import { canonicalScannedCode, normalizeScannedCode } from "@/lib/barcodes/normalize-scanned-code";
import { IndependentCatalogService, type CreateIndependentVariationInput } from "@/lib/business/independent-catalog.service";

export const ProductService = {
  async createIndependentVariation(input: CreateIndependentVariationInput) {
    return IndependentCatalogService.createVariation(input);
  },
  async search(filters: ProductFilter): Promise<PaginatedResult<ProductDTO>> {
    try {
      return await ProductRepository.search(filters);
    } catch {
      return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  },

  async getById(id: string): Promise<ProductDTO | null> {
    try {
      return await ProductRepository.findById(id);
    } catch {
      return null;
    }
  },

  async getByBarcode(barcode: string): Promise<ProductDTO | null> {
    try {
      const normalized = normalizeScannedCode(barcode);
      if (!normalized) return null;
      const barcodeRow = await BarcodeRepository.findByBarcode(normalized);
      if (barcodeRow) return await ProductRepository.findById(barcodeRow.productId);

      const canonical = canonicalScannedCode(normalized);
      const product = await queryFirst<{ id: string }>(
        `SELECT id FROM Product
         WHERE UPPER(REPLACE(TRIM(sku), ' ', '')) = ?
            OR UPPER(REPLACE(TRIM(COALESCE(productCode, '')), ' ', '')) = ?
         LIMIT 1`,
        [canonical, canonical]
      );
      return product ? await ProductRepository.findById(product.id) : null;
    } catch {
      return null;
    }
  },

  async listCategories() {
    try {
      return await CategoryRepository.findAll();
    } catch {
      return [];
    }
  },

  async listBrands() {
    try {
      return await BrandRepository.findAll();
    } catch {
      return [];
    }
  },

  async listUnits() {
    try {
      return await UnitRepository.findAll();
    } catch {
      return [];
    }
  },

  async listTaxGroups() {
    try {
      return await TaxGroupRepository.findAll();
    } catch {
      return [];
    }
  },

  async getCount(): Promise<number> {
    try {
      return await ProductRepository.count();
    } catch {
      return 0;
    }
  },

  async getInventorySummary() {
    try {
      return await ProductRepository.inventorySummary();
    } catch {
      return { totalProducts: 0, totalAvailable: 0, lowStock: 0, outOfStock: 0 };
    }
  },
};

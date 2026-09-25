import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import type { ProductDTO, ProductFilter, PaginatedResult, ProductInventorySummary } from "@/lib/types/inventory";

export interface CreateProductInput {
  sku: string;
  productCode?: string;
  name: string;
  description?: string;
  categoryId?: string;
  brandId?: string;
  unitId?: string;
  weight?: number | null;
  taxGroupId?: string;
  imageId?: string;
}

export interface UpdateProductInput {
  sku?: string;
  productCode?: string;
  name?: string;
  description?: string;
  categoryId?: string;
  brandId?: string;
  unitId?: string;
  weight?: number | null;
  taxGroupId?: string;
  status?: string;
  imageId?: string;
}

export const ProductRepository = {
  async findById(id: string): Promise<ProductDTO | null> {
    return queryFirst<ProductDTO>(
      `SELECT p.*,
        c.name as categoryName,
        b.name as brandName,
        u.name as unitName,
        tg.name as taxGroupName,
        tg.rate as taxRate,
        (SELECT pp.price FROM ProductPrice pp WHERE pp.productId = p.id AND pp.priceList = 'retail' AND pp.active = 1 ORDER BY pp.updatedAt DESC LIMIT 1) as retailPrice,
        pi.fileName as imageUrl,
        COALESCE(inv.allocatedQty, 0) as allocatedQty,
        COALESCE(inv.availableQty, 0) as availableQty,
        COALESCE(inv.reservedQty, 0) as reservedQty,
        COALESCE(inv.soldQty, 0) as soldQty,
        COALESCE(inv.damagedQty, 0) as damagedQty,
        COALESCE(inv.adjustmentQty, 0) as adjustmentQty,
        COALESCE(inv.minimumStock, 0) as minimumStock,
        COALESCE(inv.maximumStock, 0) as maximumStock,
        inv.updatedAt as inventoryUpdatedAt
      FROM Product p
      LEFT JOIN Category c ON p.categoryId = c.id
      LEFT JOIN Brand b ON p.brandId = b.id
      LEFT JOIN Unit u ON p.unitId = u.id
      LEFT JOIN TaxGroup tg ON p.taxGroupId = tg.id
      LEFT JOIN ProductImage pi ON p.imageId = pi.id
      LEFT JOIN PosInventory inv ON inv.productId = p.id
      WHERE p.id = ?`,
      [id]
    );
  },

  async findBySku(sku: string): Promise<ProductDTO | null> {
    return queryFirst<ProductDTO>(
      `SELECT p.*,
        c.name as categoryName,
        b.name as brandName,
        u.name as unitName,
        tg.name as taxGroupName,
        tg.rate as taxRate,
        (SELECT pp.price FROM ProductPrice pp WHERE pp.productId = p.id AND pp.priceList = 'retail' AND pp.active = 1 ORDER BY pp.updatedAt DESC LIMIT 1) as retailPrice,
        pi.fileName as imageUrl,
        COALESCE(inv.allocatedQty, 0) as allocatedQty,
        COALESCE(inv.availableQty, 0) as availableQty,
        COALESCE(inv.reservedQty, 0) as reservedQty,
        COALESCE(inv.soldQty, 0) as soldQty,
        COALESCE(inv.damagedQty, 0) as damagedQty,
        COALESCE(inv.adjustmentQty, 0) as adjustmentQty,
        COALESCE(inv.minimumStock, 0) as minimumStock,
        COALESCE(inv.maximumStock, 0) as maximumStock,
        inv.updatedAt as inventoryUpdatedAt
      FROM Product p
      LEFT JOIN Category c ON p.categoryId = c.id
      LEFT JOIN Brand b ON p.brandId = b.id
      LEFT JOIN Unit u ON p.unitId = u.id
      LEFT JOIN TaxGroup tg ON p.taxGroupId = tg.id
      LEFT JOIN ProductImage pi ON p.imageId = pi.id
      LEFT JOIN PosInventory inv ON inv.productId = p.id
      WHERE p.sku = ?`,
      [sku]
    );
  },

  async search(filter: ProductFilter): Promise<PaginatedResult<ProductDTO>> {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ["p.status = 'ACTIVE'"];
    const params: any[] = [];

    if (filter.search) {
      conditions.push("(p.name LIKE ? OR p.sku LIKE ?)");
      const term = `%${filter.search}%`;
      params.push(term, term);
    }

    if (filter.categoryId) {
      conditions.push("p.categoryId = ?");
      params.push(filter.categoryId);
    }

    if (filter.brandId) {
      conditions.push("p.brandId = ?");
      params.push(filter.brandId);
    }

    if (filter.stockStatus === "IN_STOCK") {
      conditions.push("COALESCE(inv.availableQty, 0) > 0");
    } else if (filter.stockStatus === "LOW") {
      conditions.push("COALESCE(inv.availableQty, 0) > 0 AND COALESCE(inv.availableQty, 0) <= COALESCE(inv.minimumStock, 0)");
    } else if (filter.stockStatus === "OUT_OF_STOCK") {
      conditions.push("COALESCE(inv.availableQty, 0) <= 0");
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await queryFirst<{ c: number }>(
      `SELECT COUNT(*) as c FROM Product p LEFT JOIN PosInventory inv ON inv.productId = p.id ${where}`,
      params
    );
    const total = countResult?.c ?? 0;

    const items = await query<ProductDTO>(
      `SELECT p.*,
        c.name as categoryName,
        b.name as brandName,
        u.name as unitName,
        tg.name as taxGroupName,
        tg.rate as taxRate,
        (SELECT pp.price FROM ProductPrice pp WHERE pp.productId = p.id AND pp.priceList = 'retail' AND pp.active = 1 ORDER BY pp.updatedAt DESC LIMIT 1) as retailPrice,
        pi.fileName as imageUrl,
        COALESCE(inv.allocatedQty, 0) as allocatedQty,
        COALESCE(inv.availableQty, 0) as availableQty,
        COALESCE(inv.reservedQty, 0) as reservedQty,
        COALESCE(inv.soldQty, 0) as soldQty,
        COALESCE(inv.damagedQty, 0) as damagedQty,
        COALESCE(inv.adjustmentQty, 0) as adjustmentQty,
        COALESCE(inv.minimumStock, 0) as minimumStock,
        COALESCE(inv.maximumStock, 0) as maximumStock,
        inv.updatedAt as inventoryUpdatedAt
      FROM Product p
      LEFT JOIN Category c ON p.categoryId = c.id
      LEFT JOIN Brand b ON p.brandId = b.id
      LEFT JOIN Unit u ON p.unitId = u.id
      LEFT JOIN TaxGroup tg ON p.taxGroupId = tg.id
      LEFT JOIN ProductImage pi ON p.imageId = pi.id
      LEFT JOIN PosInventory inv ON inv.productId = p.id
      ${where}
      ORDER BY p.name ASC
      LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  },

  async listAll(): Promise<ProductDTO[]> {
    return query<ProductDTO>(
      `SELECT p.*,
        c.name as categoryName,
        b.name as brandName,
        u.name as unitName,
        tg.name as taxGroupName,
        tg.rate as taxRate,
        (SELECT pp.price FROM ProductPrice pp WHERE pp.productId = p.id AND pp.priceList = 'retail' AND pp.active = 1 ORDER BY pp.updatedAt DESC LIMIT 1) as retailPrice,
        pi.fileName as imageUrl,
        COALESCE(inv.allocatedQty, 0) as allocatedQty,
        COALESCE(inv.availableQty, 0) as availableQty,
        COALESCE(inv.reservedQty, 0) as reservedQty,
        COALESCE(inv.soldQty, 0) as soldQty,
        COALESCE(inv.damagedQty, 0) as damagedQty,
        COALESCE(inv.adjustmentQty, 0) as adjustmentQty,
        COALESCE(inv.minimumStock, 0) as minimumStock,
        COALESCE(inv.maximumStock, 0) as maximumStock,
        inv.updatedAt as inventoryUpdatedAt
      FROM Product p
      LEFT JOIN Category c ON p.categoryId = c.id
      LEFT JOIN Brand b ON p.brandId = b.id
      LEFT JOIN Unit u ON p.unitId = u.id
      LEFT JOIN TaxGroup tg ON p.taxGroupId = tg.id
      LEFT JOIN ProductImage pi ON p.imageId = pi.id
      LEFT JOIN PosInventory inv ON inv.productId = p.id
      WHERE p.status = 'ACTIVE'
      ORDER BY p.name ASC`
    );
  },

  async count(): Promise<number> {
    const result = await queryFirst<{ c: number }>(
      "SELECT COUNT(*) as c FROM Product WHERE status = 'ACTIVE'"
    );
    return result?.c ?? 0;
  },

  async inventorySummary(): Promise<ProductInventorySummary> {
    const result = await queryFirst<ProductInventorySummary>(
      `SELECT
        COUNT(p.id) as totalProducts,
        COALESCE(SUM(COALESCE(inv.availableQty, 0)), 0) as totalAvailable,
        COALESCE(SUM(CASE WHEN COALESCE(inv.availableQty, 0) > 0 AND COALESCE(inv.availableQty, 0) <= COALESCE(inv.minimumStock, 0) THEN 1 ELSE 0 END), 0) as lowStock,
        COALESCE(SUM(CASE WHEN COALESCE(inv.availableQty, 0) <= 0 THEN 1 ELSE 0 END), 0) as outOfStock
       FROM Product p
       LEFT JOIN PosInventory inv ON inv.productId = p.id
       WHERE p.status = 'ACTIVE'`
    );
    return result ?? { totalProducts: 0, totalAvailable: 0, lowStock: 0, outOfStock: 0 };
  },

  async create(input: CreateProductInput): Promise<ProductDTO> {
    const id = uuid();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO Product (id, sku, productCode, name, description, categoryId, brandId, unitId, weight, taxGroupId, status, imageId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
      [
        id,
        input.sku,
        input.productCode ?? null,
        input.name,
        input.description ?? null,
        input.categoryId ?? null,
        input.brandId ?? null,
        input.unitId ?? null,
        input.weight ?? null,
        input.taxGroupId ?? null,
        input.imageId ?? null,
        now,
        now,
      ]
    );
    return this.findById(id) as Promise<ProductDTO>;
  },

  async update(id: string, input: UpdateProductInput): Promise<ProductDTO | null> {
    const fields: string[] = [];
    const values: any[] = [];

    if (input.sku !== undefined) { fields.push("sku = ?"); values.push(input.sku); }
    if (input.productCode !== undefined) { fields.push("productCode = ?"); values.push(input.productCode); }
    if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name); }
    if (input.description !== undefined) { fields.push("description = ?"); values.push(input.description); }
    if (input.categoryId !== undefined) { fields.push("categoryId = ?"); values.push(input.categoryId); }
    if (input.brandId !== undefined) { fields.push("brandId = ?"); values.push(input.brandId); }
    if (input.unitId !== undefined) { fields.push("unitId = ?"); values.push(input.unitId); }
    if (input.taxGroupId !== undefined) { fields.push("taxGroupId = ?"); values.push(input.taxGroupId); }
    if (input.status !== undefined) { fields.push("status = ?"); values.push(input.status); }
    if (input.imageId !== undefined) { fields.push("imageId = ?"); values.push(input.imageId); }
    if (input.weight !== undefined) { fields.push("weight = ?"); values.push(input.weight); }

    if (fields.length === 0) return this.findById(id);

    fields.push("updatedAt = ?");
    values.push(new Date().toISOString());
    values.push(id);

    await execute(
      `UPDATE Product SET ${fields.join(", ")} WHERE id = ?`,
      values
    );
    return this.findById(id);
  },
};

import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import type { ProductDTO, ProductFilter, PaginatedResult } from "@/lib/types/inventory";

export interface CreateProductInput {
  sku: string;
  productCode?: string;
  name: string;
  description?: string;
  categoryId?: string;
  brandId?: string;
  unitId?: string;
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
        pi.fileName as imageUrl
      FROM Product p
      LEFT JOIN Category c ON p.categoryId = c.id
      LEFT JOIN Brand b ON p.brandId = b.id
      LEFT JOIN Unit u ON p.unitId = u.id
      LEFT JOIN TaxGroup tg ON p.taxGroupId = tg.id
      LEFT JOIN ProductImage pi ON p.imageId = pi.id
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
        pi.fileName as imageUrl
      FROM Product p
      LEFT JOIN Category c ON p.categoryId = c.id
      LEFT JOIN Brand b ON p.brandId = b.id
      LEFT JOIN Unit u ON p.unitId = u.id
      LEFT JOIN TaxGroup tg ON p.taxGroupId = tg.id
      LEFT JOIN ProductImage pi ON p.imageId = pi.id
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

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await queryFirst<{ c: number }>(
      `SELECT COUNT(*) as c FROM Product p ${where}`,
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
        pi.fileName as imageUrl
      FROM Product p
      LEFT JOIN Category c ON p.categoryId = c.id
      LEFT JOIN Brand b ON p.brandId = b.id
      LEFT JOIN Unit u ON p.unitId = u.id
      LEFT JOIN TaxGroup tg ON p.taxGroupId = tg.id
      LEFT JOIN ProductImage pi ON p.imageId = pi.id
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
        pi.fileName as imageUrl
      FROM Product p
      LEFT JOIN Category c ON p.categoryId = c.id
      LEFT JOIN Brand b ON p.brandId = b.id
      LEFT JOIN Unit u ON p.unitId = u.id
      LEFT JOIN TaxGroup tg ON p.taxGroupId = tg.id
      LEFT JOIN ProductImage pi ON p.imageId = pi.id
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

  async create(input: CreateProductInput): Promise<ProductDTO> {
    const id = uuid();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO Product (id, sku, productCode, name, description, categoryId, brandId, unitId, taxGroupId, status, imageId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
      [
        id,
        input.sku,
        input.productCode ?? null,
        input.name,
        input.description ?? null,
        input.categoryId ?? null,
        input.brandId ?? null,
        input.unitId ?? null,
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

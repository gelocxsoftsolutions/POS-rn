import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import type { ProductPriceDTO } from "@/lib/types/inventory";

export interface UpsertPriceInput {
  productId: string;
  priceList?: string;
  price: number;
  currency?: string;
}

export const ProductPriceRepository = {
  async findByProduct(productId: string): Promise<ProductPriceDTO[]> {
    return query<ProductPriceDTO>(
      "SELECT * FROM ProductPrice WHERE productId = ? AND active = 1 ORDER BY priceList ASC",
      [productId]
    );
  },

  async upsert(input: UpsertPriceInput): Promise<ProductPriceDTO> {
    const priceList = input.priceList ?? "retail";
    const existing = await queryFirst<ProductPriceDTO>(
      "SELECT * FROM ProductPrice WHERE productId = ? AND priceList = ?",
      [input.productId, priceList]
    );

    const now = new Date().toISOString();

    if (existing) {
      await execute(
        `UPDATE ProductPrice SET price = ?, currency = ?, updatedAt = ? WHERE id = ?`,
        [input.price, input.currency ?? "PHP", now, existing.id]
      );
      return queryFirst<ProductPriceDTO>(
        "SELECT * FROM ProductPrice WHERE id = ?",
        [existing.id]
      ) as Promise<ProductPriceDTO>;
    }

    const id = uuid();
    await execute(
      `INSERT INTO ProductPrice (id, productId, priceList, price, currency, active, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, input.productId, priceList, input.price, input.currency ?? "PHP", now, now]
    );
    return queryFirst<ProductPriceDTO>(
      "SELECT * FROM ProductPrice WHERE id = ?",
      [id]
    ) as Promise<ProductPriceDTO>;
  },

  async listAll(): Promise<ProductPriceDTO[]> {
    return query<ProductPriceDTO>(
      "SELECT * FROM ProductPrice WHERE active = 1 ORDER BY productId, priceList ASC"
    );
  },
};

import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import type { DiscountDTO } from "@/lib/types/sales";

export const DiscountRepository = {
  async findByCode(code: string): Promise<DiscountDTO | null> {
    return queryFirst<DiscountDTO>(
      "SELECT * FROM Discount WHERE code = ? AND active = 1",
      [code]
    );
  },

  async findAll(): Promise<DiscountDTO[]> {
    return query<DiscountDTO>(
      "SELECT * FROM Discount WHERE active = 1 ORDER BY name ASC"
    );
  },

  async create(data: {
    code: string;
    name: string;
    description?: string;
    type?: string;
    value: number;
    minPurchase?: number;
    maxUses?: number;
    startsAt?: string;
    expiresAt?: string;
  }): Promise<DiscountDTO> {
    const id = uuid();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO Discount (id, code, name, description, type, value, minPurchase, maxUses, usedCount, active, startsAt, expiresAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?)`,
      [
        id,
        data.code,
        data.name,
        data.description ?? null,
        data.type ?? "PERCENTAGE",
        data.value,
        data.minPurchase ?? 0,
        data.maxUses ?? null,
        data.startsAt ?? null,
        data.expiresAt ?? null,
        now,
        now,
      ]
    );
    return queryFirst<DiscountDTO>(
      "SELECT * FROM Discount WHERE id = ?",
      [id]
    ) as Promise<DiscountDTO>;
  },
};

import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import type { TaxGroupDTO } from "@/lib/types/inventory";

export interface CreateTaxGroupInput {
  name: string;
  rate: number;
  type?: string;
}

export const TaxGroupRepository = {
  async findById(id: string): Promise<TaxGroupDTO | null> {
    return queryFirst<TaxGroupDTO>(
      "SELECT * FROM TaxGroup WHERE id = ?",
      [id]
    );
  },

  async findAll(): Promise<TaxGroupDTO[]> {
    return query<TaxGroupDTO>(
      "SELECT * FROM TaxGroup WHERE active = 1 ORDER BY name ASC"
    );
  },

  async create(input: CreateTaxGroupInput): Promise<TaxGroupDTO> {
    const id = uuid();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO TaxGroup (id, name, rate, type, active, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [
        id,
        input.name,
        input.rate,
        input.type ?? "inclusive",
        now,
        now,
      ]
    );
    return this.findById(id) as Promise<TaxGroupDTO>;
  },
};

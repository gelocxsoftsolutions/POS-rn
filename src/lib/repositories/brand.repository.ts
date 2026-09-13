import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import type { BrandDTO } from "@/lib/types/inventory";

export interface CreateBrandInput {
  name: string;
  code?: string;
  description?: string;
}

export interface UpdateBrandInput {
  name?: string;
  code?: string;
  description?: string;
  active?: boolean;
}

export const BrandRepository = {
  async findById(id: string): Promise<BrandDTO | null> {
    return queryFirst<BrandDTO>(
      "SELECT * FROM Brand WHERE id = ?",
      [id]
    );
  },

  async findAll(): Promise<BrandDTO[]> {
    return query<BrandDTO>(
      "SELECT * FROM Brand WHERE active = 1 ORDER BY name ASC"
    );
  },

  async create(input: CreateBrandInput): Promise<BrandDTO> {
    const id = uuid();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO Brand (id, name, code, description, active, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [
        id,
        input.name,
        input.code ?? null,
        input.description ?? null,
        now,
        now,
      ]
    );
    return this.findById(id) as Promise<BrandDTO>;
  },

  async update(id: string, input: UpdateBrandInput): Promise<BrandDTO | null> {
    const fields: string[] = [];
    const values: any[] = [];

    if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name); }
    if (input.code !== undefined) { fields.push("code = ?"); values.push(input.code); }
    if (input.description !== undefined) { fields.push("description = ?"); values.push(input.description); }
    if (input.active !== undefined) { fields.push("active = ?"); values.push(input.active ? 1 : 0); }

    if (fields.length === 0) return this.findById(id);

    fields.push("updatedAt = ?");
    values.push(new Date().toISOString());
    values.push(id);

    await execute(
      `UPDATE Brand SET ${fields.join(", ")} WHERE id = ?`,
      values
    );
    return this.findById(id);
  },
};

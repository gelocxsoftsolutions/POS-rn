import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import type { CategoryDTO } from "@/lib/types/inventory";

export interface CreateCategoryInput {
  name: string;
  code?: string;
  description?: string;
  parentId?: string;
  sortOrder?: number;
}

export interface UpdateCategoryInput {
  name?: string;
  code?: string;
  description?: string;
  parentId?: string;
  sortOrder?: number;
  active?: boolean;
}

export const CategoryRepository = {
  async findById(id: string): Promise<CategoryDTO | null> {
    return queryFirst<CategoryDTO>(
      "SELECT * FROM Category WHERE id = ?",
      [id]
    );
  },

  async findAll(): Promise<CategoryDTO[]> {
    return query<CategoryDTO>(
      "SELECT * FROM Category WHERE active = 1 ORDER BY sortOrder ASC, name ASC"
    );
  },

  async create(input: CreateCategoryInput): Promise<CategoryDTO> {
    const id = uuid();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO Category (id, name, code, description, parentId, sortOrder, active, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        id,
        input.name,
        input.code ?? null,
        input.description ?? null,
        input.parentId ?? null,
        input.sortOrder ?? 0,
        now,
        now,
      ]
    );
    return this.findById(id) as Promise<CategoryDTO>;
  },

  async update(id: string, input: UpdateCategoryInput): Promise<CategoryDTO | null> {
    const fields: string[] = [];
    const values: any[] = [];

    if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name); }
    if (input.code !== undefined) { fields.push("code = ?"); values.push(input.code); }
    if (input.description !== undefined) { fields.push("description = ?"); values.push(input.description); }
    if (input.parentId !== undefined) { fields.push("parentId = ?"); values.push(input.parentId); }
    if (input.sortOrder !== undefined) { fields.push("sortOrder = ?"); values.push(input.sortOrder); }
    if (input.active !== undefined) { fields.push("active = ?"); values.push(input.active ? 1 : 0); }

    if (fields.length === 0) return this.findById(id);

    fields.push("updatedAt = ?");
    values.push(new Date().toISOString());
    values.push(id);

    await execute(
      `UPDATE Category SET ${fields.join(", ")} WHERE id = ?`,
      values
    );
    return this.findById(id);
  },
};

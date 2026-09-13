import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import type { UnitDTO } from "@/lib/types/inventory";

export interface CreateUnitInput {
  name: string;
  abbreviation?: string;
}

export const UnitRepository = {
  async findById(id: string): Promise<UnitDTO | null> {
    return queryFirst<UnitDTO>(
      "SELECT * FROM Unit WHERE id = ?",
      [id]
    );
  },

  async findAll(): Promise<UnitDTO[]> {
    return query<UnitDTO>(
      "SELECT * FROM Unit WHERE active = 1 ORDER BY name ASC"
    );
  },

  async create(input: CreateUnitInput): Promise<UnitDTO> {
    const id = uuid();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO Unit (id, name, abbreviation, active, createdAt, updatedAt)
       VALUES (?, ?, ?, 1, ?, ?)`,
      [
        id,
        input.name,
        input.abbreviation ?? null,
        now,
        now,
      ]
    );
    return this.findById(id) as Promise<UnitDTO>;
  },
};

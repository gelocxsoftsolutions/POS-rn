import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: number;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  group: string | null;
}

export interface CreateRoleInput {
  name: string;
  description?: string;
  isSystem?: boolean;
}

export const RoleRepository = {
  async findByName(name: string): Promise<RoleRow | null> {
    return queryFirst<RoleRow>(
      "SELECT * FROM Role WHERE name = ?",
      [name]
    );
  },

  async findById(id: string): Promise<RoleRow | null> {
    return queryFirst<RoleRow>(
      "SELECT * FROM Role WHERE id = ?",
      [id]
    );
  },

  async create(input: CreateRoleInput): Promise<RoleRow> {
    const id = uuid();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO Role (id, name, description, isSystem, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name,
        input.description ?? null,
        input.isSystem ? 1 : 0,
        now,
        now,
      ]
    );
    return this.findById(id) as Promise<RoleRow>;
  },

  async getPermissions(roleId: string): Promise<PermissionRow[]> {
    return query<PermissionRow>(
      `SELECT p.* FROM Permission p
       INNER JOIN RolePermission rp ON p.id = rp.permissionId
       WHERE rp.roleId = ?
       ORDER BY p."group", p.code`,
      [roleId]
    );
  },
};

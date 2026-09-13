import { query, queryFirst, execute } from "@/lib/db/connection";

export interface PermissionRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  group: string | null;
  createdAt: string;
}

export const PermissionRepository = {
  async findByRole(roleId: string): Promise<PermissionRow[]> {
    return query<PermissionRow>(
      `SELECT p.* FROM Permission p
       INNER JOIN RolePermission rp ON p.id = rp.permissionId
       WHERE rp.roleId = ?
       ORDER BY p."group", p.code`,
      [roleId]
    );
  },

  async findAll(): Promise<PermissionRow[]> {
    return query<PermissionRow>(
      'SELECT * FROM Permission ORDER BY "group", code'
    );
  },
};

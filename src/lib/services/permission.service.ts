import { queryFirst, query } from "@/lib/db/connection";

export const PermissionService = {
  async hasPermission(roleId: string, permissionCode: string): Promise<boolean> {
    try {
      const row = await queryFirst<{ c: number }>(
        `SELECT COUNT(*) as c
         FROM RolePermission rp
         INNER JOIN Permission p ON p.id = rp.permissionId
         WHERE rp.roleId = ? AND p.code = ?`,
        [roleId, permissionCode]
      );
      return (row?.c ?? 0) > 0;
    } catch {
      return false;
    }
  },

  async getRolePermissions(roleId: string): Promise<string[]> {
    try {
      const rows = await query<{ code: string }>(
        `SELECT p.code
         FROM Permission p
         INNER JOIN RolePermission rp ON p.id = rp.permissionId
         WHERE rp.roleId = ?
         ORDER BY p."group", p.code`,
        [roleId]
      );
      return rows.map((r) => r.code);
    } catch {
      return [];
    }
  },

  async getAllPermissions() {
    try {
      return await query(
        'SELECT * FROM Permission ORDER BY "group", code'
      );
    } catch {
      return [];
    }
  },
};

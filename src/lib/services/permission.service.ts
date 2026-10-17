import { execute, queryFirst, query } from "@/lib/db/connection";
import { PERMISSION_PRESETS, POS_PERMISSIONS, type PermissionPresetKey } from "@/lib/permissions/catalog";

export interface PermissionRoleRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: number;
}

export const PermissionService = {
  async ensureDefaults(): Promise<void> {
    const now = new Date().toISOString();
    for (const permission of POS_PERMISSIONS) {
      await execute(
        `INSERT INTO Permission (id, code, name, description, "group", createdAt)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET name = excluded.name, description = excluded.description, "group" = excluded."group"`,
        [`permission:${permission.code}`, permission.code, permission.name, permission.description, permission.group, now]
      );
    }
    for (const [key, preset] of Object.entries(PERMISSION_PRESETS)) {
      const databaseRoleName = preset.name === "Administrator" ? "Admin" : preset.name;
      const existing = await queryFirst<{ id: string }>("SELECT id FROM Role WHERE lower(name) = lower(?)", [databaseRoleName]);
      const roleId = existing?.id ?? `role:${key.toLowerCase()}`;
      if (!existing) await execute("INSERT INTO Role (id, name, description, isSystem, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)", [roleId, databaseRoleName, preset.description, now, now]);
      const assigned = await queryFirst<{ count: number }>("SELECT COUNT(*) count FROM RolePermission WHERE roleId = ?", [roleId]);
      if ((assigned?.count ?? 0) === 0) await this.replaceRolePermissions(roleId, [...preset.codes]);
    }
  },

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

  async getRoles(): Promise<PermissionRoleRow[]> {
    return query<PermissionRoleRow>("SELECT id, name, description, isSystem FROM Role ORDER BY CASE WHEN lower(name) = 'admin' THEN 0 ELSE 1 END, name");
  },

  async replaceRolePermissions(roleId: string, permissionCodes: string[]): Promise<void> {
    const allowedCodes = [...new Set(permissionCodes)].filter((code) => POS_PERMISSIONS.some((permission) => permission.code === code));
    await execute("BEGIN IMMEDIATE");
    try {
      await execute("DELETE FROM RolePermission WHERE roleId = ?", [roleId]);
      for (const code of allowedCodes) {
        await execute(`INSERT OR IGNORE INTO RolePermission (roleId, permissionId) SELECT ?, id FROM Permission WHERE code = ?`, [roleId, code]);
      }
      await execute("COMMIT");
    } catch (error) {
      await execute("ROLLBACK");
      throw error;
    }
  },

  async applyPreset(roleId: string, presetKey: PermissionPresetKey): Promise<void> {
    const preset = PERMISSION_PRESETS[presetKey];
    if (!preset) throw new Error("Unknown permission preset.");
    await this.replaceRolePermissions(roleId, [...preset.codes]);
  },
};

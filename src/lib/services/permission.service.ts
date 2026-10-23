import { execute, queryFirst, query } from "@/lib/db/connection";
import { PERMISSION_PRESETS, POS_PERMISSIONS, type PermissionPresetKey } from "@/lib/permissions/catalog";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { v4 as uuid } from "uuid";

export interface PermissionRoleRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: number;
}

export interface PermissionUserRow {
  id: string;
  displayName: string;
  username: string | null;
  roleId: string;
}

export type UserPermissionOverrides = Record<string, boolean>;

function permissionAdministrator() {
  const session = useCashierStore.getState().session;
  if (!session?.isSuperAdmin) throw new Error("Only the system Super Admin can change individual permissions.");
  return session;
}

async function auditUserPermissionChange(cashierId: string, description: string) {
  const session = useCashierStore.getState().session;
  await execute(
    `INSERT INTO AuditLog (id, eventType, description, cashierId, cashierName, roleId, metadata, createdAt)
     VALUES (?, 'USER_PERMISSION_CHANGED', ?, ?, ?, ?, ?, ?)`,
    [uuid(), description, session?.cashierId ?? null, session?.cashierName ?? null, session?.roleId ?? null,
      JSON.stringify({ targetCashierId: cashierId }), new Date().toISOString()]
  );
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

  async hasPermission(roleId: string, permissionCode: string, cashierId?: string): Promise<boolean> {
    try {
      if (cashierId) {
        const override = await queryFirst<{ granted: number }>(
          `SELECT up.granted
           FROM UserPermission up
           INNER JOIN Permission p ON p.id = up.permissionId
           WHERE up.cashierId = ? AND p.code = ?`,
          [cashierId, permissionCode]
        );
        if (override) return override.granted === 1;
      }
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

  async getUsersByRole(roleId: string): Promise<PermissionUserRow[]> {
    return query<PermissionUserRow>(
      `SELECT id, displayName, username, roleId
       FROM Cashier
       WHERE active = 1 AND roleId = ?
       ORDER BY displayName COLLATE NOCASE`,
      [roleId]
    );
  },

  async getUserPermissionOverrides(cashierId: string): Promise<UserPermissionOverrides> {
    const rows = await query<{ code: string; granted: number }>(
      `SELECT p.code, up.granted
       FROM UserPermission up
       INNER JOIN Permission p ON p.id = up.permissionId
       WHERE up.cashierId = ?`,
      [cashierId]
    );
    return Object.fromEntries(rows.map((row) => [row.code, row.granted === 1]));
  },

  async getEffectivePermissions(roleId: string, cashierId?: string): Promise<string[]> {
    const inherited = new Set(await this.getRolePermissions(roleId));
    if (!cashierId) return [...inherited];
    const overrides = await this.getUserPermissionOverrides(cashierId);
    for (const [code, granted] of Object.entries(overrides)) {
      if (granted) inherited.add(code);
      else inherited.delete(code);
    }
    return [...inherited];
  },

  async setUserPermission(cashierId: string, permissionCode: string, granted: boolean | null): Promise<void> {
    permissionAdministrator();
    if (!POS_PERMISSIONS.some((permission) => permission.code === permissionCode)) throw new Error("Unknown permission.");
    if (granted === null) {
      await execute(
        `DELETE FROM UserPermission
         WHERE cashierId = ? AND permissionId = (SELECT id FROM Permission WHERE code = ?)`,
        [cashierId, permissionCode]
      );
      await auditUserPermissionChange(cashierId, `Restored ${permissionCode} to the user's role default.`);
      return;
    }
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO UserPermission (cashierId, permissionId, granted, createdAt, updatedAt)
       SELECT ?, id, ?, ?, ? FROM Permission WHERE code = ?
       ON CONFLICT(cashierId, permissionId) DO UPDATE SET granted = excluded.granted, updatedAt = excluded.updatedAt`,
      [cashierId, granted ? 1 : 0, now, now, permissionCode]
    );
    await auditUserPermissionChange(cashierId, `${granted ? "Allowed" : "Denied"} ${permissionCode} for this user.`);
  },

  async replaceUserPermissions(cashierId: string, permissionCodes: string[]): Promise<void> {
    permissionAdministrator();
    const allowed = new Set(permissionCodes.filter((code) => POS_PERMISSIONS.some((permission) => permission.code === code)));
    await execute("BEGIN IMMEDIATE");
    try {
      await execute("DELETE FROM UserPermission WHERE cashierId = ?", [cashierId]);
      const now = new Date().toISOString();
      for (const permission of POS_PERMISSIONS) {
        await execute(
          `INSERT INTO UserPermission (cashierId, permissionId, granted, createdAt, updatedAt)
           SELECT ?, id, ?, ?, ? FROM Permission WHERE code = ?`,
          [cashierId, allowed.has(permission.code) ? 1 : 0, now, now, permission.code]
        );
      }
      await execute("COMMIT");
    } catch (error) {
      await execute("ROLLBACK");
      throw error;
    }
    await auditUserPermissionChange(cashierId, "Applied a complete individual permission preset.");
  },

  async clearUserPermissionOverrides(cashierId: string): Promise<void> {
    permissionAdministrator();
    await execute("DELETE FROM UserPermission WHERE cashierId = ?", [cashierId]);
    await auditUserPermissionChange(cashierId, "Removed individual overrides and restored role defaults.");
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

  async applyPresetToUser(cashierId: string, presetKey: PermissionPresetKey): Promise<void> {
    const preset = PERMISSION_PRESETS[presetKey];
    if (!preset) throw new Error("Unknown permission preset.");
    await this.replaceUserPermissions(cashierId, [...preset.codes]);
  },
};

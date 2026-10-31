import { POS_PERMISSIONS } from "./catalog";
import { SUPER_ADMIN_ID } from "./local-super-admin";
import { query } from "@/lib/db/connection";

interface SettingsAccess {
  isSuperAdmin: boolean;
  nct: boolean;
  canManageSettings: boolean;
  canManageUsers: boolean;
  canViewAudit: boolean;
  canManageBackups: boolean;
}

export function canOpenSettingsSection(
  section: { id: string; adminOnly?: boolean },
  access: SettingsAccess,
): boolean {
  if (access.isSuperAdmin) return true;
  if (["store", "tax", "auto_lock"].includes(section.id)) return access.canManageSettings;
  if (!section.adminOnly) return true;
  if (section.id === "users" || section.id === "security") return access.canManageUsers;
  if (section.id === "permissions") return access.nct && access.canManageUsers;
  if (section.id === "audit") return access.canViewAudit;
  if (section.id === "database") return access.canManageBackups;
  return access.canManageSettings;
}

export interface SettingsEmployee {
  id: string;
  displayName: string;
  username: string | null;
  roleId: string;
  roleName: string;
}

export interface SettingsRole {
  id: string;
  name: string;
  permissions: string[];
  builtIn: boolean;
}

export async function getNctSettingsDirectory(includeBuiltIn: boolean) {
  const employees = await query<SettingsEmployee>(
    `SELECT c.id, c.displayName, c.username, c.roleId, r.name AS roleName
     FROM Cashier c JOIN Role r ON r.id = c.roleId
     WHERE c.active = 1 AND c.employeeId LIKE 'oms:%' AND c.roleId LIKE 'oms-role:%'
     ORDER BY c.displayName COLLATE NOCASE`,
  );
  const grants = await query<{ roleId: string; code: string }>(
    `SELECT rp.roleId, p.code FROM RolePermission rp JOIN Permission p ON p.id = rp.permissionId
     WHERE rp.roleId LIKE 'oms-role:%'`,
  );
  const known = new Set(POS_PERMISSIONS.map((permission) => permission.code));
  const roles: SettingsRole[] = includeBuiltIn ? [{
    id: SUPER_ADMIN_ID, name: "Super Admin", builtIn: true,
    permissions: [...known],
  }] : [];
  for (const employee of employees) {
    if (roles.some((role) => role.id === employee.roleId)) continue;
    roles.push({ id: employee.roleId, name: employee.roleName, builtIn: false,
      permissions: [...new Set(grants.filter((grant) => grant.roleId === employee.roleId && known.has(grant.code)).map((grant) => grant.code))] });
  }
  return { employees, roles };
}

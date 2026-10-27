import { Prisma } from "@prisma/client";
import { db } from "~/server/db";

export async function employeeAccessReady() {
  const [schema] = await db.$queryRaw<Array<{ ready: boolean }>>`SELECT to_regclass('pos.employee_pos_access') IS NOT NULL AS ready`;
  return schema?.ready === true;
}

export async function nctEmployeeDirectory(deviceId: string) {
  const users = await db.$queryRaw<Array<{
    id: string; employeeId: number; username: string; displayName: string; pinHash: string; passwordHash: string | null;
    roleId: string; roleName: string; pinLoginEnabled: boolean; passwordLoginEnabled: boolean;
  }>>(Prisma.sql`
    SELECT p.id, e.id AS "employeeId", e.username,
      COALESCE(NULLIF(TRIM(CONCAT_WS(' ', e.first_name, e.last_name)), ''), e.username) AS "displayName",
      p."pinHash", p."passwordHash", p."roleId", r.name AS "roleName", p."pinLoginEnabled", p."passwordLoginEnabled"
    FROM pos.pos_users p JOIN pos.employee_pos_access a ON a.pos_user_id = p.id
    JOIN public.users e ON e.id = a.employee_id JOIN pos.pos_roles r ON r.id = p."roleId"
    JOIN pos.pos_devices d ON d.id = ${deviceId} AND d."branchId" = p."branchId"
    WHERE p.active = true AND e."isActive" = true AND e."isOnHold" = false
      AND EXISTS (SELECT 1 FROM pos.pos_user_assignments x WHERE x."userId" = p.id AND x."deviceId" = d.id AND x."isActive" = true)
    ORDER BY e.username`);
  const roles = await db.posRole.findMany({ where: { id: { in: users.map((u) => u.roleId) } }, include: { permissions: { include: { permission: true } } } });
  return { users: users.map((u) => ({ ...u, employeeId: `oms:${u.employeeId}`, name: u.displayName, active: true })),
    roles: roles.map((role) => ({ id: role.id, name: role.name, permissions: role.permissions.map((p) => p.permission.code) })) };
}

import { api } from "@/lib/api/http";
import { execute, getDatabase, queryFirst } from "@/lib/db/connection";
import { isNctPos } from "./nct-scope";
import { POS_PERMISSIONS } from "@/lib/permissions/catalog";
import { useNetworkStore } from "./network.service";
import { serializeLocalOperation } from "@/lib/db/local-operation";
import { mapNctPermissions } from "@/lib/permissions/nct-permission-map";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useAuthStore } from "@/lib/stores/auth-store";

interface EmployeeDirectory {
  users: Array<{
    id: string;
    employeeId: string;
    username: string;
    displayName: string;
    pinHash: string;
    passwordHash: string | null;
    roleId: string;
    pinLoginEnabled: boolean;
    passwordLoginEnabled: boolean;
  }>;
  roles: Array<{ id: string; name: string; permissions: string[] }>;
}

export const EmployeeSyncService = {
  async refresh(): Promise<boolean> {
    if (!isNctPos() || !useNetworkStore.getState().isOnline) return false;
    const response = await api.get<EmployeeDirectory>("/api/pos/users");
    if (
      !response.ok ||
      !response.data ||
      !Array.isArray(response.data.users) ||
      !Array.isArray(response.data.roles)
    )
      return false;
    const { users, roles } = response.data;
    if (
      users.some(
        (u) =>
          !/^oms:\d+$/.test(u.employeeId) ||
          !/^[a-f0-9]{64}$/i.test(u.pinHash) ||
          !roles.some((r) => r.id === u.roleId),
      )
    )
      return false;
    const database = await getDatabase();
    const now = new Date().toISOString();
    await serializeLocalOperation(() =>
      database.withTransactionAsync(async () => {
        // Only a successful complete response can replace the offline directory.
        await execute("UPDATE Cashier SET active = 0");
        for (const role of roles) {
          const roleId = `oms-role:${role.id}`;
          await execute(
            "INSERT INTO Role (id,name,isSystem,createdAt,updatedAt) VALUES (?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,updatedAt=excluded.updatedAt",
            [roleId, `OMS ${role.name}`, now, now],
          );
          await execute("DELETE FROM RolePermission WHERE roleId = ?", [roleId]);
          for (const code of mapNctPermissions(role.permissions)) {
            if (!POS_PERMISSIONS.some((p) => p.code === code)) continue;
            const permission = await queryFirst<{ id: string }>(
              "SELECT id FROM Permission WHERE code = ?",
              [code],
            );
            if (permission)
              await execute(
                "INSERT OR IGNORE INTO RolePermission (roleId,permissionId) VALUES (?,?)",
                [roleId, permission.id],
              );
          }
        }
        for (const user of users) {
          await execute(
            `INSERT INTO Cashier (id,employeeId,username,displayName,pinHash,passwordHash,roleId,active,pinLoginEnabled,passwordLoginEnabled,createdAt,updatedAt)
          VALUES (?,?,?,?,?,?,?,1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET employeeId=excluded.employeeId,username=excluded.username,
          displayName=excluded.displayName,pinHash=excluded.pinHash,passwordHash=excluded.passwordHash,roleId=excluded.roleId,
          active=1,pinLoginEnabled=excluded.pinLoginEnabled,passwordLoginEnabled=excluded.passwordLoginEnabled,updatedAt=excluded.updatedAt`,
            [
              user.id,
              user.employeeId,
              user.username,
              user.displayName,
              user.pinHash,
              user.passwordHash,
              `oms-role:${user.roleId}`,
              Number(user.pinLoginEnabled),
              Number(user.passwordLoginEnabled),
              now,
              now,
            ],
          );
          await execute("DELETE FROM UserPermission WHERE cashierId = ?", [user.id]);
        }
      }),
    );
    const session = useCashierStore.getState().session;
    if (session) {
      const employee = users.find((user) => user.id === session.cashierId);
      if (!employee || `oms-role:${employee.roleId}` !== session.roleId) {
        useCashierStore.getState().clearSession();
        useAuthStore.getState().signOut();
      } else if (employee.displayName !== session.cashierName) {
        useCashierStore.getState().setSession({ ...session, cashierName: employee.displayName });
      }
    }
    return true;
  },
};

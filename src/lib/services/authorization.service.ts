import { PermissionService } from "@/lib/services/permission.service";
import { useCashierStore } from "@/lib/stores/cashier-store";

export async function requirePermission(permissionCode: string, action = "perform this operation") {
  const session = useCashierStore.getState().session;
  if (!session) throw new Error(`Sign in before trying to ${action}.`);
  if (session.isSuperAdmin) return;
  if (!session.roleId || !(await PermissionService.hasPermission(session.roleId, permissionCode))) {
    throw new Error(`Your role is not permitted to ${action}.`);
  }
}

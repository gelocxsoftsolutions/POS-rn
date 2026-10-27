import { PermissionService } from "@/lib/services/permission.service";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { isNctPos } from "./nct-scope";
import { CashierRepository } from "@/lib/repositories/cashier.repository";

export async function requirePermission(permissionCode: string, action = "perform this operation") {
  const session = useCashierStore.getState().session;
  if (!session) throw new Error(`Sign in before trying to ${action}.`);
  if (isNctPos()) {
    const employee = await CashierRepository.findById(session.cashierId);
    if (!employee?.active || !/^oms:\d+$/.test(employee.employeeId ?? "")) throw new Error("This employee no longer has NCT POS access.");
    if (employee.roleId !== session.roleId) throw new Error("Your OMS role changed. Sign in again.");
  } else if (session.isSuperAdmin) return;
  if (!session.roleId || !(await PermissionService.hasPermission(session.roleId, permissionCode, session.cashierId))) {
    throw new Error(`Your account is not permitted to ${action}.`);
  }
}

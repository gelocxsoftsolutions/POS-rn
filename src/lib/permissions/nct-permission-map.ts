import { POS_PERMISSIONS } from "./catalog";

// Explicit translations of the existing OMS POS permission vocabulary.
// Unknown codes and page-only grants never implicitly grant business actions.
const OMS_TO_POS: Record<string, string[]> = {
  VIEW_POS: ["DASHBOARD"],
  CREATE_POS_SALES: ["POS_SALES"],
  VIEW_POS_SALES_HISTORY: ["POS_RECEIPTS", "POS_REPORTS"],
  MANAGE_POS_INVENTORY: ["POS_INVENTORY", "POS_TRANSFERS"],
  MANAGE_POS_DEVICES: ["POS_SETTINGS", "POS_BACKUP", "POS_AUDIT"],
  MANAGE_POS_USERS: ["POS_USERS"],
  MANAGE_POS_ROLES: ["POS_USERS"],
  "page:dashboard": ["DASHBOARD"],
  "page:receipts": ["POS_RECEIPTS"],
  "sale:create": ["POS_SALES"],
  "sale:read": ["POS_RECEIPTS"],
  "sale:refund": ["POS_RETURNS"],
  "inventory:adjust": ["POS_INVENTORY", "POS_TRANSFERS"],
  "report:read": ["POS_REPORTS"],
  "audit:read": ["POS_AUDIT"],
  "customer:create": ["POS_CUSTOMERS"],
  "settings:manage": ["POS_SETTINGS"],
};

export function mapNctPermissions(codes: string[]): string[] {
  const known = new Set(POS_PERMISSIONS.map((permission) => permission.code));
  return [
    ...new Set(codes.flatMap((code) => (known.has(code) ? [code] : (OMS_TO_POS[code] ?? [])))),
  ];
}

export interface PermissionDefinition {
  code: string;
  name: string;
  description: string;
  group: string;
}

export const POS_PERMISSIONS: PermissionDefinition[] = [
  { code: "DASHBOARD", name: "View dashboard", description: "Open the POS home dashboard.", group: "General" },
  { code: "POS_SALES", name: "Process sales", description: "Open checkout, add items, and complete local sales.", group: "Sales" },
  { code: "POS_RECEIPTS", name: "View and print receipts", description: "Search, view, reprint, and scan receipts.", group: "Sales" },
  { code: "POS_PRODUCTS", name: "Manage products", description: "Create, edit, archive, and maintain local products and variations.", group: "Catalog" },
  { code: "POS_INVENTORY", name: "Manage inventory", description: "Receive stock, make positive corrections, and record inventory loss.", group: "Inventory" },
  { code: "POS_TRANSFERS", name: "Receive NCT transfers", description: "Open transfer pages and receive OMS-controlled QR transfers.", group: "Inventory" },
  { code: "POS_CUSTOMERS", name: "Manage customers", description: "View, create, and update customer records.", group: "Customers" },
  { code: "POS_REPORTS", name: "View reports", description: "View sales, inventory, and end-of-day reports.", group: "Reports" },
  { code: "POS_USERS", name: "Manage users and roles", description: "Create users, change roles, deactivate accounts, and assign permissions.", group: "Administration" },
  { code: "POS_AUDIT", name: "View audit logs", description: "Review user, product, inventory, login, and transfer audit history.", group: "Administration" },
  { code: "POS_SETTINGS", name: "Manage business settings", description: "Change store, tax, branding, hardware, theme, and device settings.", group: "Administration" },
  { code: "POS_BACKUP", name: "Export and restore backups", description: "Export verified backups and restore a fresh installation.", group: "Administration" },
];

export const PERMISSION_PRESETS = {
  ADMINISTRATOR: { name: "Administrator", description: "Full POS, user, audit, settings, and recovery access.", codes: POS_PERMISSIONS.map((permission) => permission.code) },
  MANAGER: { name: "Manager", description: "Daily operations, catalog, inventory, customers, reports, audit review, and verified backups.", codes: ["DASHBOARD", "POS_SALES", "POS_RECEIPTS", "POS_PRODUCTS", "POS_INVENTORY", "POS_TRANSFERS", "POS_CUSTOMERS", "POS_REPORTS", "POS_AUDIT", "POS_BACKUP"] },
  CASHIER: { name: "Cashier", description: "Checkout, receipts, and customer service only.", codes: ["DASHBOARD", "POS_SALES", "POS_RECEIPTS", "POS_CUSTOMERS"] },
  INVENTORY_CLERK: { name: "Inventory Clerk", description: "Products, stock receiving, corrections, losses, and transfers.", codes: ["DASHBOARD", "POS_PRODUCTS", "POS_INVENTORY", "POS_TRANSFERS"] },
  AUDITOR: { name: "Auditor", description: "Read-only operational visibility for receipts, reports, and audit logs.", codes: ["DASHBOARD", "POS_RECEIPTS", "POS_REPORTS", "POS_AUDIT"] },
} as const;

export type PermissionPresetKey = keyof typeof PERMISSION_PRESETS;

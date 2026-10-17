export interface PermissionDefinition {
  code: string;
  name: string;
  description: string;
  group: string;
  category: "Pages" | "Buttons & Actions" | "CRUD Operations";
}

export const POS_PERMISSIONS: PermissionDefinition[] = [
  { code: "DASHBOARD", name: "Open dashboard page", description: "See the POS home dashboard and operational summary.", group: "General", category: "Pages" },
  { code: "POS_RECEIPTS", name: "Open receipts page", description: "Search and view completed receipt records.", group: "Sales", category: "Pages" },
  { code: "POS_REPORTS", name: "Open reports page", description: "View sales, inventory, and end-of-day reports.", group: "Reports", category: "Pages" },
  { code: "POS_AUDIT", name: "Open audit logs", description: "Review user, product, inventory, login, and transfer history.", group: "Administration", category: "Pages" },
  { code: "POS_INVENTORY", name: "Use stock action buttons", description: "Receive stock, make positive corrections, and record inventory loss.", group: "Inventory", category: "Buttons & Actions" },
  { code: "POS_TRANSFERS", name: "Use transfer actions", description: "Open transfer tools and receive or reject OMS-controlled QR transfers.", group: "Inventory", category: "Buttons & Actions" },
  { code: "POS_BACKUP", name: "Use backup actions", description: "Export verified backups and restore a fresh installation.", group: "Administration", category: "Buttons & Actions" },
  { code: "POS_SALES", name: "Create sales", description: "Open checkout, add items, and complete local sales.", group: "Sales", category: "CRUD Operations" },
  { code: "POS_PRODUCTS", name: "Create and edit products", description: "Create, edit, archive, and maintain local products and variations.", group: "Catalog", category: "CRUD Operations" },
  { code: "POS_CUSTOMERS", name: "Create and edit customers", description: "Open customer records and create or update customer details.", group: "Customers", category: "CRUD Operations" },
  { code: "POS_USERS", name: "Create and edit users", description: "Create users, change roles, deactivate accounts, and assign access.", group: "Administration", category: "CRUD Operations" },
  { code: "POS_SETTINGS", name: "Update POS settings", description: "Change store, tax, branding, hardware, theme, and device settings.", group: "Administration", category: "CRUD Operations" },
];

export const PERMISSION_CATEGORIES = ["Pages", "Buttons & Actions", "CRUD Operations"] as const;

export const PERMISSION_PRESETS = {
  ADMINISTRATOR: { name: "Administrator", description: "Full POS, user, audit, settings, and recovery access.", codes: POS_PERMISSIONS.map((permission) => permission.code) },
  MANAGER: { name: "Manager", description: "Daily operations, catalog, inventory, customers, reports, audit review, and verified backups.", codes: ["DASHBOARD", "POS_SALES", "POS_RECEIPTS", "POS_PRODUCTS", "POS_INVENTORY", "POS_TRANSFERS", "POS_CUSTOMERS", "POS_REPORTS", "POS_AUDIT", "POS_BACKUP"] },
  CASHIER: { name: "Cashier", description: "Checkout, receipts, and customer service only.", codes: ["DASHBOARD", "POS_SALES", "POS_RECEIPTS", "POS_CUSTOMERS"] },
  INVENTORY_CLERK: { name: "Inventory Clerk", description: "Products, stock receiving, corrections, losses, and transfers.", codes: ["DASHBOARD", "POS_PRODUCTS", "POS_INVENTORY", "POS_TRANSFERS"] },
  AUDITOR: { name: "Auditor", description: "Read-only operational visibility for receipts, reports, and audit logs.", codes: ["DASHBOARD", "POS_RECEIPTS", "POS_REPORTS", "POS_AUDIT"] },
} as const;

export type PermissionPresetKey = keyof typeof PERMISSION_PRESETS;

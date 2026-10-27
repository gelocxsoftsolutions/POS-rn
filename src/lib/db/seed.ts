import { getDatabase, execute, queryFirst } from "./connection";
import { v4 as uuid } from "uuid";

export async function seedIfNeeded(): Promise<void> {
  await getDatabase();
  const now = new Date().toISOString();
  const existingRole = await queryFirst<{ id: string }>("SELECT id FROM Role WHERE name = 'Admin'");
  const defaultRoleId = existingRole?.id ?? uuid();

  await execute(
    `INSERT OR IGNORE INTO Role (id, name, description, isSystem, createdAt) VALUES (?, ?, ?, 1, ?)`,
    [defaultRoleId, "Admin", "Full access", now]
  );

  // OMS provisions cashier accounts during device activation.
  // Never seed a well-known production login or PIN here.
  await execute(
    `INSERT OR IGNORE INTO StoreSettings (id, storeName, storeCode, currencyCode, taxLabel, taxRate, address, receiptFooter) VALUES ('default', 'NCT Seafoods POS', 'NCT-MAIN', 'PHP', 'VAT', 0.12, 'Manila, Philippines', 'Thank you for your purchase!')`
  );
}

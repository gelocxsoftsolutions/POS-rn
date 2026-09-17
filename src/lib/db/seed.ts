import { getDatabase, query, execute } from "./connection";
import { v4 as uuid } from "uuid";
import { sha256 } from "@/lib/crypto/ed25519";

export async function seedIfNeeded(): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) as c FROM Cashier"
  );
  if (row && row.c > 0) return;

  const now = new Date().toISOString();
  const defaultRoleId = uuid();

  await execute(
    `INSERT OR IGNORE INTO Role (id, name, description, isSystem, createdAt) VALUES (?, ?, ?, 1, ?)`,
    [defaultRoleId, "Admin", "Full access", now]
  );

  const adminCashierId = uuid();
  await execute(
    `INSERT OR IGNORE INTO Cashier (id, employeeId, username, displayName, pinHash, roleId, active, pinLoginEnabled, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)`,
    [adminCashierId, "EMP001", "admin", "Administrator", sha256("1234"), defaultRoleId, now]
  );

  await execute(
    `INSERT OR IGNORE INTO StoreSettings (id, storeName, storeCode, currencyCode, taxLabel, taxRate, address, receiptFooter) VALUES ('default', 'NCT Seafoods POS', 'NCT-MAIN', 'PHP', 'VAT', 12, 'Manila, Philippines', 'Thank you for your purchase!')`
  );
}

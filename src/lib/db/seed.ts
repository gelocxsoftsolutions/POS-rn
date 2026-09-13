import { getDatabase, query, execute } from "./connection";
import { v4 as uuid } from "uuid";

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
    [adminCashierId, "EMP001", "admin", "Administrator", "1234", defaultRoleId, now]
  );

  const categories = ["Seafood", "Meat", "Produce", "Dairy", "Beverages"];
  const catIds: string[] = [];
  for (const name of categories) {
    const id = uuid();
    catIds.push(id);
    await execute(
      `INSERT OR IGNORE INTO Category (id, name, active, createdAt) VALUES (?, ?, 1, ?)`,
      [id, name, now]
    );
  }

  const products = [
    { name: "Fresh Shrimp (per kg)", sku: "SHR-001", cat: 0, price: 450 },
    { name: "Tuna Belly (per kg)", sku: "TUN-001", cat: 0, price: 380 },
    { name: "Salmon Fillet (per kg)", sku: "SAL-001", cat: 0, price: 650 },
    { name: "Squid (per kg)", sku: "SQU-001", cat: 0, price: 280 },
    { name: "Crab (per kg)", sku: "CRA-001", cat: 0, price: 520 },
    { name: "Chicken Breast (per kg)", sku: "CHI-001", cat: 1, price: 220 },
    { name: "Pork Belly (per kg)", sku: "POR-001", cat: 1, price: 320 },
    { name: "Fresh Milk (1L)", sku: "MLK-001", cat: 3, price: 85 },
    { name: "Apple (per kg)", sku: "APL-001", cat: 2, price: 150 },
    { name: "Bottled Water (1L)", sku: "WTR-001", cat: 4, price: 25 },
  ];

  for (const p of products) {
    const prodId = uuid();
    await execute(
      `INSERT OR IGNORE INTO Product (id, sku, name, categoryId, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
      [prodId, p.sku, p.name, catIds[p.cat], now, now]
    );
    await execute(
      `INSERT OR IGNORE INTO ProductPrice (id, productId, priceList, price, currency, createdAt) VALUES (?, ?, 'retail', ?, 'PHP', ?)`,
      [uuid(), prodId, p.price, now]
    );
    await execute(
      `INSERT OR IGNORE INTO PosInventory (id, productId, availableQty, minimumStock, maximumStock, updatedAt) VALUES (?, ?, ?, 10, 500, ?)`,
      [uuid(), prodId, Math.floor(Math.random() * 200) + 20, now]
    );
  }

  await execute(
    `INSERT OR IGNORE INTO StoreSettings (id, storeName, storeCode, currencyCode, taxLabel, taxRate, address, receiptFooter) VALUES ('default', 'NCT Seafoods POS', 'NCT-MAIN', 'PHP', 'VAT', 12, 'Manila, Philippines', 'Thank you for your purchase!')`
  );
}

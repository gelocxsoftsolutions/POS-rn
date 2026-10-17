import * as SQLite from "expo-sqlite";
import { CREATE_TABLES, SCHEMA_VERSION } from "./schema";

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync("nct_pos.db");
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync("PRAGMA foreign_keys = ON;");
  await runMigrations(db);
  return db;
}

async function runMigrations(database: SQLite.SQLiteDatabase) {
  await database.execAsync("PRAGMA foreign_keys = OFF;");

  await database.execAsync(
    "CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, v INTEGER)"
  );

  for (const sql of CREATE_TABLES) {
    await database.execAsync(sql);
  }

  // Migration to v4: add weight column to Product if missing
  try {
    await database.execAsync("ALTER TABLE Product ADD COLUMN weight REAL DEFAULT NULL");
  } catch {
    // column already exists
  }

  // Migration to v5: add weight column to SaleItem if missing
  try {
    await database.execAsync("ALTER TABLE SaleItem ADD COLUMN weight REAL DEFAULT NULL");
  } catch {
    // column already exists
  }

  // Migration to v6: keep locally selected cashier profile photos.
  try {
    await database.execAsync("ALTER TABLE Cashier ADD COLUMN photoUri TEXT DEFAULT NULL");
  } catch {
    // column already exists
  }

  // Migration to v7: persist PIN failures and administrative account locks.
  for (const sql of [
    "ALTER TABLE Cashier ADD COLUMN failedPinAttempts INTEGER DEFAULT 0",
    "ALTER TABLE Cashier ADD COLUMN accountLocked INTEGER DEFAULT 0",
    "ALTER TABLE Cashier ADD COLUMN accountLockedAt TEXT DEFAULT NULL",
  ]) {
    try {
      await database.execAsync(sql);
    } catch {
      // column already exists
    }
  }

  // Migration to v8: configurable business identity, capabilities, receipt
  // snapshots, and recoverable upload metadata. Existing installations retain
  // the NCT-dependent defaults and all current data.
  for (const sql of [
    "ALTER TABLE Product ADD COLUMN businessId TEXT DEFAULT 'nct-default'",
    "ALTER TABLE Product ADD COLUMN identitySource TEXT DEFAULT 'NCT'",
    "ALTER TABLE Product ADD COLUMN omsVariationId TEXT DEFAULT NULL",
    "ALTER TABLE Sale ADD COLUMN businessId TEXT DEFAULT 'nct-default'",
    "ALTER TABLE Sale ADD COLUMN originMode TEXT DEFAULT 'NCT_DEPENDENT'",
    "ALTER TABLE Receipt ADD COLUMN templateVersion INTEGER DEFAULT 1",
    "ALTER TABLE Receipt ADD COLUMN templateSnapshot TEXT DEFAULT NULL",
    "ALTER TABLE StoreSettings ADD COLUMN businessId TEXT DEFAULT 'nct-default'",
    "ALTER TABLE StoreSettings ADD COLUMN operatingMode TEXT DEFAULT 'NCT_DEPENDENT'",
    "ALTER TABLE StoreSettings ADD COLUMN posSystemName TEXT DEFAULT 'NCT Seafoods POS'",
    "ALTER TABLE StoreSettings ADD COLUMN headerName TEXT DEFAULT 'NCT Seafoods'",
    "ALTER TABLE StoreSettings ADD COLUMN businessLogoUri TEXT DEFAULT NULL",
    "ALTER TABLE StoreSettings ADD COLUMN receiptLogoUri TEXT DEFAULT NULL",
    "ALTER TABLE StoreSettings ADD COLUMN contactEmail TEXT DEFAULT ''",
    "ALTER TABLE StoreSettings ADD COLUMN receiptTemplateJson TEXT DEFAULT NULL",
    "ALTER TABLE StoreSettings ADD COLUMN receiptTemplateVersion INTEGER DEFAULT 1",
    "ALTER TABLE StoreSettings ADD COLUMN modeChangedAt TEXT DEFAULT NULL",
    "ALTER TABLE SyncQueue ADD COLUMN dedupeKey TEXT DEFAULT NULL",
  ]) {
    try {
      await database.execAsync(sql);
    } catch {
      // column already exists
    }
  }

  await database.execAsync(
    "UPDATE Product SET businessId = 'nct-default' WHERE businessId IS NULL OR businessId = ''"
  );
  await database.execAsync(
    "UPDATE Product SET identitySource = 'NCT' WHERE identitySource IS NULL OR identitySource = ''"
  );
  await database.execAsync(
    "UPDATE Sale SET businessId = 'nct-default' WHERE businessId IS NULL OR businessId = ''"
  );
  await database.execAsync(
    "UPDATE Sale SET originMode = 'NCT_DEPENDENT' WHERE originMode IS NULL OR originMode = ''"
  );
  await database.execAsync(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_queue_dedupe ON SyncQueue(dedupeKey) WHERE dedupeKey IS NOT NULL"
  );
  await database.execAsync(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_product_oms_identity ON Product(businessId, omsVariationId) WHERE omsVariationId IS NOT NULL"
  );
  await database.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_product_action_audit_product ON ProductActionAudit(productId, createdAt)"
  );
  await database.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_product_action_audit_business ON ProductActionAudit(businessId, createdAt)"
  );
  await database.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_user_permission_cashier ON UserPermission(cashierId)"
  );

  await database.execAsync("PRAGMA foreign_keys = ON;");

  await database.runAsync(
    "INSERT OR REPLACE INTO _meta (key, v) VALUES ('schema_version', ?)",
    [SCHEMA_VERSION]
  );
}

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) throw new Error("Database not initialized. Call getDatabase() first.");
  return db;
}

export async function query<T = any>(
  sql: string,
  params?: any[]
): Promise<T[]> {
  const database = await getDatabase();
  return database.getAllAsync<T>(sql, params ?? []);
}

export async function queryFirst<T = any>(
  sql: string,
  params?: any[]
): Promise<T | null> {
  const database = await getDatabase();
  return database.getFirstAsync<T>(sql, params ?? []);
}

export async function execute(
  sql: string,
  params?: any[]
): Promise<SQLite.SQLiteRunResult> {
  const database = await getDatabase();
  return database.runAsync(sql, params ?? []);
}

export async function executeBatch(
  statements: Array<{ sql: string; params?: any[] }>
): Promise<void> {
  const database = await getDatabase();
  for (const stmt of statements) {
    await database.runAsync(stmt.sql, stmt.params ?? []);
  }
}

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
  const row = await database.getFirstAsync<{ v: number }>(
    "SELECT v FROM sqlite_master WHERE type='table' AND name='_meta'"
  );
  if (!row) {
    await database.execAsync(
      "CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, v INTEGER)"
    );
  }

  const versionRow = await database.getFirstAsync<{ v: number }>(
    "SELECT v FROM _meta WHERE key = 'schema_version'"
  );
  const currentVersion = versionRow?.v ?? 0;

  if (currentVersion < SCHEMA_VERSION) {
    await database.execAsync("PRAGMA foreign_keys = OFF;");
    for (const sql of CREATE_TABLES) {
      await database.execAsync(sql);
    }
    await database.execAsync("PRAGMA foreign_keys = ON;");
    await database.runAsync(
      "INSERT OR REPLACE INTO _meta (key, v) VALUES ('schema_version', ?)",
      [SCHEMA_VERSION]
    );
  }
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

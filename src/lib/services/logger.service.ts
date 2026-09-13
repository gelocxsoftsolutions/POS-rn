import { query, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";

export interface LogEntry {
  id: string;
  level: string;
  type: string | null;
  message: string;
  details: string | null;
  createdAt: string;
}

async function writeLog(
  level: string,
  type: string | null,
  message: string,
  details?: string
): Promise<void> {
  try {
    const id = uuid();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO Log (id, level, type, message, details, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, level, type ?? null, message, details ?? null, now]
    );
  } catch {
    // logging should never crash the caller
  }
}

export const LoggerService = {
  async info(module: string, message: string, details?: string) {
    await writeLog("INFO", module, message, details);
  },

  async warn(module: string, message: string, details?: string) {
    await writeLog("WARN", module, message, details);
  },

  async error(module: string, message: string, details?: string) {
    await writeLog("ERROR", module, message, details);
  },

  async recent(limit: number = 100): Promise<LogEntry[]> {
    try {
      return await query<LogEntry>(
        "SELECT * FROM Log ORDER BY createdAt DESC LIMIT ?",
        [limit]
      );
    } catch {
      return [];
    }
  },
};

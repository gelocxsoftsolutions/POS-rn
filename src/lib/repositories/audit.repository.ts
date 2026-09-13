import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";

export interface AuditLogRow {
  id: string;
  eventType: string;
  description: string | null;
  cashierId: string | null;
  cashierName: string | null;
  roleId: string | null;
  ipAddress: string | null;
  metadata: string | null;
  createdAt: string;
}

export interface CreateAuditLogInput {
  eventType: string;
  description?: string;
  cashierId?: string;
  cashierName?: string;
  roleId?: string;
  ipAddress?: string;
  metadata?: string;
}

export const AuditRepository = {
  async create(input: CreateAuditLogInput): Promise<AuditLogRow> {
    const id = uuid();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO AuditLog (id, eventType, description, cashierId, cashierName, roleId, ipAddress, metadata, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.eventType,
        input.description ?? null,
        input.cashierId ?? null,
        input.cashierName ?? null,
        input.roleId ?? null,
        input.ipAddress ?? null,
        input.metadata ?? null,
        now,
      ]
    );
    return queryFirst<AuditLogRow>(
      "SELECT * FROM AuditLog WHERE id = ?",
      [id]
    ) as Promise<AuditLogRow>;
  },

  async findRecent(limit: number = 50): Promise<AuditLogRow[]> {
    return query<AuditLogRow>(
      "SELECT * FROM AuditLog ORDER BY createdAt DESC LIMIT ?",
      [limit]
    );
  },

  async findByEvent(eventType: string): Promise<AuditLogRow[]> {
    return query<AuditLogRow>(
      "SELECT * FROM AuditLog WHERE eventType = ? ORDER BY createdAt DESC",
      [eventType]
    );
  },
};

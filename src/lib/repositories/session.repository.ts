import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";

export interface CashierSessionRow {
  id: string;
  cashierId: string;
  cashierName: string | null;
  cashierRole: string | null;
  roleId: string | null;
  loginType: string;
  loginTime: string;
  logoutTime: string | null;
  lastActivity: string | null;
  deviceId: string | null;
  deviceName: string | null;
  currentShiftId: string | null;
  active: number;
  locked: number;
  lockedAt: string | null;
}

export interface CreateSessionInput {
  cashierId: string;
  cashierName?: string;
  cashierRole?: string;
  roleId?: string;
  loginType?: string;
  deviceId?: string;
  deviceName?: string;
  currentShiftId?: string;
}

export const SessionRepository = {
  async create(input: CreateSessionInput): Promise<CashierSessionRow> {
    const id = uuid();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO CashierSession (id, cashierId, cashierName, cashierRole, roleId, loginType, loginTime, lastActivity, deviceId, deviceName, currentShiftId, active, locked)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        id,
        input.cashierId,
        input.cashierName ?? null,
        input.cashierRole ?? null,
        input.roleId ?? null,
        input.loginType ?? "pin",
        now,
        now,
        input.deviceId ?? null,
        input.deviceName ?? null,
        input.currentShiftId ?? null,
      ]
    );
    return this.findById(id) as Promise<CashierSessionRow>;
  },

  async findById(id: string): Promise<CashierSessionRow | null> {
    return queryFirst<CashierSessionRow>(
      "SELECT * FROM CashierSession WHERE id = ?",
      [id]
    );
  },

  async findActiveByCashierId(cashierId: string): Promise<CashierSessionRow | null> {
    return queryFirst<CashierSessionRow>(
      "SELECT * FROM CashierSession WHERE cashierId = ? AND active = 1 ORDER BY loginTime DESC LIMIT 1",
      [cashierId]
    );
  },

  async deactivate(id: string): Promise<void> {
    const now = new Date().toISOString();
    await execute(
      "UPDATE CashierSession SET active = 0, logoutTime = ? WHERE id = ?",
      [now, id]
    );
  },

  async lock(id: string): Promise<void> {
    const now = new Date().toISOString();
    await execute(
      "UPDATE CashierSession SET locked = 1, lockedAt = ? WHERE id = ?",
      [now, id]
    );
  },

  async unlock(id: string): Promise<void> {
    await execute(
      "UPDATE CashierSession SET locked = 0, lockedAt = NULL WHERE id = ?",
      [id]
    );
  },

  async updateActivity(id: string): Promise<void> {
    const now = new Date().toISOString();
    await execute(
      "UPDATE CashierSession SET lastActivity = ? WHERE id = ?",
      [now, id]
    );
  },
};

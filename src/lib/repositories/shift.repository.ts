import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";

export interface ShiftRow {
  id: string;
  shiftNumber: string | null;
  cashierId: string | null;
  cashierName: string | null;
  deviceId: string | null;
  deviceName: string | null;
  branchId: number | null;
  branchName: string | null;
  openedAt: string;
  closedAt: string | null;
  openingFloat: number;
  expectedCash: number | null;
  actualCash: number | null;
  difference: number | null;
  notes: string | null;
  status: string;
}

export interface CreateShiftInput {
  shiftNumber?: string;
  cashierId?: string;
  cashierName?: string;
  deviceId?: string;
  deviceName?: string;
  branchId?: number;
  branchName?: string;
  openingFloat?: number;
  notes?: string;
}

export interface CloseShiftInput {
  expectedCash?: number;
  actualCash?: number;
  difference?: number;
  notes?: string;
}

export const ShiftRepository = {
  async findCurrent(): Promise<ShiftRow | null> {
    return queryFirst<ShiftRow>(
      "SELECT * FROM Shift WHERE status = 'OPEN' ORDER BY openedAt DESC LIMIT 1"
    );
  },

  async create(input: CreateShiftInput): Promise<ShiftRow> {
    const id = uuid();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO Shift (id, shiftNumber, cashierId, cashierName, deviceId, deviceName, branchId, branchName, openedAt, openingFloat, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
      [
        id,
        input.shiftNumber ?? null,
        input.cashierId ?? null,
        input.cashierName ?? null,
        input.deviceId ?? null,
        input.deviceName ?? null,
        input.branchId ?? null,
        input.branchName ?? null,
        now,
        input.openingFloat ?? 0,
        input.notes ?? null,
      ]
    );
    return queryFirst<ShiftRow>(
      "SELECT * FROM Shift WHERE id = ?",
      [id]
    ) as Promise<ShiftRow>;
  },

  async close(id: string, input: CloseShiftInput): Promise<ShiftRow | null> {
    const now = new Date().toISOString();
    await execute(
      `UPDATE Shift SET closedAt = ?, expectedCash = ?, actualCash = ?, difference = ?, notes = ?, status = 'CLOSED' WHERE id = ?`,
      [
        now,
        input.expectedCash ?? null,
        input.actualCash ?? null,
        input.difference ?? null,
        input.notes ?? null,
        id,
      ]
    );
    return queryFirst<ShiftRow>(
      "SELECT * FROM Shift WHERE id = ?",
      [id]
    );
  },
};

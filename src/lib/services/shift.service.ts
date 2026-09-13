import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";

export interface ShiftDTO {
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

export const ShiftService = {
  async open(
    cashierId: string,
    cashierName: string,
    deviceId: string,
    branchId: number,
    openingFloat: number = 0
  ): Promise<ShiftDTO | null> {
    try {
      const id = uuid();
      const now = new Date().toISOString();
      const today = now.split("T")[0];

      const countResult = await queryFirst<{ c: number }>(
        "SELECT COUNT(*) as c FROM Shift WHERE openedAt LIKE ?",
        [`${today}%`]
      );
      const seq = String((countResult?.c ?? 0) + 1).padStart(4, "0");
      const shiftNumber = `${today.replace(/-/g, "")}-${seq}`;

      await execute(
        `INSERT INTO Shift (id, shiftNumber, cashierId, cashierName, deviceId, branchId, openedAt, openingFloat, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
        [id, shiftNumber, cashierId, cashierName, deviceId, branchId, now, openingFloat]
      );

      return queryFirst<ShiftDTO>("SELECT * FROM Shift WHERE id = ?", [id]);
    } catch {
      return null;
    }
  },

  async close(
    shiftId: string,
    actualCash: number
  ): Promise<ShiftDTO | null> {
    try {
      const row = await queryFirst<{ s: number }>(
        "SELECT COALESCE(SUM(total), 0) as s FROM Sale WHERE shiftId = ? AND paymentMethod = 'CASH' AND status = 'COMPLETED'",
        [shiftId]
      );
      const expectedCash = row?.s ?? 0;
      const difference = actualCash - expectedCash;
      const now = new Date().toISOString();

      await execute(
        `UPDATE Shift SET closedAt = ?, expectedCash = ?, actualCash = ?, difference = ?, status = 'CLOSED' WHERE id = ?`,
        [now, expectedCash, actualCash, difference, shiftId]
      );

      return queryFirst<ShiftDTO>("SELECT * FROM Shift WHERE id = ?", [shiftId]);
    } catch {
      return null;
    }
  },

  async getCurrent(deviceId: string): Promise<ShiftDTO | null> {
    try {
      return queryFirst<ShiftDTO>(
        "SELECT * FROM Shift WHERE deviceId = ? AND status = 'OPEN' ORDER BY openedAt DESC LIMIT 1",
        [deviceId]
      );
    } catch {
      return null;
    }
  },

  async list(deviceId: string, limit: number = 20): Promise<ShiftDTO[]> {
    try {
      return query<ShiftDTO>(
        "SELECT * FROM Shift WHERE deviceId = ? ORDER BY openedAt DESC LIMIT ?",
        [deviceId, limit]
      );
    } catch {
      return [];
    }
  },
};

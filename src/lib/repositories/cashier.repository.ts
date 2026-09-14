import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import { sha256 } from "@/lib/crypto/ed25519";

export interface CashierRow {
  id: string;
  employeeId: string | null;
  username: string | null;
  displayName: string;
  pinHash: string | null;
  passwordHash: string | null;
  roleId: string | null;
  active: number;
  pinLoginEnabled: number;
  passwordLoginEnabled: number;
  lastLogin: string | null;
  lastActivity: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCashierInput {
  employeeId?: string;
  username?: string;
  displayName: string;
  pinHash?: string;
  passwordHash?: string;
  roleId?: string;
}

export interface UpdateCashierInput {
  employeeId?: string;
  username?: string;
  displayName?: string;
  pinHash?: string;
  passwordHash?: string;
  roleId?: string;
  active?: boolean;
  pinLoginEnabled?: boolean;
  passwordLoginEnabled?: boolean;
}

export const CashierRepository = {
  async findById(id: string): Promise<CashierRow | null> {
    return queryFirst<CashierRow>(
      "SELECT * FROM Cashier WHERE id = ?",
      [id]
    );
  },

  async findByPinHash(pinHash: string): Promise<CashierRow | null> {
    return queryFirst<CashierRow>(
      "SELECT * FROM Cashier WHERE pinHash = ? AND active = 1",
      [pinHash]
    );
  },

  async findByUsername(username: string): Promise<CashierRow | null> {
    return queryFirst<CashierRow>(
      "SELECT * FROM Cashier WHERE username = ? AND active = 1",
      [username]
    );
  },

  async findAll(): Promise<CashierRow[]> {
    return query<CashierRow>(
      "SELECT * FROM Cashier WHERE active = 1 ORDER BY displayName ASC"
    );
  },

  async create(input: CreateCashierInput): Promise<CashierRow> {
    const id = uuid();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO Cashier (id, employeeId, username, displayName, pinHash, passwordHash, roleId, active, pinLoginEnabled, passwordLoginEnabled, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 0, ?, ?)`,
      [
        id,
        input.employeeId ?? null,
        input.username ?? null,
        input.displayName,
        input.pinHash ?? null,
        input.passwordHash ?? null,
        input.roleId ?? null,
        now,
        now,
      ]
    );
    return this.findById(id) as Promise<CashierRow>;
  },

  async update(id: string, input: UpdateCashierInput): Promise<CashierRow | null> {
    const fields: string[] = [];
    const values: any[] = [];

    if (input.employeeId !== undefined) { fields.push("employeeId = ?"); values.push(input.employeeId); }
    if (input.username !== undefined) { fields.push("username = ?"); values.push(input.username); }
    if (input.displayName !== undefined) { fields.push("displayName = ?"); values.push(input.displayName); }
    if (input.pinHash !== undefined) { fields.push("pinHash = ?"); values.push(input.pinHash); }
    if (input.passwordHash !== undefined) { fields.push("passwordHash = ?"); values.push(input.passwordHash); }
    if (input.roleId !== undefined) { fields.push("roleId = ?"); values.push(input.roleId); }
    if (input.active !== undefined) { fields.push("active = ?"); values.push(input.active ? 1 : 0); }
    if (input.pinLoginEnabled !== undefined) { fields.push("pinLoginEnabled = ?"); values.push(input.pinLoginEnabled ? 1 : 0); }
    if (input.passwordLoginEnabled !== undefined) { fields.push("passwordLoginEnabled = ?"); values.push(input.passwordLoginEnabled ? 1 : 0); }

    if (fields.length === 0) return this.findById(id);

    fields.push("updatedAt = ?");
    values.push(new Date().toISOString());
    values.push(id);

    await execute(
      `UPDATE Cashier SET ${fields.join(", ")} WHERE id = ?`,
      values
    );
    return this.findById(id);
  },

  async count(): Promise<number> {
    const result = await queryFirst<{ c: number }>(
      "SELECT COUNT(*) as c FROM Cashier WHERE active = 1"
    );
    return result?.c ?? 0;
  },

  async upsert(input: {
    id: string;
    username: string;
    displayName: string;
    pin: string;
    roleId: string;
    roleName: string;
    active: boolean;
  }): Promise<CashierRow> {
    const existing = await this.findById(input.id);
    const now = new Date().toISOString();

    if (existing) {
      await execute(
        `UPDATE Cashier SET username = ?, displayName = ?, roleId = ?, active = ?, updatedAt = ? WHERE id = ?`,
        [input.username, input.displayName, input.roleId, input.active ? 1 : 0, now, input.id]
      );
      return this.findById(input.id) as Promise<CashierRow>;
    }

    await execute(
      `INSERT INTO Cashier (id, username, displayName, pinHash, roleId, active, pinLoginEnabled, passwordLoginEnabled, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
      [input.id, input.username, input.displayName, sha256(input.pin), input.roleId, input.active ? 1 : 0, now, now]
    );
    return this.findById(input.id) as Promise<CashierRow>;
  },
};

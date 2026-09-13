import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";

export interface DeviceRow {
  id: string;
  deviceCode: string | null;
  deviceName: string | null;
  publicIdentifier: string | null;
  branchId: number | null;
  branchName: string | null;
  branchAddress: string | null;
  status: string;
  provisionVersion: number;
  configVersion: number;
  registeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeviceInput {
  deviceCode?: string;
  deviceName?: string;
  publicIdentifier?: string;
  branchId?: number;
  branchName?: string;
  branchAddress?: string;
  status?: string;
}

export interface UpdateDeviceInput {
  deviceCode?: string;
  deviceName?: string;
  publicIdentifier?: string;
  branchId?: number;
  branchName?: string;
  branchAddress?: string;
  status?: string;
  provisionVersion?: number;
  configVersion?: number;
}

export const DeviceRepository = {
  async find(): Promise<DeviceRow | null> {
    return queryFirst<DeviceRow>(
      "SELECT * FROM Device ORDER BY createdAt DESC LIMIT 1"
    );
  },

  async create(input: CreateDeviceInput): Promise<DeviceRow> {
    const id = uuid();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO Device (id, deviceCode, deviceName, publicIdentifier, branchId, branchName, branchAddress, status, provisionVersion, configVersion, registeredAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
      [
        id,
        input.deviceCode ?? null,
        input.deviceName ?? null,
        input.publicIdentifier ?? null,
        input.branchId ?? null,
        input.branchName ?? null,
        input.branchAddress ?? null,
        input.status ?? "PENDING",
        input.status === "REGISTERED" || input.status === "PROVISIONED" ? now : null,
        now,
        now,
      ]
    );
    return queryFirst<DeviceRow>("SELECT * FROM Device WHERE id = ?", [id]) as Promise<DeviceRow>;
  },

  async update(id: string, input: UpdateDeviceInput): Promise<DeviceRow | null> {
    const fields: string[] = [];
    const values: any[] = [];

    if (input.deviceCode !== undefined) { fields.push("deviceCode = ?"); values.push(input.deviceCode); }
    if (input.deviceName !== undefined) { fields.push("deviceName = ?"); values.push(input.deviceName); }
    if (input.publicIdentifier !== undefined) { fields.push("publicIdentifier = ?"); values.push(input.publicIdentifier); }
    if (input.branchId !== undefined) { fields.push("branchId = ?"); values.push(input.branchId); }
    if (input.branchName !== undefined) { fields.push("branchName = ?"); values.push(input.branchName); }
    if (input.branchAddress !== undefined) { fields.push("branchAddress = ?"); values.push(input.branchAddress); }
    if (input.status !== undefined) { fields.push("status = ?"); values.push(input.status); }
    if (input.provisionVersion !== undefined) { fields.push("provisionVersion = ?"); values.push(input.provisionVersion); }
    if (input.configVersion !== undefined) { fields.push("configVersion = ?"); values.push(input.configVersion); }

    if (fields.length === 0) {
      return queryFirst<DeviceRow>("SELECT * FROM Device WHERE id = ?", [id]);
    }

    fields.push("updatedAt = ?");
    values.push(new Date().toISOString());
    values.push(id);

    await execute(
      `UPDATE Device SET ${fields.join(", ")} WHERE id = ?`,
      values
    );
    return queryFirst<DeviceRow>("SELECT * FROM Device WHERE id = ?", [id]);
  },

  async clear(): Promise<void> {
    await execute("DELETE FROM Device");
  },
};

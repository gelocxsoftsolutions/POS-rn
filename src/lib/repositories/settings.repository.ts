import { query, queryFirst, execute } from "@/lib/db/connection";

export interface StoreSettingsRow {
  id: string;
  storeName: string;
  storeCode: string;
  currencyCode: string;
  taxLabel: string;
  taxRate: number;
  supportPhone: string;
  address: string;
  receiptFooter: string;
  updatedAt: string;
}

export interface UpsertSettingsInput {
  storeName?: string;
  storeCode?: string;
  currencyCode?: string;
  taxLabel?: string;
  taxRate?: number;
  supportPhone?: string;
  address?: string;
  receiptFooter?: string;
}

export const SettingsRepository = {
  async get(): Promise<StoreSettingsRow> {
    const row = await queryFirst<StoreSettingsRow>(
      "SELECT * FROM StoreSettings WHERE id = 'default'"
    );
    if (row) return row;

    const now = new Date().toISOString();
    await execute(
      `INSERT INTO StoreSettings (id, storeName, storeCode, currencyCode, taxLabel, taxRate, supportPhone, address, receiptFooter, updatedAt)
       VALUES ('default', '', '', 'PHP', 'VAT', 0, '', '', '', ?)`,
      [now]
    );
    return queryFirst<StoreSettingsRow>(
      "SELECT * FROM StoreSettings WHERE id = 'default'"
    ) as Promise<StoreSettingsRow>;
  },

  async upsert(input: UpsertSettingsInput): Promise<StoreSettingsRow> {
    const existing = await this.get();
    const now = new Date().toISOString();

    const fields: string[] = [];
    const values: any[] = [];

    if (input.storeName !== undefined) { fields.push("storeName = ?"); values.push(input.storeName); }
    if (input.storeCode !== undefined) { fields.push("storeCode = ?"); values.push(input.storeCode); }
    if (input.currencyCode !== undefined) { fields.push("currencyCode = ?"); values.push(input.currencyCode); }
    if (input.taxLabel !== undefined) { fields.push("taxLabel = ?"); values.push(input.taxLabel); }
    if (input.taxRate !== undefined) { fields.push("taxRate = ?"); values.push(input.taxRate); }
    if (input.supportPhone !== undefined) { fields.push("supportPhone = ?"); values.push(input.supportPhone); }
    if (input.address !== undefined) { fields.push("address = ?"); values.push(input.address); }
    if (input.receiptFooter !== undefined) { fields.push("receiptFooter = ?"); values.push(input.receiptFooter); }

    if (fields.length === 0) return existing;

    fields.push("updatedAt = ?");
    values.push(now);

    await execute(
      `UPDATE StoreSettings SET ${fields.join(", ")} WHERE id = 'default'`,
      values
    );
    return this.get();
  },
};

import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import type { BarcodeDTO } from "@/lib/types/inventory";
import { canonicalScannedCode, normalizeScannedCode } from "@/lib/barcodes/normalize-scanned-code";

export interface UpsertBarcodeInput {
  productId: string;
  barcode: string;
  type?: string;
}

export const BarcodeRepository = {
  async findByBarcode(barcode: string): Promise<BarcodeDTO | null> {
    const normalized = normalizeScannedCode(barcode);
    if (!normalized) return null;

    const exact = await queryFirst<BarcodeDTO>(
      "SELECT * FROM Barcode WHERE barcode = ? AND active = 1",
      [normalized]
    );
    if (exact) return exact;

    const canonical = canonicalScannedCode(normalized);
    const caseInsensitive = await queryFirst<BarcodeDTO>(
      `SELECT * FROM Barcode
       WHERE active = 1
         AND UPPER(REPLACE(TRIM(barcode), ' ', '')) = ?
       LIMIT 1`,
      [canonical]
    );
    if (caseInsensitive) return caseInsensitive;

    const rows = await query<BarcodeDTO>(
      "SELECT * FROM Barcode WHERE active = 1"
    );
    return rows.find((row) => canonicalScannedCode(row.barcode) === canonical) ?? null;
  },

  async findByProduct(productId: string): Promise<BarcodeDTO[]> {
    return query<BarcodeDTO>(
      "SELECT * FROM Barcode WHERE productId = ? AND active = 1 ORDER BY type ASC",
      [productId]
    );
  },

  async upsert(input: UpsertBarcodeInput): Promise<BarcodeDTO> {
    const existing = await queryFirst<BarcodeDTO>(
      "SELECT * FROM Barcode WHERE productId = ? AND barcode = ?",
      [input.productId, input.barcode]
    );

    const now = new Date().toISOString();

    if (existing) {
      await execute(
        `UPDATE Barcode SET type = ?, active = 1, updatedAt = ? WHERE id = ?`,
        [input.type ?? "primary", now, existing.id]
      );
      return queryFirst<BarcodeDTO>(
        "SELECT * FROM Barcode WHERE id = ?",
        [existing.id]
      ) as Promise<BarcodeDTO>;
    }

    const id = uuid();
    await execute(
      `INSERT INTO Barcode (id, productId, barcode, type, active, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [id, input.productId, input.barcode, input.type ?? "primary", now, now]
    );
    return queryFirst<BarcodeDTO>(
      "SELECT * FROM Barcode WHERE id = ?",
      [id]
    ) as Promise<BarcodeDTO>;
  },

  async listAll(): Promise<BarcodeDTO[]> {
    return query<BarcodeDTO>(
      "SELECT * FROM Barcode WHERE active = 1 ORDER BY productId, type ASC"
    );
  },
};

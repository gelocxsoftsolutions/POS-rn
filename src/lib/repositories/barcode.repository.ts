import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import type { BarcodeDTO } from "@/lib/types/inventory";

export interface UpsertBarcodeInput {
  productId: string;
  barcode: string;
  type?: string;
}

export const BarcodeRepository = {
  async findByBarcode(barcode: string): Promise<BarcodeDTO | null> {
    return queryFirst<BarcodeDTO>(
      "SELECT * FROM Barcode WHERE barcode = ? AND active = 1",
      [barcode]
    );
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

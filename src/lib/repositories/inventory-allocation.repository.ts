import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";

export interface InventoryAllocationRow {
  id: string;
  productId: string;
  allocatedQty: number;
  source: string;
  referenceNumber: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const InventoryAllocationRepository = {
  async findByProduct(productId: string): Promise<InventoryAllocationRow[]> {
    return query<InventoryAllocationRow>(
      "SELECT * FROM InventoryAllocation WHERE productId = ? ORDER BY createdAt DESC",
      [productId]
    );
  },

  async create(data: {
    productId: string;
    allocatedQty: number;
    source?: string;
    referenceNumber?: string;
    notes?: string;
  }): Promise<InventoryAllocationRow> {
    const id = uuid();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO InventoryAllocation (id, productId, allocatedQty, source, referenceNumber, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.productId,
        data.allocatedQty,
        data.source ?? "oms",
        data.referenceNumber ?? null,
        data.notes ?? null,
        now,
        now,
      ]
    );
    return queryFirst<InventoryAllocationRow>(
      "SELECT * FROM InventoryAllocation WHERE id = ?",
      [id]
    ) as Promise<InventoryAllocationRow>;
  },
};

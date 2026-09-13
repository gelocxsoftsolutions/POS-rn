import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import type { InventoryDTO } from "@/lib/types/inventory";

export const InventoryRepository = {
  async findByProduct(productId: string): Promise<InventoryDTO | null> {
    return queryFirst<InventoryDTO>(
      "SELECT * FROM PosInventory WHERE productId = ?",
      [productId]
    );
  },

  async findLowStock(): Promise<InventoryDTO[]> {
    return query<InventoryDTO>(
      `SELECT pi.* FROM PosInventory pi
       INNER JOIN Product p ON pi.productId = p.id
       WHERE p.status = 'ACTIVE' AND pi.availableQty <= pi.minimumStock
       ORDER BY pi.availableQty ASC`
    );
  },

  async listAll(): Promise<InventoryDTO[]> {
    return query<InventoryDTO>(
      `SELECT pi.* FROM PosInventory pi
       INNER JOIN Product p ON pi.productId = p.id
       WHERE p.status = 'ACTIVE'
       ORDER BY p.name ASC`
    );
  },

  async upsert(
    productId: string,
    data: Partial<Omit<InventoryDTO, "id" | "productId" | "updatedAt">>
  ): Promise<InventoryDTO> {
    const existing = await this.findByProduct(productId);
    const now = new Date().toISOString();

    if (existing) {
      const fields: string[] = [];
      const values: any[] = [];

      if (data.allocatedQty !== undefined) { fields.push("allocatedQty = ?"); values.push(data.allocatedQty); }
      if (data.availableQty !== undefined) { fields.push("availableQty = ?"); values.push(data.availableQty); }
      if (data.reservedQty !== undefined) { fields.push("reservedQty = ?"); values.push(data.reservedQty); }
      if (data.soldQty !== undefined) { fields.push("soldQty = ?"); values.push(data.soldQty); }
      if (data.damagedQty !== undefined) { fields.push("damagedQty = ?"); values.push(data.damagedQty); }
      if (data.adjustmentQty !== undefined) { fields.push("adjustmentQty = ?"); values.push(data.adjustmentQty); }
      if (data.minimumStock !== undefined) { fields.push("minimumStock = ?"); values.push(data.minimumStock); }
      if (data.maximumStock !== undefined) { fields.push("maximumStock = ?"); values.push(data.maximumStock); }

      if (fields.length === 0) return existing;

      fields.push("updatedAt = ?");
      values.push(now);
      values.push(existing.id);

      await execute(
        `UPDATE PosInventory SET ${fields.join(", ")} WHERE id = ?`,
        values
      );
      return this.findByProduct(productId) as Promise<InventoryDTO>;
    }

    const id = uuid();
    await execute(
      `INSERT INTO PosInventory (id, productId, allocatedQty, availableQty, reservedQty, soldQty, damagedQty, adjustmentQty, minimumStock, maximumStock, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        productId,
        data.allocatedQty ?? 0,
        data.availableQty ?? 0,
        data.reservedQty ?? 0,
        data.soldQty ?? 0,
        data.damagedQty ?? 0,
        data.adjustmentQty ?? 0,
        data.minimumStock ?? 0,
        data.maximumStock ?? 0,
        now,
        now,
      ]
    );
    return this.findByProduct(productId) as Promise<InventoryDTO>;
  },

  async updateQuantities(
    productId: string,
    deltas: {
      availableQty?: number;
      soldQty?: number;
      reservedQty?: number;
      damagedQty?: number;
      adjustmentQty?: number;
    }
  ): Promise<InventoryDTO | null> {
    const existing = await this.findByProduct(productId);
    if (!existing) return null;

    const now = new Date().toISOString();
    const sets: string[] = [];
    const values: any[] = [];

    if (deltas.availableQty !== undefined) {
      sets.push("availableQty = availableQty + ?");
      values.push(deltas.availableQty);
    }
    if (deltas.soldQty !== undefined) {
      sets.push("soldQty = soldQty + ?");
      values.push(deltas.soldQty);
    }
    if (deltas.reservedQty !== undefined) {
      sets.push("reservedQty = reservedQty + ?");
      values.push(deltas.reservedQty);
    }
    if (deltas.damagedQty !== undefined) {
      sets.push("damagedQty = damagedQty + ?");
      values.push(deltas.damagedQty);
    }
    if (deltas.adjustmentQty !== undefined) {
      sets.push("adjustmentQty = adjustmentQty + ?");
      values.push(deltas.adjustmentQty);
    }

    if (sets.length === 0) return existing;

    sets.push("updatedAt = ?");
    values.push(now);
    values.push(existing.id);

    await execute(
      `UPDATE PosInventory SET ${sets.join(", ")} WHERE id = ?`,
      values
    );
    return this.findByProduct(productId);
  },
};

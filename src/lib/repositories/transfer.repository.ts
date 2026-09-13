import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import type {
  InventoryTransferDTO,
  InventoryTransferItemDTO,
  PaginatedResult,
} from "@/lib/types/inventory";

export interface CreateTransferInput {
  transferNumber: string;
  sourceWarehouse?: string;
  destinationPos?: string;
  createdById?: string;
  createdByName?: string;
  notes?: string;
  items: Array<{
    productId: string;
    allocatedQty: number;
    unit?: string;
    remarks?: string;
  }>;
}

export interface TransferFilter {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export const TransferRepository = {
  async findById(id: string): Promise<InventoryTransferDTO | null> {
    const transfer = await queryFirst<InventoryTransferDTO>(
      "SELECT * FROM InventoryTransfer WHERE id = ?",
      [id]
    );
    if (!transfer) return null;

    const items = await query<InventoryTransferItemDTO>(
      `SELECT iti.*, p.name as productName, p.sku as productSku
       FROM InventoryTransferItem iti
       LEFT JOIN Product p ON iti.productId = p.id
       WHERE iti.transferId = ?`,
      [id]
    );

    return { ...transfer, items };
  },

  async findMany(filter: TransferFilter): Promise<PaginatedResult<InventoryTransferDTO>> {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: any[] = [];

    if (filter.search) {
      conditions.push("(transferNumber LIKE ? OR notes LIKE ?)");
      const term = `%${filter.search}%`;
      params.push(term, term);
    }
    if (filter.status) {
      conditions.push("status = ?");
      params.push(filter.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await queryFirst<{ c: number }>(
      `SELECT COUNT(*) as c FROM InventoryTransfer ${where}`,
      params
    );
    const total = countResult?.c ?? 0;

    const transfers = await query<InventoryTransferDTO>(
      `SELECT * FROM InventoryTransfer ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return {
      items: transfers,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  },

  async create(input: CreateTransferInput): Promise<InventoryTransferDTO> {
    const id = uuid();
    const now = new Date().toISOString();

    await execute(
      `INSERT INTO InventoryTransfer (id, transferNumber, sourceWarehouse, destinationPos, status, createdById, createdByName, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)`,
      [
        id,
        input.transferNumber,
        input.sourceWarehouse ?? null,
        input.destinationPos ?? null,
        input.createdById ?? null,
        input.createdByName ?? null,
        input.notes ?? null,
        now,
        now,
      ]
    );

    for (const item of input.items) {
      const itemId = uuid();
      await execute(
        `INSERT INTO InventoryTransferItem (id, transferId, productId, allocatedQty, receivedQty, unit, remarks, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        [
          itemId,
          id,
          item.productId,
          item.allocatedQty,
          item.unit ?? null,
          item.remarks ?? null,
          now,
          now,
        ]
      );
    }

    return this.findById(id) as Promise<InventoryTransferDTO>;
  },

  async updateStatus(
    id: string,
    status: string,
    userId?: string,
    userName?: string
  ): Promise<InventoryTransferDTO | null> {
    const now = new Date().toISOString();
    const fields: string[] = ["status = ?", "updatedAt = ?"];
    const values: any[] = [status, now];

    if (status === "APPROVED") {
      fields.push("approvedById = ?", "approvedByName = ?", "approvedAt = ?");
      values.push(userId ?? null, userName ?? null, now);
    } else if (status === "RECEIVED") {
      fields.push("receivedById = ?", "receivedByName = ?", "receivedAt = ?");
      values.push(userId ?? null, userName ?? null, now);
    }

    values.push(id);

    await execute(
      `UPDATE InventoryTransfer SET ${fields.join(", ")} WHERE id = ?`,
      values
    );
    return this.findById(id);
  },
};

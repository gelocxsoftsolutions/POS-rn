import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import type { InventoryLedgerEntryDTO, PaginatedResult } from "@/lib/types/inventory";

export interface CreateLedgerInput {
  movementType: string;
  referenceNumber?: string;
  productId: string;
  quantity: number;
  balanceBefore?: number;
  balanceAfter?: number;
  notes?: string;
  createdById?: string;
  createdByName?: string;
}

export const InventoryLedgerRepository = {
  async create(input: CreateLedgerInput): Promise<InventoryLedgerEntryDTO> {
    const id = uuid();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO InventoryLedger (id, movementType, referenceNumber, productId, quantity, balanceBefore, balanceAfter, notes, createdById, createdByName, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.movementType,
        input.referenceNumber ?? null,
        input.productId,
        input.quantity,
        input.balanceBefore ?? 0,
        input.balanceAfter ?? 0,
        input.notes ?? null,
        input.createdById ?? null,
        input.createdByName ?? null,
        now,
      ]
    );
    return queryFirst<InventoryLedgerEntryDTO>(
      `SELECT il.*, p.name as productName, p.sku as productSku
       FROM InventoryLedger il
       LEFT JOIN Product p ON il.productId = p.id
       WHERE il.id = ?`,
      [id]
    ) as Promise<InventoryLedgerEntryDTO>;
  },

  async findByProduct(
    productId: string,
    page: number = 1,
    pageSize: number = 20
  ): Promise<PaginatedResult<InventoryLedgerEntryDTO>> {
    const offset = (page - 1) * pageSize;

    const countResult = await queryFirst<{ c: number }>(
      "SELECT COUNT(*) as c FROM InventoryLedger WHERE productId = ?",
      [productId]
    );
    const total = countResult?.c ?? 0;

    const items = await query<InventoryLedgerEntryDTO>(
      `SELECT il.*, p.name as productName, p.sku as productSku
       FROM InventoryLedger il
       LEFT JOIN Product p ON il.productId = p.id
       WHERE il.productId = ?
       ORDER BY il.createdAt DESC
       LIMIT ? OFFSET ?`,
      [productId, pageSize, offset]
    );

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  },

  async findRecent(limit: number = 50): Promise<InventoryLedgerEntryDTO[]> {
    return query<InventoryLedgerEntryDTO>(
      `SELECT il.*, p.name as productName, p.sku as productSku
       FROM InventoryLedger il
       LEFT JOIN Product p ON il.productId = p.id
       ORDER BY il.createdAt DESC
       LIMIT ?`,
      [limit]
    );
  },
};

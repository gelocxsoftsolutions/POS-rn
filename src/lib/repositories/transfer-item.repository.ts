import { query, queryFirst, execute } from "@/lib/db/connection";
import type { InventoryTransferItemDTO } from "@/lib/types/inventory";

export const TransferItemRepository = {
  async findByTransfer(transferId: string): Promise<InventoryTransferItemDTO[]> {
    return query<InventoryTransferItemDTO>(
      `SELECT iti.*, p.name as productName, p.sku as productSku
       FROM InventoryTransferItem iti
       LEFT JOIN Product p ON iti.productId = p.id
       WHERE iti.transferId = ?
       ORDER BY iti.createdAt ASC`,
      [transferId]
    );
  },

  async updateReceivedQty(
    id: string,
    receivedQty: number
  ): Promise<InventoryTransferItemDTO | null> {
    const now = new Date().toISOString();
    await execute(
      "UPDATE InventoryTransferItem SET receivedQty = ?, updatedAt = ? WHERE id = ?",
      [receivedQty, now, id]
    );
    return queryFirst<InventoryTransferItemDTO>(
      `SELECT iti.*, p.name as productName, p.sku as productSku
       FROM InventoryTransferItem iti
       LEFT JOIN Product p ON iti.productId = p.id
       WHERE iti.id = ?`,
      [id]
    );
  },
};

import { TransferRepository } from "@/lib/repositories/transfer.repository";
import { TransferItemRepository } from "@/lib/repositories/transfer-item.repository";
import { InventoryRepository } from "@/lib/repositories/inventory.repository";
import { InventoryLedgerRepository } from "@/lib/repositories/inventory-ledger.repository";
import type { InventoryTransferDTO, PaginatedResult } from "@/lib/types/inventory";
import type { TransferFilter } from "@/lib/repositories/transfer.repository";

export const TransferService = {
  async list(filters: TransferFilter): Promise<PaginatedResult<InventoryTransferDTO>> {
    try {
      return await TransferRepository.findMany(filters);
    } catch {
      return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  },

  async getById(id: string): Promise<InventoryTransferDTO | null> {
    try {
      return await TransferRepository.findById(id);
    } catch {
      return null;
    }
  },

  async receive(id: string, receivedByName: string): Promise<InventoryTransferDTO | null> {
    try {
      const transfer = await TransferRepository.findById(id);
      if (!transfer) return null;

      for (const item of transfer.items) {
        const inv = await InventoryRepository.findByProduct(item.productId);
        const balanceBefore = inv?.availableQty ?? 0;

        await InventoryRepository.updateQuantities(item.productId, {
          availableQty: item.allocatedQty,
        });

        await InventoryLedgerRepository.create({
          movementType: "TRANSFER_IN",
          referenceNumber: id,
          productId: item.productId,
          quantity: item.allocatedQty,
          balanceBefore,
          balanceAfter: balanceBefore + item.allocatedQty,
          createdByName: receivedByName,
        });

        await TransferItemRepository.updateReceivedQty(item.id, item.allocatedQty);
      }

      return await TransferRepository.updateStatus(id, "RECEIVED", undefined, receivedByName);
    } catch {
      return null;
    }
  },

  async reject(id: string, rejectedByName: string): Promise<InventoryTransferDTO | null> {
    try {
      return await TransferRepository.updateStatus(id, "REJECTED", undefined, rejectedByName);
    } catch {
      return null;
    }
  },
};

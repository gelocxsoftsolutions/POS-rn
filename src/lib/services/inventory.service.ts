import { InventoryRepository } from "@/lib/repositories/inventory.repository";
import { InventoryLedgerRepository } from "@/lib/repositories/inventory-ledger.repository";
import type { InventoryDTO } from "@/lib/types/inventory";

export const InventoryService = {
  async get(productId: string): Promise<InventoryDTO | null> {
    try {
      return await InventoryRepository.findByProduct(productId);
    } catch {
      return null;
    }
  },

  async listAll(): Promise<InventoryDTO[]> {
    try {
      return await InventoryRepository.listAll();
    } catch {
      return [];
    }
  },

  async getLowStock(): Promise<InventoryDTO[]> {
    try {
      return await InventoryRepository.findLowStock();
    } catch {
      return [];
    }
  },

  async updateQuantity(
    productId: string,
    qty: number,
    movementType: string = "ADJUSTMENT",
    referenceNumber?: string,
    createdById?: string,
    createdByName?: string
  ): Promise<InventoryDTO | null> {
    try {
      const inv = await InventoryRepository.findByProduct(productId);
      const balanceBefore = inv?.availableQty ?? 0;

      const result = await InventoryRepository.updateQuantities(productId, {
        availableQty: qty,
      });

      if (result) {
        await InventoryLedgerRepository.create({
          movementType,
          referenceNumber,
          productId,
          quantity: qty,
          balanceBefore,
          balanceAfter: result.availableQty,
          createdById,
          createdByName,
        });
      }

      return result;
    } catch {
      return null;
    }
  },
};

import { InventoryLedgerRepository } from "@/lib/repositories/inventory-ledger.repository";
import { InventoryRepository } from "@/lib/repositories/inventory.repository";

export const LedgerService = {
  async create(
    movementType: string,
    productId: string,
    quantity: number,
    balanceBefore: number,
    notes: string | undefined,
    userId: string | undefined,
    userName: string | undefined
  ) {
    try {
      const balanceAfter = balanceBefore + quantity;

      const entry = await InventoryLedgerRepository.create({
        movementType,
        productId,
        quantity,
        balanceBefore,
        balanceAfter,
        notes,
        createdById: userId,
        createdByName: userName,
      });

      await InventoryRepository.updateQuantities(productId, {
        availableQty: quantity,
      });

      return entry;
    } catch (e: any) {
      throw new Error(e.message ?? "Failed to create ledger entry");
    }
  },

  async findByProduct(productId: string, limit: number = 50) {
    try {
      const result = await InventoryLedgerRepository.findByProduct(productId, 1, limit);
      return result.items;
    } catch {
      return [];
    }
  },

  async findRecent(limit: number = 50) {
    try {
      return await InventoryLedgerRepository.findRecent(limit);
    } catch {
      return [];
    }
  },
};

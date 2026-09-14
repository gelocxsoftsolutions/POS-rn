import { TransferRepository } from "@/lib/repositories/transfer.repository";
import { TransferItemRepository } from "@/lib/repositories/transfer-item.repository";
import { InventoryRepository } from "@/lib/repositories/inventory.repository";
import { InventoryLedgerRepository } from "@/lib/repositories/inventory-ledger.repository";
import { api } from "@/lib/api/http";
import { useDeviceStore } from "@/lib/stores/device-store";
import type { InventoryTransferDTO, PaginatedResult } from "@/lib/types/inventory";
import type { TransferFilter } from "@/lib/repositories/transfer.repository";

export interface TransferQrPayload {
  type: string;
  server: string;
  transferId: number;
  transferNumber: string;
}

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

  parseTransferQr(qrData: string): TransferQrPayload | null {
    try {
      const parsed = JSON.parse(qrData);
      if (parsed.type === "nct-transfer" && parsed.transferId && parsed.transferNumber) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  },

  async confirmReceipt(transferId: number): Promise<{ success: boolean; transferNumber: string } | null> {
    try {
      const device = useDeviceStore.getState().device;
      const deviceId = device.deviceId ?? "";
      const res = await api.post<{ success: boolean; transferNumber: string }>(
        "/api/pos/transfers/receive",
        { transferId, deviceId }
      );
      if (res.ok && res.data) {
        return res.data;
      }
      return null;
    } catch {
      return null;
    }
  },

  async fetchFromOms(): Promise<{ synced: number }> {
    try {
      const device = useDeviceStore.getState().device;
      const deviceId = device.deviceId ?? "";
      if (!deviceId) return { synced: 0 };

      const res = await api.get<Array<{
        id: number;
        transferNumber: string;
        status: string;
        direction: string;
        items: Array<{
          variationId: number;
          productName: string;
          allocatedQty: number;
          unit?: string;
        }>;
        createdAt: string;
      }>>(`/api/pos/transfers/pending?deviceId=${deviceId}`);

      if (!res.ok || !res.data) return { synced: 0 };

      let synced = 0;
      for (const t of res.data) {
        const existing = await TransferRepository.findByTransferNumber(t.transferNumber);
        if (!existing) {
          await TransferRepository.create({
            transferNumber: t.transferNumber,
            sourceWarehouse: "OMS Warehouse",
            destinationPos: device.deviceName ?? "POS Device",
            items: t.items.map((item) => ({
              productId: String(item.variationId),
              allocatedQty: item.allocatedQty,
              unit: item.unit,
            })),
          });
          synced++;
        }
      }

      return { synced };
    } catch {
      return { synced: 0 };
    }
  },
};

import { TransferRepository } from "@/lib/repositories/transfer.repository";
import { TransferItemRepository } from "@/lib/repositories/transfer-item.repository";
import { InventoryRepository } from "@/lib/repositories/inventory.repository";
import { InventoryLedgerRepository } from "@/lib/repositories/inventory-ledger.repository";
import { api } from "@/lib/api/http";
import { useDeviceStore } from "@/lib/stores/device-store";
import { execute } from "@/lib/db/connection";
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

  /**
   * Receive transfer with checklist support.
   * - items: if provided, uses per-item actualQty + notes (QR checklist flow)
   * - if items is a string, treats as legacy receivedByName (receive all allocated)
   */
  async receive(
    id: string,
    itemsOrName: string | Array<{ itemId: string; actualQty: number; notes?: string }>,
    maybeName?: string
  ): Promise<InventoryTransferDTO | null> {
    try {
      const transfer = await TransferRepository.findById(id);
      if (!transfer) return null;

      let checklist: Array<{ itemId: string; actualQty: number; notes?: string }> | undefined;
      let receivedByName: string;
      if (Array.isArray(itemsOrName)) {
        checklist = itemsOrName;
        receivedByName = maybeName ?? "Cashier";
      } else {
        receivedByName = itemsOrName;
      }

      const itemMap = new Map<string, { actualQty: number; notes?: string }>();
      if (checklist) {
        for (const c of checklist) itemMap.set(c.itemId, c);
      }

      for (const item of transfer.items) {
        const override = itemMap.get(item.id);
        const actualQty = override ? Math.max(0, Math.floor(Number(override.actualQty))) : item.allocatedQty;
        const notes = override?.notes?.trim() || undefined;
        const discrepancy = actualQty !== item.allocatedQty;

        const inv = await InventoryRepository.findByProduct(item.productId);
        const balanceBefore = inv?.availableQty ?? 0;

        // Additive — stock only added once here (sync no longer touches inventory)
        if (!inv) {
          await InventoryRepository.upsert(item.productId, { availableQty: actualQty });
        } else {
          await InventoryRepository.updateQuantities(item.productId, { availableQty: actualQty });
        }

        await InventoryLedgerRepository.create({
          movementType: "TRANSFER_IN",
          referenceNumber: id,
          productId: item.productId,
          quantity: actualQty,
          balanceBefore,
          balanceAfter: balanceBefore + actualQty,
          createdByName: receivedByName,
        });

        // Record received qty and discrepancy notes
        await TransferItemRepository.updateReceivedQty(item.id, actualQty);
        if (discrepancy && notes) {
          await execute(`UPDATE InventoryTransferItem SET remarks = ? WHERE id = ?`, [notes, item.id]);
        } else if (discrepancy && !notes) {
          // Caller should have validated; still store generic reason
          await execute(`UPDATE InventoryTransferItem SET remarks = ? WHERE id = ?`, ["Quantity discrepancy", item.id]);
        }
        // If no discrepancy, keep original remarks or clear
      }

      // If any discrepancy, append to transfer notes for audit trail
      if (checklist) {
        const discrepancies = checklist.filter((c) => {
          const orig = transfer.items.find((t) => t.id === c.itemId);
          return orig && c.actualQty !== orig.allocatedQty;
        });
        if (discrepancies.length > 0) {
          const now = new Date().toISOString();
          const summary = discrepancies
            .map((d) => {
              const orig = transfer.items.find((t) => t.id === d.itemId);
              return `${orig?.productName ?? d.itemId}: expected ${orig?.allocatedQty ?? "?"}, received ${d.actualQty}${d.notes ? ` (${d.notes})` : ""}`;
            })
            .join("; ");
          await execute(
            `UPDATE InventoryTransfer SET notes = CASE WHEN notes IS NULL OR notes = '' THEN ? ELSE notes || ' | ' || ? END, updatedAt = ? WHERE id = ?`,
            [`Discrepancies: ${summary}`, `Discrepancies: ${summary}`, now, id]
          );
        }
      }

      const result = await TransferRepository.updateStatus(id, "RECEIVED", undefined, receivedByName);

      // Notify OMS in background (best-effort) — extract numeric transferId from transferNumber if possible
      const transferNumber = transfer.transferNumber;
      if (transferNumber) {
        const raw = transferNumber.replace(/\D/g, "");
        const omsTransferId = raw.length >= 4 ? parseInt(raw.slice(-8), 10) : parseInt(raw, 10);
        if (!isNaN(omsTransferId) && omsTransferId > 0) {
          this.confirmReceipt(omsTransferId).catch(() => {});
        }
      }

      return result;
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

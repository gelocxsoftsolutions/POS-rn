import { TransferRepository } from "@/lib/repositories/transfer.repository";
import { TransferItemRepository } from "@/lib/repositories/transfer-item.repository";
import { InventoryRepository } from "@/lib/repositories/inventory.repository";
import { InventoryLedgerRepository } from "@/lib/repositories/inventory-ledger.repository";
import { api } from "@/lib/api/http";
import { useDeviceStore } from "@/lib/stores/device-store";
import { execute, queryFirst } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
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
    maybeName?: string,
    omsTransferId?: number
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

        // Resolve productId: item.productId may be a stale variationId string (e.g. "123") instead of Product.id uuid → resolve via sku, create placeholder if needed to avoid FK violation
        let resolvedProductId = item.productId;
        try {
          const direct = await queryFirst<{ id: string }>(`SELECT id FROM Product WHERE id = ?`, [item.productId]);
          if (direct?.id) {
            resolvedProductId = direct.id;
          } else {
            const bySku = await queryFirst<{ id: string }>(`SELECT id FROM Product WHERE sku = ?`, [String(item.productId)]);
            if (bySku?.id) {
              resolvedProductId = bySku.id;
              // Fix the transfer item to point to the real Product.id for future receives
              try { await execute(`UPDATE InventoryTransferItem SET productId = ? WHERE id = ?`, [resolvedProductId, item.id]); } catch {}
            } else {
              // Create placeholder product so FK constraints pass and inventory can be created
              const placeholderId = uuid();
              const placeholderSku = String(item.productId);
              const placeholderName = item.productName ?? `Product ${placeholderSku}`;
              try {
                await execute(`INSERT INTO Product (id, sku, productCode, name, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'ACTIVE', datetime('now'), datetime('now'))`, [placeholderId, placeholderSku, placeholderSku, placeholderName]);
                resolvedProductId = placeholderId;
                await execute(`UPDATE InventoryTransferItem SET productId = ? WHERE id = ?`, [resolvedProductId, item.id]);
              } catch (e) { console.warn("[Transfer] placeholder product create failed", e); }
            }
          }
        } catch (e) { console.warn("[Transfer] resolve product failed", e); }

        const inv = await InventoryRepository.findByProduct(resolvedProductId);
        const balanceBefore = inv?.availableQty ?? 0;

        const hadExistingStock = !!inv && (inv.availableQty > 0 || inv.allocatedQty > 0 || inv.soldQty > 0);
        try {
          // Additive — stock only added once here (sync no longer touches inventory)
          if (!inv) {
            await InventoryRepository.upsert(resolvedProductId, { availableQty: actualQty });
          } else {
            await InventoryRepository.updateQuantities(resolvedProductId, { availableQty: actualQty });
          }
        } catch (e) { console.warn("[Transfer] inventory update failed for", resolvedProductId, e); }

        // Update price for existing stock if same variation was transferred
        if (hadExistingStock) {
          try {
            const skuRow = await queryFirst<{ sku: string }>(`SELECT sku FROM Product WHERE id = ?`, [resolvedProductId]);
            const variationSku = skuRow?.sku;
            if (variationSku) {
              const deviceId = useDeviceStore.getState().device?.deviceId ?? "";
              if (deviceId) {
                const priceRes = await api.get<{ data: Array<{ variation: any }> }>(`/api/pos/inventory?deviceId=${deviceId}`);
                if (priceRes.ok && Array.isArray((priceRes.data as any)?.data)) {
                  const found = (priceRes.data as any).data.find((it: any) => String(it.variation?.id) === variationSku);
                  if (found?.variation) {
                    const v = found.variation as any;
                    const candidates = [
                      v.posPrice, v.price, v.retailPrice, v.sellingPrice, v.customerPrice, v.priceForCustomer,
                      v.pricing?.price, v.pricing?.amount, v.pricing?.priceForCustomer,
                      v.prices?.[0]?.price, v.prices?.[0]?.amount
                    ];
                    let newPrice: number | undefined;
                    for (const cand of candidates) {
                      if (cand == null) continue;
                      const p = Number(String(cand).replace(/[^0-9.-]/g, ""));
                      if (Number.isFinite(p) && p >= 0) { newPrice = p; break; }
                    }
                    if (newPrice !== undefined) {
                      const { ProductPriceRepository } = await import("@/lib/repositories/product-price.repository");
                      await ProductPriceRepository.upsert({ productId: resolvedProductId, priceList: "retail", price: newPrice, currency: "PHP" });
                      console.log("[Transfer] updated price for", variationSku, "to", newPrice);
                    }
                  }
                }
              }
            }
          } catch (e) { console.warn("[Transfer] price update failed", e); }
        }

        try {
          await InventoryLedgerRepository.create({
            movementType: "TRANSFER_IN",
            referenceNumber: id,
            productId: resolvedProductId,
            quantity: actualQty,
            balanceBefore,
            balanceAfter: balanceBefore + actualQty,
            createdByName: receivedByName,
          });
        } catch (e) { console.warn("[Transfer] ledger create failed", e); }

        // Record received qty and discrepancy notes
        try {
          await TransferItemRepository.updateReceivedQty(item.id, actualQty);
        } catch (e) { console.warn("[Transfer] updateReceivedQty failed", e); }
        try {
          if (discrepancy && notes) {
            await execute(`UPDATE InventoryTransferItem SET remarks = ? WHERE id = ?`, [notes, item.id]);
          } else if (discrepancy && !notes) {
            await execute(`UPDATE InventoryTransferItem SET remarks = ? WHERE id = ?`, ["Quantity discrepancy", item.id]);
          }
        } catch (e) { console.warn("[Transfer] remarks update failed", e); }
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

      // Notify OMS in background (best-effort) — prefer explicit omsTransferId from QR, fallback to transferNumber parsing
      const explicitId = omsTransferId && omsTransferId > 0 ? omsTransferId : undefined;
      let derivedOmsId: number | undefined;
      const transferNumber = transfer.transferNumber;
      if (transferNumber) {
        const raw = transferNumber.replace(/\D/g, "");
        const parsed = raw.length >= 4 ? parseInt(raw.slice(-8), 10) : parseInt(raw, 10);
        if (!isNaN(parsed) && parsed > 0) derivedOmsId = parsed;
      }
      const finalOmsId = explicitId ?? derivedOmsId;
      if (explicitId) {
        await TransferRepository.removeLegacyPendingByTransferNumber(String(explicitId));
      }
      if (finalOmsId) {
        this.confirmReceipt(finalOmsId).catch((e) => console.warn("[Transfer] confirmReceipt failed", e));
      }

      return result;
    } catch (e: any) {
      console.error("[Transfer] receive failed", e?.message ?? e, e);
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

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
import { BusinessConfigurationService } from "@/lib/business/configuration.service";
import { requirePermission } from "@/lib/services/authorization.service";
import { assertCapability } from "@/lib/business/capabilities";

function requireNctTransfers() {
  assertCapability(
    BusinessConfigurationService.current().operatingMode,
    "receiveNctTransfers"
  );
}

export interface TransferQrPayload {
  type: string;
  server: string;
  transferId: number;
  transferNumber: string;
}

// Transfers in a final state must never change stock again. Receiving an
// already-received transfer (double-tap, double QR scan) would otherwise add
// the quantities a second time and inflate inventory.
const RECEIVE_FINAL_STATUSES = ["RECEIVED", "REJECTED", "CANCELLED", "COMPLETED"];
// Guards against two receive() calls for the same transfer running at the
// same time (e.g. the QR scanner firing twice before state updates).
const receiveInFlight = new Set<string>();

export const TransferService = {
  async list(filters: TransferFilter): Promise<PaginatedResult<InventoryTransferDTO>> {
    requireNctTransfers();
    try {
      return await TransferRepository.findMany(filters);
    } catch {
      return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  },

  async getById(id: string): Promise<InventoryTransferDTO | null> {
    requireNctTransfers();
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
    requireNctTransfers();
    await requirePermission("POS_TRANSFERS", "receive product transfers");
    if (receiveInFlight.has(id)) {
      try {
        return await TransferRepository.findById(id);
      } catch {
        return null;
      }
    }
    receiveInFlight.add(id);
    try {
      const transfer = await TransferRepository.findById(id);
      if (!transfer) return null;
      if (RECEIVE_FINAL_STATUSES.includes(transfer.status)) return transfer;

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

      // Confirm the transfer with OMS before exposing the received quantity
      // locally. Otherwise checkout can see stock that OMS still considers 0.
      const explicitId = omsTransferId && omsTransferId > 0 ? omsTransferId : undefined;
      let derivedOmsId: number | undefined;
      if (!explicitId && transfer.transferNumber) {
        const raw = transfer.transferNumber.replace(/\D/g, "");
        const parsed = raw.length >= 4 ? parseInt(raw.slice(-8), 10) : parseInt(raw, 10);
        if (!isNaN(parsed) && parsed > 0) derivedOmsId = parsed;
      }
      const finalOmsId = explicitId ?? derivedOmsId;
      if (finalOmsId) {
        const confirmed = await this.confirmReceipt(finalOmsId, transfer.transferNumber);
        if (!confirmed?.success) {
          console.warn("[Transfer] OMS receipt confirmation failed", finalOmsId);
          return null;
        }
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
            const bySku = await queryFirst<{ id: string }>(`SELECT id FROM Product WHERE identitySource='NCT' AND businessId=? AND (omsVariationId=? OR sku=?)`, [BusinessConfigurationService.current().businessId, String(item.productId), String(item.productId)]);
            if (bySku?.id) {
              resolvedProductId = bySku.id;
              // Fix the transfer item to point to the real Product.id for future receives
              try { await execute(`UPDATE InventoryTransferItem SET productId = ? WHERE id = ?`, [resolvedProductId, item.id]); } catch {}
            } else {
              // Create placeholder product so FK constraints pass and inventory can be created
              const placeholderId = uuid();
              const placeholderSku = `NCT:${String(item.productId)}:${placeholderId}`;
              const placeholderName = item.productName ?? `Product ${placeholderSku}`;
              try {
                await execute(`INSERT INTO Product (id, sku, productCode, name, businessId, identitySource, omsVariationId, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 'NCT', ?, 'ACTIVE', datetime('now'), datetime('now'))`, [placeholderId, placeholderSku, String(item.productId), placeholderName, BusinessConfigurationService.current().businessId, String(item.productId)]);
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
                    let zeroFallback: number | undefined;
                    for (const cand of candidates) {
                      if (cand == null) continue;
                      const p = Number(String(cand).replace(/[^0-9.-]/g, ""));
                      if (!Number.isFinite(p) || p < 0) continue;
                      if (p > 0) { newPrice = p; break; }
                      if (zeroFallback === undefined) zeroFallback = p;
                    }
                    if (newPrice === undefined) newPrice = zeroFallback;
                    if (newPrice !== undefined) {
                      const { ProductPriceRepository } = await import("@/lib/repositories/product-price.repository");
                      await ProductPriceRepository.upsert({ productId: resolvedProductId, priceList: "retail", price: newPrice, currency: "PHP" });
                      console.log("[Transfer] updated price for", variationSku, "to", newPrice);
                    }
                    // Weight
                    const rawWeight = (v as any).weight ?? (v as any).netWeight ?? (v as any).grossWeight ?? (v as any).weightValue;
                    if (rawWeight != null && String(rawWeight).trim() !== "") {
                      const w = Number(String(rawWeight).replace(/[^0-9.-]/g, ""));
                      if (Number.isFinite(w) && w >= 0) {
                        await execute(`UPDATE Product SET weight = ? WHERE id = ?`, [w, resolvedProductId]);
                      }
                    }
                    // Unit
                    const rawUnit = (v as any).unit ?? (v as any).unitName ?? (v as any).uom;
                    if (rawUnit && String(rawUnit).trim() !== "") {
                      const unitName = String(rawUnit).trim();
                      const existingUnit = await queryFirst<{ id: string }>(`SELECT id FROM Unit WHERE name = ?`, [unitName]);
                      let unitId: string | undefined = existingUnit?.id;
                      if (!unitId) {
                        const newUnitId = uuid();
                        try {
                          await execute(`INSERT INTO Unit (id, name, active, createdAt, updatedAt) VALUES (?, ?, 1, datetime('now'), datetime('now'))`, [newUnitId, unitName]);
                          unitId = newUnitId;
                        } catch {}
                      }
                      if (unitId) {
                        await execute(`UPDATE Product SET unitId = ? WHERE id = ?`, [unitId, resolvedProductId]);
                      }
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

      if (explicitId) {
        await TransferRepository.removeLegacyPendingByTransferNumber(String(explicitId));
      }

      // Re-read the canonical OMS balance immediately. This also corrects
      // devices that still have a stale local quantity from an older build.
      try {
        const deviceId = useDeviceStore.getState().device?.deviceId;
        if (deviceId) {
          const { OmsSyncService } = await import("@/lib/services/oms-sync.service");
          await OmsSyncService.syncInventory(deviceId);
        }
      } catch (e) {
        console.warn("[Transfer] post-receive inventory refresh failed", e);
      }

      return result;
    } catch (e: any) {
      console.error("[Transfer] receive failed", e?.message ?? e, e);
      return null;
    } finally {
      receiveInFlight.delete(id);
    }
  },

  async reject(id: string, rejectedByName: string): Promise<InventoryTransferDTO | null> {
    requireNctTransfers();
    await requirePermission("POS_TRANSFERS", "reject product transfers");
    try {
      return await TransferRepository.updateStatus(id, "REJECTED", undefined, rejectedByName);
    } catch {
      return null;
    }
  },

  parseTransferQr(qrData: string): TransferQrPayload | null {
    if (!BusinessConfigurationService.capabilities().receiveNctTransfers) return null;
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

  async confirmReceipt(
    transferId: number | string,
    transferNumber?: string
  ): Promise<{ success: boolean; transferNumber: string } | null> {
    requireNctTransfers();
    await requirePermission("POS_TRANSFERS", "confirm product transfers");
    try {
      // The server validates this body with zod (non-strict: unknown keys are
      // stripped, so sending the transfer number as well is harmless and
      // covers server revisions that key off it). transferId must be a
      // number: QR payloads sometimes carry it as a string, which fails
      // numeric validation with 400 "Invalid body".
      const numericId =
        typeof transferId === "number" ? transferId : Number(String(transferId ?? "").trim());
      if (!Number.isInteger(numericId) || numericId <= 0) {
        console.warn("[Transfer] confirmReceipt skipped: invalid transfer id", transferId);
        return null;
      }
      const device = useDeviceStore.getState().device;
      const deviceId = device.deviceId ?? "";
      if (!deviceId) {
        console.warn("[Transfer] confirmReceipt skipped: no deviceId");
        return null;
      }
      const body: Record<string, unknown> = { transferId: numericId, deviceId };
      const cleanNumber = typeof transferNumber === "string" ? transferNumber.trim() : "";
      if (cleanNumber) body.transferNumber = cleanNumber;
      console.log("[Transfer] confirmReceipt sending", body);
      const res = await api.post<{ success: boolean; transferNumber: string }>(
        "/api/pos/transfers/receive",
        body
      );
      if (res.ok && res.data) {
        return res.data;
      }
      console.warn("[Transfer] confirmReceipt rejected", res.status, JSON.stringify(res.error)?.slice(0, 300));
      return null;
    } catch {
      return null;
    }
  },

  async fetchFromOms(): Promise<{ synced: number }> {
    requireNctTransfers();
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

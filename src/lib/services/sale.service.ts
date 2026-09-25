import { SaleRepository, CreateSaleInput } from "@/lib/repositories/sale.repository";
import { InventoryRepository } from "@/lib/repositories/inventory.repository";
import { InventoryLedgerRepository } from "@/lib/repositories/inventory-ledger.repository";
import { SyncQueueService } from "@/lib/services/sync-queue.service";
import { OmsSyncService } from "@/lib/services/oms-sync.service";
import { execute, queryFirst } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import { api } from "@/lib/api/http";
import type { CreateSaleInput as SaleInput, SaleFilter, PaginatedResult } from "@/lib/types/sales";
import type { SaleDTO } from "@/lib/types/sales";

async function resolveSalePayload(
  input: SaleInput,
  saleItems: Array<{ productId?: string; quantity: number; unitPrice: number; lineTotal: number }>,
  total: number,
  saleId: string
) {
  const mappedItems: Array<{ variationId: number; qty: number }> = [];
  for (const item of saleItems) {
    if (!item.productId) continue;
    // Product.sku holds OMS variation.id as string (set in upsertProductFromVariation)
    const row = await queryFirst<{ sku: string | null }>("SELECT sku FROM Product WHERE id = ?", [item.productId]);
    const sku = row?.sku?.trim();
    const vid = sku ? Number(sku) : NaN;
    if (!Number.isFinite(vid) || vid <= 0) continue;
    mappedItems.push({ variationId: Math.trunc(vid), qty: item.quantity });
  }
  return {
    // Keep legacy fields for OMS compat, but canonical is variationId/qty
    receiptNumber: `RCP-${saleId.substring(0, 8)}`,
    cashierId: input.cashierId,
    cashierName: input.cashierName,
    cashierUserId: input.cashierId,
    paymentMethod: input.paymentMethod,
    total,
    items: mappedItems,
    payments: [{ method: input.paymentMethod, amount: total }],
  };
}

export const SaleService = {
  async create(input: SaleInput) {
    try {
      const saleId = uuid();
      const now = new Date().toISOString();
      const businessDate = now.split("T")[0];

      let subtotal = 0;
      let totalTax = 0;
      const itemCount = input.items.reduce((sum, i) => sum + i.quantity, 0);

      const saleItems = input.items.map((item) => {
        const lineTotal = item.quantity * item.unitPrice;
        subtotal += lineTotal;
        return {
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          barcode: item.barcode,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: 0,
          tax: 0,
          lineTotal,
          unit: item.unit,
          weight: item.weight ?? null,
        };
      });

      // Per-variation stock check (e.g., var:757 Available 13 Requested 29)
      for (const it of saleItems) {
        if (!it.productId) continue;
        const inv = await InventoryRepository.findByProduct(it.productId);
        if (inv && inv.availableQty < it.quantity) {
          try {
            const deviceId = input.deviceId;
            if (deviceId) {
              const { OmsSyncService } = await import("@/lib/services/oms-sync.service");
              OmsSyncService.syncInventory(deviceId).catch(() => {});
            }
          } catch {}
          return {
            success: false as const,
            error: `Not enough stock for ${it.productName}. Available: ${inv.availableQty}, requested: ${it.quantity}. Please reduce quantity.`,
          };
        }
      }

      // Pre-check group stock to avoid OMS 400 spam (group: productCode)
      const groupRequested = new Map<string, number>();
      const productCodeCache = new Map<string, string | null>();
      for (const it of saleItems) {
        if (!it.productId) continue;
        let code = productCodeCache.get(it.productId);
        if (code === undefined) {
          const prow = await queryFirst<{ productCode: string | null }>(`SELECT productCode FROM Product WHERE id = ?`, [it.productId]);
          code = prow?.productCode ?? null;
          productCodeCache.set(it.productId, code);
        }
        const groupKey = code ?? it.productId;
        groupRequested.set(groupKey, (groupRequested.get(groupKey) ?? 0) + it.quantity);
      }
      for (const [groupKey, requested] of groupRequested) {
        // Group stock is per-group, not sum of variations (each variation in same productCode shares same qty)
        const groupStock = await queryFirst<{ totalAvail: number }>(
          `SELECT COALESCE(MAX(pi.availableQty),0) as totalAvail FROM PosInventory pi JOIN Product p ON pi.productId = p.id WHERE (p.productCode = ? OR p.id = ?)`,
          [groupKey, groupKey]
        );
        const available = groupStock?.totalAvail ?? 0;
        const hasInv = await queryFirst<{ cnt: number }>(
          `SELECT COUNT(*) as cnt FROM PosInventory pi JOIN Product p ON pi.productId = p.id WHERE (p.productCode = ? OR p.id = ?)`,
          [groupKey, groupKey]
        );
        if (hasInv && hasInv.cnt > 0 && available < requested) {
          // Refresh from OMS in background
          try {
            const deviceId = input.deviceId;
            if (deviceId) {
              const { OmsSyncService } = await import("@/lib/services/oms-sync.service");
              OmsSyncService.syncInventory(deviceId).catch(() => {});
            }
          } catch {}
          return {
            success: false as const,
            error: `Not enough stock for this product group. Available: ${available}, requested: ${requested}. Please reduce quantity or sync inventory.`,
          };
        }
      }

      // Fresh OMS check to catch stale local stock (e.g., POS shows 15 but OMS group has 9, or var 13 vs 29)
      try {
        const deviceId = input.deviceId;
        if (deviceId) {
          const res = await api.get<{ data: Array<{ groupKey: string; qty: number; variation: { id: string } }> }>(`/api/pos/inventory?deviceId=${deviceId}`);
          if (res.ok && Array.isArray((res.data as any)?.data)) {
            const omsGroupMap = new Map<string, number>();
            const omsVarMap = new Map<string, number>();
            for (const it of (res.data as any).data as Array<{ groupKey: string; qty: number; variation: { id: string } }>) {
              if (it.groupKey) omsGroupMap.set(it.groupKey, Number(it.qty ?? 0));
              if (it.variation?.id) omsVarMap.set(String(it.variation.id), Number(it.qty ?? 0));
            }
            // Group check
            for (const [groupKey, requested] of groupRequested) {
              const omsAvail = omsGroupMap.get(groupKey);
              if (omsAvail !== undefined && omsAvail < requested) {
                return {
                  success: false as const,
                  error: `Not enough stock for this product group (OMS). Available: ${omsAvail}, requested: ${requested}. Please sync inventory and reduce quantity.`,
                };
              }
            }
            // Per-variation OMS check
            for (const it of saleItems) {
              if (!it.productId) continue;
              const prow = await queryFirst<{ sku: string | null }>(`SELECT sku FROM Product WHERE id = ?`, [it.productId]);
              const sku = prow?.sku ? String(prow.sku) : null;
              if (!sku) continue;
              const omsVarAvail = omsVarMap.get(sku);
              if (omsVarAvail !== undefined && omsVarAvail < it.quantity) {
                return {
                  success: false as const,
                  error: `Not enough stock for ${it.productName} (var:${sku}). Available: ${omsVarAvail}, requested: ${it.quantity}. Please sync inventory and reduce quantity.`,
                };
              }
            }
          }
        }
      } catch {}

      const total = subtotal + totalTax;
      const paidAmount = input.paidAmount ?? total;
      const changeAmount = Math.max(0, paidAmount - total);

      await execute(
        `INSERT INTO Sale (id, receiptNumber, cashierId, cashierName, customerName, itemCount, subtotal, discount, tax, total, paidAmount, changeAmount, paymentMethod, status, businessDate, shiftId, deviceId, branchId, synced, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?, 0, ?)`,
        [
          saleId,
          `RCP-${now.replace(/[-:T]/g, "").substring(0, 14)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
          input.cashierId,
          input.cashierName,
          input.customerName ?? null,
          itemCount,
          subtotal,
          totalTax,
          total,
          paidAmount,
          changeAmount,
          input.paymentMethod,
          businessDate,
          input.shiftId ?? null,
          input.deviceId ?? null,
          input.branchId ?? null,
          now,
        ]
      );

      for (const item of saleItems) {
        const itemId = uuid();
        await execute(
          `INSERT INTO SaleItem (id, saleId, productId, productName, sku, barcode, quantity, unitPrice, discount, tax, lineTotal, unit, weight)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            itemId,
            saleId,
            item.productId ?? null,
            item.productName,
            item.sku ?? null,
            item.barcode ?? null,
            item.quantity,
            item.unitPrice,
            item.discount,
            item.tax,
            item.lineTotal,
            item.unit ?? null,
            (item as any).weight ?? null,
          ]
        );

        if (item.productId) {
          const inv = await InventoryRepository.findByProduct(item.productId);
          const balanceBefore = inv?.availableQty ?? 0;

          const updatedInventory = await InventoryRepository.updateQuantities(item.productId, {
            availableQty: -item.quantity,
            soldQty: item.quantity,
          });
          if (!updatedInventory) {
            throw new Error(`Inventory record not found for ${item.productName}`);
          }

          await InventoryLedgerRepository.create({
            movementType: "SALE",
            referenceNumber: saleId,
            productId: item.productId,
            quantity: -item.quantity,
            balanceBefore,
            balanceAfter: updatedInventory.availableQty,
            createdById: input.cashierId,
            createdByName: input.cashierName,
          });
        }
      }

      const paymentId = uuid();
      await execute(
        `INSERT INTO Payment (id, saleId, method, amount, reference, status, createdAt)
         VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?)`,
        [paymentId, saleId, input.paymentMethod, paidAmount, null, now]
      );

      const sale = await SaleRepository.findById(saleId);

      // Push to OMS synchronously to catch insufficient stock immediately
      const pushResult = await this._pushToOms(saleId, input, saleItems, total);

      if (!pushResult.success) {
        const errMsg = String((pushResult as any).error ?? "");
        const isInsufficient = /insufficient pos stock/i.test(errMsg) || pushResult.status === 400;
        if (isInsufficient) {
          const availMatch = errMsg.match(/Available:\s*(\d+)/i);
          const reqMatch = errMsg.match(/Requested:\s*(\d+)/i);
          const groupMatch = errMsg.match(/(?:group|var):([^\s,\]]+)/i);
          const available = availMatch ? availMatch[1] : "?";
          const requested = reqMatch ? reqMatch[1] : String(itemCount);
          const isVar = /for var:/i.test(errMsg);
          const group = groupMatch ? (isVar ? `var:${groupMatch[1]}` : `group:${groupMatch[1].substring(0, 8)}…`) : isVar ? "this variation" : "this product group";

          // Rollback local sale and inventory to keep POS consistent with OMS
          await this._rollbackSale(saleId, saleItems);

          // Trigger inventory sync to refresh stock
          try {
            const deviceId = input.deviceId;
            if (deviceId) {
              // Don't await, fire-and-forget sync refresh
              const { OmsSyncService } = await import("@/lib/services/oms-sync.service");
              OmsSyncService.syncInventory(deviceId).catch(() => {});
            }
          } catch {}

          return {
            success: false as const,
            error: `Not enough stock for this product group. Available: ${available}, requested: ${requested}. Please adjust quantity and try again. (Group: ${group})`,
          };
        }
      }

      return { success: true, sale };
    } catch (e: any) {
      return { success: false, error: e.message ?? "Sale creation failed" };
    }
  },

  async _pushToOms(
    saleId: string,
    input: SaleInput,
    saleItems: Array<{ productId?: string; quantity: number; unitPrice: number; lineTotal: number }>,
    total: number
  ): Promise<import("@/lib/services/oms-sync.service").SalePushResult> {
    const payload = await resolveSalePayload(input, saleItems, total, saleId);
    if (payload.items.length === 0) {
      // Nothing mappable to OMS (e.g. legacy mock SKUs like SHR-001) -> keep locally, mark synced to stop 400 loop
      console.warn("[Sale] No mappable OMS variations for sale", saleId, "- skipping OMS push (mock/unknown SKUs)");
      await SaleRepository.markSynced(saleId);
      return { success: true, status: 200, retryable: false };
    }
    try {
      const pushResult = await OmsSyncService.pushSale(payload as any);
      if (pushResult.success) {
        await SaleRepository.markSynced(saleId);
      } else {
        const queued = await SyncQueueService.enqueue("Sale", saleId, "CREATE", payload as any);
        if (queued && !pushResult.retryable) {
          const { SyncQueueRepository } = await import("@/lib/repositories/sync-queue.repository");
          await SyncQueueRepository.markEntityFailed(
            "Sale",
            saleId,
            pushResult.error ?? `HTTP ${pushResult.status}`
          );
        }
      }
      return pushResult;
    } catch (e: any) {
      await SyncQueueService.enqueue("Sale", saleId, "CREATE", payload as any);
      return { success: false, status: 0, error: e?.message ?? "Network error", retryable: true };
    }
  },

  async _rollbackSale(
    saleId: string,
    saleItems: Array<{ productId?: string; quantity: number }>
  ): Promise<void> {
    try {
      // Revert inventory for each item
      for (const item of saleItems) {
        if (!item.productId) continue;
        try {
          await InventoryRepository.updateQuantities(item.productId, {
            availableQty: item.quantity,
            soldQty: -item.quantity,
          });
        } catch {}
        try {
          await execute(`DELETE FROM InventoryLedger WHERE referenceNumber = ? AND productId = ? AND movementType = 'SALE'`, [saleId, item.productId]);
        } catch {}
      }
      // Remove sale related rows
      try {
        await execute(`DELETE FROM Payment WHERE saleId = ?`, [saleId]);
      } catch {}
      try {
        await execute(`DELETE FROM SaleItem WHERE saleId = ?`, [saleId]);
      } catch {}
      try {
        await execute(`DELETE FROM Sale WHERE id = ?`, [saleId]);
      } catch {}
      // Clean sync queue entry if any
      try {
        await execute(`DELETE FROM SyncQueue WHERE entityType = 'Sale' AND entityId = ?`, [saleId]);
      } catch {}
      // Also mark any remaining queue as failed to prevent retry
      try {
        const { SyncQueueRepository } = await import("@/lib/repositories/sync-queue.repository");
        await SyncQueueRepository.markEntityFailed("Sale", saleId, "Insufficient POS stock - rolled back");
      } catch {}
      console.log("[Sale] Rolled back sale", saleId, "due to insufficient stock");
    } catch (e) {
      console.warn("[Sale] Rollback failed for", saleId, e);
    }
  },

  async list(filters: SaleFilter): Promise<PaginatedResult<SaleDTO>> {
    try {
      return await SaleRepository.findMany(filters);
    } catch {
      return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  },

  async getById(id: string): Promise<SaleDTO | null> {
    try {
      return await SaleRepository.findById(id);
    } catch {
      return null;
    }
  },

  async getByReceiptNumber(receiptNumber: string): Promise<SaleDTO | null> {
    try {
      return await SaleRepository.findByReceiptNumber(receiptNumber);
    } catch {
      return null;
    }
  },

  async summary() {
    try {
      const today = new Date().toISOString().split("T")[0];
      const totalSales = await SaleRepository.sumTotalToday();
      const transactionCount = await SaleRepository.countToday();
      return {
        date: today,
        totalSales,
        transactionCount,
        averageBasket: transactionCount > 0 ? totalSales / transactionCount : 0,
      };
    } catch {
      return { date: new Date().toISOString().split("T")[0], totalSales: 0, transactionCount: 0, averageBasket: 0 };
    }
  },
};

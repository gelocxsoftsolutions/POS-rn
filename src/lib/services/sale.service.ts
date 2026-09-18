import { SaleRepository, CreateSaleInput } from "@/lib/repositories/sale.repository";
import { InventoryRepository } from "@/lib/repositories/inventory.repository";
import { InventoryLedgerRepository } from "@/lib/repositories/inventory-ledger.repository";
import { SyncQueueService } from "@/lib/services/sync-queue.service";
import { OmsSyncService } from "@/lib/services/oms-sync.service";
import { execute, queryFirst } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
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
        };
      });

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
          `INSERT INTO SaleItem (id, saleId, productId, productName, sku, barcode, quantity, unitPrice, discount, tax, lineTotal, unit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          ]
        );

        if (item.productId) {
          const inv = await InventoryRepository.findByProduct(item.productId);
          const balanceBefore = inv?.availableQty ?? 0;
          const balanceAfter = balanceBefore - item.quantity;

          await InventoryRepository.updateQuantities(item.productId, {
            availableQty: -item.quantity,
            soldQty: item.quantity,
          });

          await InventoryLedgerRepository.create({
            movementType: "SALE",
            referenceNumber: saleId,
            productId: item.productId,
            quantity: -item.quantity,
            balanceBefore,
            balanceAfter,
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

      // Push to OMS asynchronously (fire-and-forget with SyncQueue fallback)
      this._pushToOms(saleId, input, saleItems, total).catch(() => {});

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
  ): Promise<void> {
    const payload = await resolveSalePayload(input, saleItems, total, saleId);
    if (payload.items.length === 0) {
      // Nothing mappable to OMS (e.g. legacy mock SKUs like SHR-001) -> keep locally, mark synced to stop 400 loop
      console.warn("[Sale] No mappable OMS variations for sale", saleId, "- skipping OMS push (mock/unknown SKUs)");
      await SaleRepository.markSynced(saleId);
      return;
    }
    try {
      const pushed = await OmsSyncService.pushSale(payload as any);
      if (pushed) {
        await SaleRepository.markSynced(saleId);
      } else {
        await SyncQueueService.enqueue("Sale", saleId, "CREATE", payload as any);
      }
    } catch {
      await SyncQueueService.enqueue("Sale", saleId, "CREATE", payload as any);
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

import { withNctActionAudit } from "./action-audit";
import { SaleRepository, CreateSaleInput } from "@/lib/repositories/sale.repository";
import { InventoryRepository } from "@/lib/repositories/inventory.repository";
import { InventoryLedgerRepository } from "@/lib/repositories/inventory-ledger.repository";
import { execute, queryFirst } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import type { CreateSaleInput as SaleInput, SaleFilter, CreateSaleResult } from "@/lib/types/sales";
import type { PaginatedResult } from "@/lib/types/inventory";
import type { SaleDTO } from "@/lib/types/sales";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { getVisibleCashierIds } from "@/lib/stores/access-settings-store";
import { BusinessConfigurationService } from "@/lib/business/configuration.service";
import { requirePermission } from "@/lib/services/authorization.service";
import { isNctPos } from "./nct-scope";
import { createNctSale } from "./nct-checkout.service";
import { philippineDate } from "@/lib/backup/nct-schedule";

function createReceiptNumber(prefix: string = "R") {
  const time = Date.now().toString(36).toUpperCase().slice(-7);
  const random = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "0");
  return `${prefix}${time}${random}`;
}

export const SaleService = withNctActionAudit("Sale", {
  async create(input: SaleInput): Promise<CreateSaleResult> {
    if (isNctPos()) return createNctSale(input);
    try {
      await requirePermission("POS_SALES", "complete sales");
      const business = BusinessConfigurationService.current();
      const saleId = uuid();
      const now = new Date().toISOString();
      const receiptNumber = input.receiptNumber ?? createReceiptNumber();
      const businessDate = now.split("T")[0];

      let subtotal = 0;
      let totalTax = 0;
      const discount = Math.max(0, input.discount ?? 0);
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
        // Group stock is the total across member rows: each variation keeps
        // its own PosInventory row (transfer receive and OMS sync both stock
        // per variation), and the sales UI displays the summed group stock.
        // Comparing the summed request against a single row (MAX) falsely
        // rejects valid sales, e.g. two variations with 1 unit each.
        const groupStock = await queryFirst<{ totalAvail: number }>(
          `SELECT COALESCE(SUM(pi.availableQty),0) as totalAvail FROM PosInventory pi JOIN Product p ON pi.productId = p.id WHERE (p.productCode = ? OR p.id = ?)`,
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

      const total = Math.max(0, subtotal - discount + totalTax);
      const paidAmount = input.paidAmount ?? total;
      const changeAmount = Math.max(0, paidAmount - total);

      await execute(
        `INSERT INTO Sale (id, receiptNumber, cashierId, cashierName, customerName, itemCount, subtotal, discount, tax, total, paidAmount, changeAmount, paymentMethod, status, businessDate, shiftId, deviceId, branchId, businessId, originMode, synced, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          saleId,
          receiptNumber,
          input.cashierId,
          input.cashierName,
          input.customerName ?? null,
          itemCount,
          subtotal,
          discount,
          totalTax,
          total,
          paidAmount,
          changeAmount,
          input.paymentMethod,
          businessDate,
          input.shiftId ?? null,
          input.deviceId ?? null,
          input.branchId ?? null,
          business.businessId,
          business.operatingMode,
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

      await execute(
        `INSERT INTO Receipt
         (id, saleId, storeName, storeCode, address, phone, footer, templateVersion, templateSnapshot, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuid(), saleId, business.businessName, business.businessId,
          business.address, business.supportPhone,
          business.receiptTemplate.footerMessage,
          business.receiptTemplateVersion,
          JSON.stringify({
            businessId: business.businessId,
            businessName: business.businessName,
            posSystemName: business.posSystemName,
            headerName: business.headerName,
            businessLogoUri: business.businessLogoUri,
            receiptLogoUri: business.receiptLogoUri,
            address: business.address,
            supportPhone: business.supportPhone,
            contactEmail: business.contactEmail,
            template: business.receiptTemplate,
          }), now]
      );

      // The local transaction is complete at this point for both operating
      // modes. Background sync owns all OMS delivery and retry behavior so a
      // slow or unavailable network never delays checkout completion.
      return { success: true as const, sale: sale ?? undefined };

    } catch (e: any) {
      return { success: false, error: e.message ?? "Sale creation failed" };
    }
  },

  async list(filters: SaleFilter): Promise<PaginatedResult<SaleDTO>> {
    try {
      const currentCashierId = useCashierStore.getState().session?.cashierId;
      const cashierIds = filters.cashierId || filters.cashierIds
        ? filters.cashierIds
        : getVisibleCashierIds(currentCashierId);
      return await SaleRepository.findMany({ ...filters, cashierIds });
    } catch {
      return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  },

  async getById(id: string): Promise<SaleDTO | null> {
    try {
      const sale = await SaleRepository.findById(id);
      const visibleCashiers = getVisibleCashierIds(useCashierStore.getState().session?.cashierId);
      return sale && visibleCashiers.includes(sale.cashierId) ? sale : null;
    } catch {
      return null;
    }
  },

  async getByReceiptNumber(receiptNumber: string): Promise<SaleDTO | null> {
    try {
      const sale = await SaleRepository.findByReceiptNumber(receiptNumber);
      const visibleCashiers = getVisibleCashierIds(useCashierStore.getState().session?.cashierId);
      return sale && visibleCashiers.includes(sale.cashierId) ? sale : null;
    } catch {
      return null;
    }
  },

  async summary() {
    try {
      const today = isNctPos() ? philippineDate() : new Date().toISOString().split("T")[0];
      const cashierIds = getVisibleCashierIds(useCashierStore.getState().session?.cashierId);
      const totalSales = await SaleRepository.sumTotalToday(cashierIds);
      const transactionCount = await SaleRepository.countToday(cashierIds);
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
});

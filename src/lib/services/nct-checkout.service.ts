import { v4 as uuid } from "uuid";
import { localTransaction } from "@/lib/db/local-operation";
import { SaleRepository } from "@/lib/repositories/sale.repository";
import { requirePermission } from "./authorization.service";
import { BusinessConfigurationService } from "@/lib/business/configuration.service";
import type { CreateSaleInput, CreateSaleResult } from "@/lib/types/sales";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useDeviceStore } from "@/lib/stores/device-store";

export async function createNctSale(input: CreateSaleInput): Promise<CreateSaleResult> {
  try {
    await requirePermission("POS_SALES", "complete sales");
    const session = useCashierStore.getState().session;
    const device = useDeviceStore.getState().device;
    if (
      !session ||
      session.cashierId !== input.cashierId ||
      device.deviceId !== input.deviceId ||
      device.branchId !== input.branchId
    )
      throw new Error("Checkout identity changed. Sign in on the intended branch device.");
    input = { ...input, cashierName: session.cashierName };
    if (!input.deviceId || !input.branchId)
      throw new Error("Register this NCT device before checkout.");
    if (
      !input.items.length ||
      input.items.some(
        (i) =>
          !i.productId ||
          !Number.isInteger(Number(i.sku)) ||
          Number(i.sku) <= 0 ||
          !Number.isInteger(i.quantity) ||
          i.quantity <= 0 ||
          !Number.isFinite(i.unitPrice) ||
          i.unitPrice < 0,
      )
    )
      throw new Error(
        "Every sale item must have an OMS variation, a positive whole quantity and a valid price.",
      );
    const business = BusinessConfigurationService.current();
    const id = uuid(),
      now = new Date().toISOString();
    const receiptNumber = input.receiptNumber ?? `NCT-${id.replace(/-/g, "").toUpperCase()}`;
    const businessDate = new Date(Date.parse(now) + 8 * 3600000).toISOString().slice(0, 10);
    const lines = input.items.map((item) => ({
      ...item,
      unitPrice: Math.round(item.unitPrice * 100) / 100,
    }));
    const subtotalCents = lines.reduce(
      (sum, i) => sum + Math.round(i.unitPrice * 100) * i.quantity,
      0,
    );
    const discountCents = Math.round(Math.max(0, input.discount ?? 0) * 100);
    const total = Math.max(0, subtotalCents - discountCents) / 100;
    const paid = input.paidAmount ?? total;
    if (!Number.isFinite(paid) || paid < total || !Number.isFinite(discountCents))
      throw new Error("Payment does not cover the sale total.");
    await localTransaction(async (tx) => {
      if (useCashierStore.getState().session?.sessionId !== session.sessionId)
        throw new Error("Sign in again before completing checkout.");
      await tx.runAsync(
        `INSERT INTO Sale (id,receiptNumber,cashierId,cashierName,customerName,itemCount,subtotal,discount,tax,total,paidAmount,changeAmount,paymentMethod,status,businessDate,shiftId,deviceId,branchId,businessId,originMode,synced,createdAt)
        VALUES (?,?,?,?,?,?,?,?,0,?,?,?,?, 'COMPLETED',?,?,?,?,?,'NCT_DEPENDENT',0,?)`,
        [
          id,
          receiptNumber,
          input.cashierId,
          input.cashierName,
          input.customerName ?? null,
          lines.reduce((sum, i) => sum + i.quantity, 0),
          subtotalCents / 100,
          discountCents / 100,
          total,
          paid,
          Math.max(0, paid - total),
          input.paymentMethod,
          businessDate,
          input.shiftId ?? null,
          input.deviceId!,
          input.branchId!,
          business.businessId,
          now,
        ],
      );
      for (const line of lines) {
        const inventory = await tx.getFirstAsync<{ availableQty: number }>(
          "SELECT availableQty FROM PosInventory WHERE productId = ?",
          [line.productId],
        );
        const updated = await tx.runAsync(
          "UPDATE PosInventory SET availableQty=availableQty-?,soldQty=soldQty+?,updatedAt=? WHERE productId=? AND availableQty>=?",
          [line.quantity, line.quantity, now, line.productId, line.quantity],
        );
        if (updated.changes !== 1) throw new Error(`Not enough stock for ${line.productName}.`);
        await tx.runAsync(
          `INSERT INTO SaleItem (id,saleId,productId,productName,sku,barcode,quantity,unitPrice,discount,tax,lineTotal,unit,weight) VALUES (?,?,?,?,?,?,?,?,0,0,?,?,?)`,
          [
            uuid(),
            id,
            line.productId,
            line.productName,
            line.sku!,
            line.barcode ?? null,
            line.quantity,
            line.unitPrice,
            (Math.round(line.unitPrice * 100) * line.quantity) / 100,
            line.unit ?? null,
            line.weight ?? null,
          ],
        );
        await tx.runAsync(
          `INSERT INTO InventoryLedger (id,movementType,referenceNumber,productId,quantity,balanceBefore,balanceAfter,createdById,createdByName,createdAt) VALUES (?,'SALE',?,?,?,?,?,?,?,?)`,
          [
            uuid(),
            id,
            line.productId,
            -line.quantity,
            inventory?.availableQty ?? 0,
            (inventory?.availableQty ?? 0) - line.quantity,
            input.cashierId,
            input.cashierName,
            now,
          ],
        );
      }
      await tx.runAsync(
        "INSERT INTO Payment (id,saleId,method,amount,status,createdAt) VALUES (?,?,?,?,'COMPLETED',?)",
        [uuid(), id, input.paymentMethod, total, now],
      );
      await tx.runAsync(
        `INSERT INTO Receipt (id,saleId,storeName,storeCode,address,phone,footer,templateVersion,templateSnapshot,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          uuid(),
          id,
          business.businessName,
          business.businessId,
          business.address,
          business.supportPhone,
          business.receiptTemplate.footerMessage,
          business.receiptTemplateVersion,
          JSON.stringify({ ...business, template: business.receiptTemplate }),
          now,
        ],
      );
      await tx.runAsync(
        "INSERT INTO AuditLog (id,eventType,description,cashierId,cashierName,metadata,createdAt) VALUES (?,'SALE_CREATED',?,?,?,?,?)",
        [
          uuid(),
          `Completed receipt ${receiptNumber}`,
          input.cashierId,
          input.cashierName,
          JSON.stringify({
            source: "NCT_POS",
            deviceId: input.deviceId,
            branchId: input.branchId,
            entityType: "Sale",
            entityId: id,
          }),
          now,
        ],
      );
    });
    return { success: true as const, sale: (await SaleRepository.findById(id)) ?? undefined };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Checkout failed",
    };
  }
}

import { ReturnRepository } from "@/lib/repositories/return.repository";
import { SaleRepository } from "@/lib/repositories/sale.repository";
import { InventoryRepository } from "@/lib/repositories/inventory.repository";
import { InventoryLedgerRepository } from "@/lib/repositories/inventory-ledger.repository";
import { queryFirst } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import { sha256 as secureSha256 } from "@noble/hashes/sha2.js";
import { requirePermission } from "@/lib/services/authorization.service";
import { AuditService } from "@/lib/services/audit.service";
import { SyncQueueService } from "@/lib/services/sync-queue.service";
import { SaleService } from "@/lib/services/sale.service";
import { BusinessConfigurationService } from "@/lib/business/configuration.service";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useDeviceStore } from "@/lib/stores/device-store";
import type { CreateReturnRequestInput, ReturnRequestDTO, ReturnRequestFilter } from "@/lib/types/returns";
import type { PaginatedResult } from "@/lib/types/inventory";
import type { PaymentMethodType } from "@/lib/types/pos";

const APPROVAL_CODE_TTL_MS = 10 * 60 * 1000;
// No 0/O/1/I to avoid transcription mistakes when the manager relays the code.
const APPROVAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const APPROVAL_CODE_LENGTH = 6;

function createReturnNumber() {
  const time = Date.now().toString(36).toUpperCase().slice(-7);
  const random = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "0");
  return `RT${time}${random}`;
}

function createExchangeReceiptNumber() {
  const time = Date.now().toString(36).toUpperCase().slice(-7);
  const random = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "0");
  return `X${time}${random}`;
}

function sha256Hex(value: string): string {
  return Array.from(secureSha256(new TextEncoder().encode(value)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateApprovalCode(): string {
  let code = "";
  for (let i = 0; i < APPROVAL_CODE_LENGTH; i++) {
    code += APPROVAL_CODE_ALPHABET[Math.floor(Math.random() * APPROVAL_CODE_ALPHABET.length)];
  }
  return code;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface ResolvedExchangeProduct {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string | null;
  weight: number | null;
  retailPrice: number;
}

async function resolveExchangeProduct(productId: string): Promise<ResolvedExchangeProduct | null> {
  return queryFirst<ResolvedExchangeProduct>(
    `SELECT p.id,
            p.name,
            p.sku,
            p.weight,
            (SELECT b.barcode FROM Barcode b WHERE b.productId = p.id LIMIT 1) as barcode,
            (SELECT u.name FROM Unit u WHERE u.id = p.unitId) as unit,
            COALESCE((
              SELECT pp.price FROM ProductPrice pp
              WHERE pp.productId = p.id AND pp.priceList = 'retail' AND pp.active = 1
              ORDER BY pp.updatedAt DESC LIMIT 1
            ), 0) as retailPrice
     FROM Product p
     WHERE p.id = ?`,
    [productId]
  );
}

function currentSession() {
  const session = useCashierStore.getState().session;
  if (!session) throw new Error("Sign in before trying to process returns.");
  return session;
}

export const ReturnService = {
  async list(filter: ReturnRequestFilter): Promise<PaginatedResult<ReturnRequestDTO>> {
    try {
      await requirePermission("POS_RETURNS", "process returns");
      return await ReturnRepository.findMany(filter);
    } catch {
      return { items: [], total: 0, page: 1, pageSize: filter.pageSize ?? 20, totalPages: 0 };
    }
  },

  async getById(id: string): Promise<ReturnRequestDTO | null> {
    try {
      await requirePermission("POS_RETURNS", "process returns");
      return await ReturnRepository.findById(id);
    } catch {
      return null;
    }
  },

  async getReturnedQuantities(saleId: string): Promise<Map<string, number>> {
    try {
      await requirePermission("POS_RETURNS", "process returns");
      return await ReturnRepository.findReturnedQuantities(saleId);
    } catch {
      return new Map();
    }
  },

  async createRequest(input: CreateReturnRequestInput) {
    try {
      await requirePermission("POS_RETURNS", "process returns");
      const session = currentSession();

      if (!input.items.length) {
        return { success: false as const, error: "Select at least one item to return." };
      }
      if (!input.exchangeItems.length) {
        return { success: false as const, error: "Select at least one replacement item." };
      }
      if (!input.reason?.trim()) {
        return { success: false as const, error: "A return reason is required." };
      }

      const sale = await SaleRepository.findById(input.saleId);
      if (!sale) {
        return { success: false as const, error: "Original receipt not found." };
      }

      const returnedMap = await ReturnRepository.findReturnedQuantities(sale.id);
      const resolvedItems: any[] = [];
      let returnedTotal = 0;

      for (const item of input.items) {
        const saleItem = sale.items.find((si) => si.id === item.saleItemId);
        if (!saleItem) {
          return { success: false as const, error: "A selected return item no longer exists on this receipt." };
        }
        if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
          return { success: false as const, error: `Invalid quantity for ${saleItem.productName}.` };
        }
        const alreadyReturned = returnedMap.get(saleItem.id) ?? 0;
        const remaining = saleItem.quantity - alreadyReturned;
        if (item.quantity > remaining) {
          return {
            success: false as const,
            error: `Only ${remaining} of ${saleItem.productName} can still be returned (${alreadyReturned} already returned).`,
          };
        }
        const lineTotal = round2(item.quantity * saleItem.unitPrice);
        returnedTotal += lineTotal;
        resolvedItems.push({
          saleItemId: saleItem.id,
          productId: saleItem.productId ?? null,
          productName: saleItem.productName,
          sku: saleItem.sku ?? null,
          barcode: saleItem.barcode ?? null,
          quantity: item.quantity,
          unitPrice: saleItem.unitPrice,
          lineTotal,
          condition: item.condition ?? null,
        });
      }

      const resolvedExchangeItems: any[] = [];
      let replacementTotal = 0;
      for (const item of input.exchangeItems) {
        if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
          return { success: false as const, error: "Replacement quantities must be at least 1." };
        }
        const product = await resolveExchangeProduct(item.productId);
        if (!product) {
          return { success: false as const, error: "A replacement product no longer exists." };
        }
        const inventory = await InventoryRepository.findByProduct(product.id);
        if (inventory && inventory.availableQty < item.quantity) {
          return {
            success: false as const,
            error: `Not enough stock for ${product.name}. Available: ${inventory.availableQty}, requested: ${item.quantity}.`,
          };
        }
        const unitPrice = product.retailPrice ?? 0;
        const lineTotal = round2(item.quantity * unitPrice);
        replacementTotal += lineTotal;
        resolvedExchangeItems.push({
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          barcode: product.barcode,
          quantity: item.quantity,
          unitPrice,
          lineTotal,
          unit: product.unit,
          weight: product.weight ?? null,
        });
      }

      returnedTotal = round2(returnedTotal);
      replacementTotal = round2(replacementTotal);
      const priceDifference = round2(replacementTotal - returnedTotal);
      const acceptedShortfall = Boolean(input.customerAcceptedShortfall);

      if (priceDifference < 0 && !acceptedShortfall) {
        return {
          success: false as const,
          error: "The replacement item costs less than the returned items. The customer must accept the price difference before continuing.",
        };
      }

      const business = BusinessConfigurationService.current();
      const device = useDeviceStore.getState().device;
      const now = new Date().toISOString();

      const request = await ReturnRepository.create({
        ...input,
        returnNumber: createReturnNumber(),
        receiptNumber: sale.receiptNumber,
        returnedTotal,
        replacementTotal,
        priceDifference,
        customerAcceptedShortfall: acceptedShortfall,
        requestedById: session.cashierId,
        requestedByName: session.cashierName,
        businessDate: now.split("T")[0],
        deviceId: device.deviceId ?? null,
        branchId: device.branchId ?? null,
        businessId: business.businessId,
        originMode: business.operatingMode,
        resolvedItems,
        resolvedExchangeItems,
      });

      await AuditService.log(
        "RETURN_REQUEST_CREATED",
        `Return ${request.returnNumber} requested from receipt ${sale.receiptNumber}`,
        session.cashierId,
        session.cashierName,
        JSON.stringify({
          returnNumber: request.returnNumber,
          receiptNumber: sale.receiptNumber,
          returnedTotal,
          replacementTotal,
          priceDifference,
        })
      );

      return { success: true as const, request };
    } catch (e: any) {
      return { success: false, error: e.message ?? "Return request creation failed" };
    }
  },

  async generateApprovalCode(requestId: string) {
    try {
      await requirePermission("POS_RETURNS_APPROVE", "approve return requests");
      const session = currentSession();

      const request = await ReturnRepository.findById(requestId);
      if (!request) {
        return { success: false as const, error: "Return request not found." };
      }
      if (request.status !== "PENDING_APPROVAL") {
        return { success: false as const, error: `Only pending requests can be approved (current status: ${request.status}).` };
      }

      const code = generateApprovalCode();
      const expiresAt = new Date(Date.now() + APPROVAL_CODE_TTL_MS).toISOString();

      await ReturnRepository.setApprovalCode(
        request.id,
        sha256Hex(code),
        expiresAt,
        session.cashierId,
        session.cashierName
      );

      await AuditService.log(
        "RETURN_APPROVAL_CODE_GENERATED",
        `Approval code generated for return ${request.returnNumber}`,
        session.cashierId,
        session.cashierName,
        JSON.stringify({ returnNumber: request.returnNumber, expiresAt })
      );

      return { success: true as const, code, expiresAt };
    } catch (e: any) {
      return { success: false, error: e.message ?? "Approval code generation failed" };
    }
  },

  async approveWithCode(requestId: string, code: string) {
    try {
      await requirePermission("POS_RETURNS", "approve return requests");
      const session = currentSession();

      const request = await ReturnRepository.findById(requestId);
      if (!request) {
        return { success: false as const, error: "Return request not found." };
      }
      if (request.status !== "PENDING_APPROVAL") {
        return { success: false as const, error: `This request is already ${request.status.toLowerCase()}.` };
      }
      if (!request.approvalCodeHash || !request.codeExpiresAt) {
        return { success: false as const, error: "Ask a manager to generate an approval code first." };
      }
      if (request.codeUsedAt) {
        return { success: false as const, error: "This approval code was already used." };
      }
      if (new Date(request.codeExpiresAt).getTime() < Date.now()) {
        return { success: false as const, error: "This approval code has expired. Ask the manager for a new one." };
      }

      const normalized = (code ?? "").trim().toUpperCase();
      if (normalized.length !== APPROVAL_CODE_LENGTH) {
        return { success: false as const, error: "Enter the 6-character approval code." };
      }
      if (sha256Hex(normalized) !== request.approvalCodeHash) {
        await AuditService.log(
          "RETURN_APPROVAL_CODE_FAILED",
          `Invalid approval code entered for return ${request.returnNumber}`,
          session.cashierId,
          session.cashierName,
          JSON.stringify({ returnNumber: request.returnNumber })
        );
        return { success: false as const, error: "Incorrect approval code." };
      }

      // The approval authority is the manager who generated the code, not the
      // person who typed it in.
      await ReturnRepository.approve(
        request.id,
        request.codeGeneratedById ?? session.cashierId,
        request.codeGeneratedByName ?? session.cashierName
      );

      await AuditService.log(
        "RETURN_REQUEST_APPROVED",
        `Return ${request.returnNumber} approved`,
        request.codeGeneratedById ?? session.cashierId,
        request.codeGeneratedByName ?? session.cashierName,
        JSON.stringify({ returnNumber: request.returnNumber, enteredBy: session.cashierName })
      );

      const updated = await ReturnRepository.findById(request.id);
      return { success: true as const, request: updated };
    } catch (e: any) {
      return { success: false, error: e.message ?? "Approval failed" };
    }
  },

  async reject(requestId: string, reason?: string) {
    try {
      await requirePermission("POS_RETURNS_APPROVE", "reject return requests");
      const session = currentSession();

      const request = await ReturnRepository.findById(requestId);
      if (!request) {
        return { success: false as const, error: "Return request not found." };
      }
      if (request.status !== "PENDING_APPROVAL") {
        return { success: false as const, error: `Only pending requests can be rejected (current status: ${request.status}).` };
      }

      await ReturnRepository.reject(request.id, session.cashierId, session.cashierName, reason ?? null);
      await AuditService.log(
        "RETURN_REQUEST_REJECTED",
        `Return ${request.returnNumber} rejected`,
        session.cashierId,
        session.cashierName,
        JSON.stringify({ returnNumber: request.returnNumber, reason: reason ?? null })
      );

      const updated = await ReturnRepository.findById(request.id);
      return { success: true as const, request: updated };
    } catch (e: any) {
      return { success: false, error: e.message ?? "Rejection failed" };
    }
  },

  async cancel(requestId: string) {
    try {
      await requirePermission("POS_RETURNS", "cancel return requests");
      const session = currentSession();

      const request = await ReturnRepository.findById(requestId);
      if (!request) {
        return { success: false as const, error: "Return request not found." };
      }
      if (request.status !== "PENDING_APPROVAL" && request.status !== "APPROVED") {
        return { success: false as const, error: `A ${request.status.toLowerCase()} request cannot be cancelled.` };
      }

      await ReturnRepository.cancel(request.id);
      await AuditService.log(
        "RETURN_REQUEST_CANCELLED",
        `Return ${request.returnNumber} cancelled`,
        session.cashierId,
        session.cashierName,
        JSON.stringify({ returnNumber: request.returnNumber })
      );

      const updated = await ReturnRepository.findById(request.id);
      return { success: true as const, request: updated };
    } catch (e: any) {
      return { success: false, error: e.message ?? "Cancellation failed" };
    }
  },

  async completeExchange(requestId: string, options: { paymentMethod?: PaymentMethodType } = {}) {
    try {
      await requirePermission("POS_RETURNS", "complete exchanges");
      const session = currentSession();

      const request = await ReturnRepository.findById(requestId);
      if (!request) {
        return { success: false as const, error: "Return request not found." };
      }
      if (request.status !== "APPROVED") {
        return { success: false as const, error: "This request must be approved with a manager code before completing the exchange." };
      }
      if (!request.exchangeItems.length) {
        return { success: false as const, error: "This request has no replacement items." };
      }

      const returnedTotal = round2(request.items.reduce((sum, i) => sum + i.lineTotal, 0));
      const replacementTotal = round2(request.exchangeItems.reduce((sum, i) => sum + i.lineTotal, 0));
      const priceDifference = round2(replacementTotal - returnedTotal);

      if (priceDifference < 0 && !request.customerAcceptedShortfall) {
        return {
          success: false as const,
          error: "The replacement item costs less than the returned items. The customer must accept the price difference before continuing.",
        };
      }

      const originalSale = await SaleRepository.findById(request.saleId);
      const topUpMethod = priceDifference > 0 ? (options.paymentMethod ?? "CASH") : null;

      // The trade-in value of the returned items is applied as the discount on
      // the exchange sale; the customer only pays a positive difference.
      const saleResult = await SaleService.create({
        cashierId: session.cashierId,
        cashierName: session.cashierName,
        customerName: originalSale?.customerName ?? undefined,
        paymentMethod: topUpMethod ?? "CASH",
        items: request.exchangeItems.map((item) => ({
          productId: item.productId ?? "",
          productName: item.productName,
          sku: item.sku ?? undefined,
          barcode: item.barcode ?? undefined,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unit: item.unit ?? undefined,
          weight: item.weight ?? undefined,
        })),
        discount: Math.min(returnedTotal, replacementTotal),
        receiptNumber: createExchangeReceiptNumber(),
        paidAmount: priceDifference > 0 ? priceDifference : 0,
        deviceId: request.deviceId ?? undefined,
        branchId: request.branchId ?? undefined,
      });

      if (!saleResult.success || !saleResult.sale) {
        return { success: false as const, error: saleResult.error ?? "Exchange sale could not be created." };
      }

      // Restock the returned items and write reverse ledger movements.
      for (const item of request.items) {
        if (!item.productId) continue;
        const inventory = await InventoryRepository.findByProduct(item.productId);
        if (!inventory) continue;
        const balanceBefore = inventory.availableQty;
        const updatedInventory = await InventoryRepository.updateQuantities(item.productId, {
          availableQty: item.quantity,
          soldQty: -item.quantity,
        });
        if (!updatedInventory) continue;
        await InventoryLedgerRepository.create({
          movementType: "RETURN",
          referenceNumber: request.returnNumber,
          productId: item.productId,
          quantity: item.quantity,
          balanceBefore,
          balanceAfter: updatedInventory.availableQty,
          createdById: session.cashierId,
          createdByName: session.cashierName,
          notes: `Return from receipt ${request.receiptNumber}`,
        });
      }

      // When every line of the original sale has been returned, mark it REFUNDED.
      const returnedQuantities = await ReturnRepository.findReturnedQuantities(request.saleId);
      const fullyReturned = originalSale?.items.every(
        (saleItem) => (returnedQuantities.get(saleItem.id) ?? 0) >= saleItem.quantity
      );
      if (fullyReturned && originalSale && originalSale.status !== "REFUNDED") {
        await SaleRepository.updateStatus(originalSale.id, "REFUNDED");
      }

      await ReturnRepository.markCompleted(
        request.id,
        saleResult.sale.id,
        topUpMethod,
        priceDifference,
        request.customerAcceptedShortfall > 0
      );

      const payload = {
        returnNumber: request.returnNumber,
        receiptNumber: request.receiptNumber,
        status: "COMPLETED",
        returnedTotal,
        replacementTotal,
        priceDifference,
        customerAcceptedShortfall: request.customerAcceptedShortfall > 0,
        reason: request.reason,
        requestedByName: request.requestedByName,
        approvedByName: request.approvedByName,
        exchangeReceiptNumber: saleResult.sale.receiptNumber,
        items: request.items.map((i) => ({
          saleItemId: i.saleItemId,
          productName: i.productName,
          sku: i.sku,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          lineTotal: i.lineTotal,
        })),
        exchangeItems: request.exchangeItems.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          sku: i.sku,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          lineTotal: i.lineTotal,
        })),
        deviceId: request.deviceId,
      };
      await SyncQueueService.enqueue("Return", request.id, "CREATE", payload, `return:${request.id}`);

      await AuditService.log(
        "RETURN_EXCHANGE_COMPLETED",
        `Return ${request.returnNumber} exchanged for receipt ${saleResult.sale.receiptNumber}`,
        session.cashierId,
        session.cashierName,
        JSON.stringify({
          returnNumber: request.returnNumber,
          exchangeReceiptNumber: saleResult.sale.receiptNumber,
          returnedTotal,
          replacementTotal,
          priceDifference,
        })
      );

      const updated = await ReturnRepository.findById(request.id);
      return { success: true as const, request: updated, exchangeSale: saleResult.sale };
    } catch (e: any) {
      return { success: false, error: e.message ?? "Exchange completion failed" };
    }
  },
};

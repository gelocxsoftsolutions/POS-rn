import type { SaleDTO } from "@/lib/types/sales";

export function nctSalePayload(sale: SaleDTO) {
  if (!sale.deviceId || !sale.branchId) throw new Error("Sale is missing its original branch or device. Review it before retrying.");
  if (!sale.items.length || sale.items.some((item) => !Number.isInteger(Number(item.sku)) || Number(item.sku) <= 0)) {
    throw new Error("Sale contains items that are not linked to OMS variations.");
  }
  return {
    clientSaleId: sale.id, receiptNumber: sale.receiptNumber,
    deviceId: sale.deviceId, branchId: sale.branchId,
    cashierId: sale.cashierId, cashierName: sale.cashierName,
    createdAt: sale.createdAt, paymentMethod: sale.paymentMethod,
    subtotal: sale.subtotal, discount: sale.discount, tax: sale.tax, total: sale.total,
    items: sale.items.map((item) => ({ variationId: Number(item.sku), qty: item.quantity, unitPrice: item.unitPrice })),
  };
}

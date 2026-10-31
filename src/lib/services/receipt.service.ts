import { formatAmount } from "@/lib/formatting/money";
import { withNctActionAudit } from "./action-audit";
import { ReceiptRepository } from "@/lib/repositories/receipt.repository";
import { queryFirst } from "@/lib/db/connection";

export interface SaleRow {
  id: string;
  receiptNumber: string;
  cashierName: string | null;
  itemCount: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paidAmount: number;
  changeAmount: number;
  paymentMethod: string;
  createdAt: string;
}

export interface SaleItemRow {
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}

export interface ReceiptSettings {
  storeName?: string;
  storeCode?: string;
  address?: string;
  phone?: string;
  receiptFooter?: string;
}

export const ReceiptService = withNctActionAudit("Receipt", {
  async getBySaleId(saleId: string) {
    try {
      return await ReceiptRepository.findBySaleId(saleId);
    } catch {
      return null;
    }
  },

  async create(
    saleId: string,
    storeName: string,
    storeCode: string,
    address: string,
    phone: string,
    footer: string
  ) {
    try {
      return await ReceiptRepository.create({
        saleId,
        storeName,
        storeCode,
        address,
        phone,
        footer,
        printedAt: new Date().toISOString(),
      });
    } catch (e: any) {
      throw new Error(e.message ?? "Failed to create receipt");
    }
  },

  generateReceiptText(
    sale: SaleRow,
    items: SaleItemRow[],
    settings: ReceiptSettings
  ): string {
    const lines: string[] = [];
    const divider = "================================";

    lines.push(divider);
    lines.push(settings.storeName ?? "");
    lines.push(settings.storeCode ?? "");
    lines.push(settings.address ?? "");
    lines.push(settings.phone ?? "");
    lines.push(divider);
    lines.push(`Receipt: ${sale.receiptNumber}`);
    lines.push(`Date: ${sale.createdAt}`);
    lines.push(`Cashier: ${sale.cashierName ?? ""}`);
    lines.push(divider);
    lines.push("");

    for (const item of items) {
      const name = item.productName;
      const qty = `x${item.quantity}`;
      const price = formatAmount(item.lineTotal);
      lines.push(`${name} ${qty}`);
      lines.push(`  @ ${formatAmount(item.unitPrice)}   ${price}`);
    }

    lines.push("");
    lines.push(divider);
    lines.push(`Subtotal:   ${formatAmount(sale.subtotal)}`);
    if (sale.discount > 0) {
      lines.push(`Discount:  -${formatAmount(sale.discount)}`);
    }
    if (sale.tax > 0) {
      lines.push(`Tax:        ${formatAmount(sale.tax)}`);
    }
    lines.push(`TOTAL:      ${formatAmount(sale.total)}`);
    lines.push("");
    lines.push(`Payment: ${sale.paymentMethod}`);
    lines.push(`Paid:    ${formatAmount(sale.paidAmount)}`);
    lines.push(`Change:  ${formatAmount(sale.changeAmount)}`);
    lines.push("");
    lines.push(divider);
    lines.push(settings.receiptFooter ?? "Thank you for your purchase!");
    lines.push(divider);

    return lines.join("\n");
  },
});

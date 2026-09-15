import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import type { SaleDTO, SaleItemDTO, PaymentDTO, SaleFilter, PaginatedResult } from "@/lib/types/sales";

export interface CreateSaleInput {
  receiptNumber: string;
  cashierId?: string;
  cashierName?: string;
  customerName?: string;
  itemCount: number;
  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;
  paidAmount: number;
  changeAmount?: number;
  paymentMethod?: string;
  status?: string;
  businessDate?: string;
  shiftId?: string;
  deviceId?: string;
  branchId?: number;
  items: Array<{
    productId?: string;
    productName: string;
    sku?: string;
    barcode?: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    tax?: number;
    lineTotal: number;
    unit?: string;
  }>;
  payments: Array<{
    method: string;
    amount: number;
    reference?: string;
  }>;
}

export const SaleRepository = {
  async findById(id: string): Promise<SaleDTO | null> {
    const sale = await queryFirst<SaleDTO>(
      "SELECT * FROM Sale WHERE id = ?",
      [id]
    );
    if (!sale) return null;

    const items = await query<SaleItemDTO>(
      "SELECT * FROM SaleItem WHERE saleId = ?",
      [id]
    );
    const payments = await query<PaymentDTO>(
      "SELECT * FROM Payment WHERE saleId = ?",
      [id]
    );

    return { ...sale, items, payments };
  },

  async findByReceiptNumber(receiptNumber: string): Promise<SaleDTO | null> {
    const sale = await queryFirst<SaleDTO>(
      "SELECT * FROM Sale WHERE receiptNumber = ?",
      [receiptNumber]
    );
    if (!sale) return null;

    const items = await query<SaleItemDTO>(
      "SELECT * FROM SaleItem WHERE saleId = ?",
      [sale.id]
    );
    const payments = await query<PaymentDTO>(
      "SELECT * FROM Payment WHERE saleId = ?",
      [sale.id]
    );

    return { ...sale, items, payments };
  },

  async findMany(filter: SaleFilter): Promise<PaginatedResult<SaleDTO>> {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: any[] = [];

    if (filter.search) {
      conditions.push("(s.receiptNumber LIKE ? OR s.customerName LIKE ? OR s.cashierName LIKE ?)");
      const term = `%${filter.search}%`;
      params.push(term, term, term);
    }
    if (filter.status) {
      conditions.push("s.status = ?");
      params.push(filter.status);
    }
    if (filter.paymentMethod) {
      conditions.push("s.paymentMethod = ?");
      params.push(filter.paymentMethod);
    }
    if (filter.cashierId) {
      conditions.push("s.cashierId = ?");
      params.push(filter.cashierId);
    }
    if (filter.shiftId) {
      conditions.push("s.shiftId = ?");
      params.push(filter.shiftId);
    }
    if (filter.startDate) {
      conditions.push("s.createdAt >= ?");
      params.push(filter.startDate);
    }
    if (filter.endDate) {
      conditions.push("s.createdAt <= ?");
      params.push(filter.endDate);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await queryFirst<{ c: number }>(
      `SELECT COUNT(*) as c FROM Sale s ${where}`,
      params
    );
    const total = countResult?.c ?? 0;

    const sales = await query<SaleDTO>(
      `SELECT s.* FROM Sale s ${where} ORDER BY s.createdAt DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const items = await query<SaleItemDTO>(
      `SELECT si.* FROM SaleItem si INNER JOIN Sale s ON si.saleId = s.id ${where.replace(/s\./g, "s.")}`,
      params
    );
    const payments = await query<PaymentDTO>(
      `SELECT p.* FROM Payment p INNER JOIN Sale s ON p.saleId = s.id ${where.replace(/s\./g, "s.")}`,
      params
    );

    const salesWithDetails = sales.map((sale) => ({
      ...sale,
      items: items.filter((i) => i.saleId === sale.id),
      payments: payments.filter((p) => p.saleId === sale.id),
    }));

    return {
      items: salesWithDetails,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  },

  async create(input: CreateSaleInput): Promise<SaleDTO> {
    const id = uuid();
    const now = new Date().toISOString();

    await execute(
      `INSERT INTO Sale (id, receiptNumber, cashierId, cashierName, customerName, itemCount, subtotal, discount, tax, total, paidAmount, changeAmount, paymentMethod, status, businessDate, shiftId, deviceId, branchId, synced, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        id,
        input.receiptNumber,
        input.cashierId ?? null,
        input.cashierName ?? null,
        input.customerName ?? null,
        input.itemCount,
        input.subtotal,
        input.discount ?? 0,
        input.tax ?? 0,
        input.total,
        input.paidAmount,
        input.changeAmount ?? 0,
        input.paymentMethod ?? "CASH",
        input.status ?? "COMPLETED",
        input.businessDate ?? null,
        input.shiftId ?? null,
        input.deviceId ?? null,
        input.branchId ?? null,
        now,
      ]
    );

    for (const item of input.items) {
      const itemId = uuid();
      await execute(
        `INSERT INTO SaleItem (id, saleId, productId, productName, sku, barcode, quantity, unitPrice, discount, tax, lineTotal, unit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          itemId,
          id,
          item.productId ?? null,
          item.productName,
          item.sku ?? null,
          item.barcode ?? null,
          item.quantity,
          item.unitPrice,
          item.discount ?? 0,
          item.tax ?? 0,
          item.lineTotal,
          item.unit ?? null,
        ]
      );
    }

    for (const payment of input.payments) {
      const paymentId = uuid();
      await execute(
        `INSERT INTO Payment (id, saleId, method, amount, reference, status, createdAt)
         VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?)`,
        [paymentId, id, payment.method, payment.amount, payment.reference ?? null, now]
      );
    }

    return this.findById(id) as Promise<SaleDTO>;
  },

  async markSynced(id: string): Promise<void> {
    await execute(
      "UPDATE Sale SET synced = 1 WHERE id = ?",
      [id]
    );
  },

  async findUnsynced(limit: number = 50): Promise<SaleDTO[]> {
    const sales = await query<SaleDTO>(
      "SELECT * FROM Sale WHERE synced = 0 AND status = 'COMPLETED' ORDER BY createdAt ASC LIMIT ?",
      [limit]
    );
    for (const sale of sales) {
      sale.items = await query<SaleItemDTO>(
        "SELECT * FROM SaleItem WHERE saleId = ?",
        [sale.id]
      );
      sale.payments = await query<PaymentDTO>(
        "SELECT * FROM Payment WHERE saleId = ?",
        [sale.id]
      );
    }
    return sales;
  },

  async countToday(): Promise<number> {
    const today = new Date().toISOString().split("T")[0];
    const result = await queryFirst<{ c: number }>(
      "SELECT COUNT(*) as c FROM Sale WHERE businessDate = ? AND status = 'COMPLETED'",
      [today]
    );
    return result?.c ?? 0;
  },

  async sumTotalToday(): Promise<number> {
    const today = new Date().toISOString().split("T")[0];
    const result = await queryFirst<{ s: number }>(
      "SELECT COALESCE(SUM(total), 0) as s FROM Sale WHERE businessDate = ? AND status = 'COMPLETED'",
      [today]
    );
    return result?.s ?? 0;
  },
};

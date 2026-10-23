import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import type {
  CreateReturnRequestInput,
  ReturnExchangeItemDTO,
  ReturnRequestDTO,
  ReturnRequestFilter,
  ReturnRequestItemDTO,
  ReturnRequestStatus,
} from "@/lib/types/returns";
import type { PaginatedResult } from "@/lib/types/inventory";

const ACTIVE_STATUSES_FOR_RETURN_CAP = [
  "PENDING_APPROVAL",
  "APPROVED",
  "COMPLETED",
];

async function loadItems(requestIds: string[]): Promise<Map<string, ReturnRequestItemDTO[]>> {
  const map = new Map<string, ReturnRequestItemDTO[]>();
  if (requestIds.length === 0) return map;
  const placeholders = requestIds.map(() => "?").join(", ");
  const rows = await query<ReturnRequestItemDTO>(
    `SELECT * FROM ReturnRequestItem WHERE returnRequestId IN (${placeholders}) ORDER BY createdAt ASC`,
    requestIds
  );
  for (const row of rows) {
    const list = map.get(row.returnRequestId) ?? [];
    list.push(row);
    map.set(row.returnRequestId, list);
  }
  return map;
}

async function loadExchangeItems(requestIds: string[]): Promise<Map<string, ReturnExchangeItemDTO[]>> {
  const map = new Map<string, ReturnExchangeItemDTO[]>();
  if (requestIds.length === 0) return map;
  const placeholders = requestIds.map(() => "?").join(", ");
  const rows = await query<ReturnExchangeItemDTO>(
    `SELECT * FROM ReturnExchangeItem WHERE returnRequestId IN (${placeholders}) ORDER BY createdAt ASC`,
    requestIds
  );
  for (const row of rows) {
    const list = map.get(row.returnRequestId) ?? [];
    list.push(row);
    map.set(row.returnRequestId, list);
  }
  return map;
}

export const ReturnRepository = {
  async findById(id: string): Promise<ReturnRequestDTO | null> {
    const request = await queryFirst<ReturnRequestDTO>(
      "SELECT * FROM ReturnRequest WHERE id = ?",
      [id]
    );
    if (!request) return null;
    const items = (await loadItems([id])).get(id) ?? [];
    const exchangeItems = (await loadExchangeItems([id])).get(id) ?? [];
    return { ...request, items, exchangeItems };
  },

  async findByReturnNumber(returnNumber: string): Promise<ReturnRequestDTO | null> {
    const request = await queryFirst<ReturnRequestDTO>(
      "SELECT * FROM ReturnRequest WHERE returnNumber = ?",
      [returnNumber]
    );
    if (!request) return null;
    return this.findById(request.id);
  },

  async findMany(filter: ReturnRequestFilter): Promise<PaginatedResult<ReturnRequestDTO>> {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: any[] = [];

    if (filter.search) {
      conditions.push(
        "(r.returnNumber LIKE ? OR r.receiptNumber LIKE ? OR r.requestedByName LIKE ?)"
      );
      const term = `%${filter.search}%`;
      params.push(term, term, term);
    }
    if (filter.status) {
      conditions.push("r.status = ?");
      params.push(filter.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await queryFirst<{ c: number }>(
      `SELECT COUNT(*) as c FROM ReturnRequest r ${where}`,
      params
    );
    const total = countResult?.c ?? 0;

    const requests = await query<ReturnRequestDTO>(
      `SELECT r.* FROM ReturnRequest r ${where} ORDER BY r.createdAt DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const items = await loadItems(requests.map((r) => r.id));
    const exchangeItems = await loadExchangeItems(requests.map((r) => r.id));

    return {
      items: requests.map((request) => ({
        ...request,
        items: items.get(request.id) ?? [],
        exchangeItems: exchangeItems.get(request.id) ?? [],
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  },

  async create(
    input: CreateReturnRequestInput & {
      returnNumber: string;
      returnedTotal: number;
      replacementTotal: number;
      priceDifference: number;
      customerAcceptedShortfall: boolean;
      requestedById: string;
      requestedByName: string;
      receiptNumber: string;
      businessDate: string;
      deviceId: string | null;
      branchId: number | null;
      businessId: string;
      originMode: string;
      resolvedItems: Array<{
        saleItemId: string;
        productId: string | null;
        productName: string;
        sku: string | null;
        barcode: string | null;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
        condition: string | null;
      }>;
      resolvedExchangeItems: Array<{
        productId: string;
        productName: string;
        sku: string | null;
        barcode: string | null;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
        unit: string | null;
        weight: number | null;
      }>;
    }
  ): Promise<ReturnRequestDTO> {
    const id = uuid();
    const now = new Date().toISOString();

    await execute(
      `INSERT INTO ReturnRequest
       (id, returnNumber, saleId, receiptNumber, status, reason, returnedTotal, replacementTotal, priceDifference,
        customerAcceptedShortfall, requestedById, requestedByName, businessDate, deviceId, branchId, businessId,
        originMode, synced, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'PENDING_APPROVAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        input.returnNumber,
        input.saleId,
        input.receiptNumber,
        input.reason,
        input.returnedTotal,
        input.replacementTotal,
        input.priceDifference,
        input.customerAcceptedShortfall ? 1 : 0,
        input.requestedById,
        input.requestedByName,
        input.businessDate,
        input.deviceId,
        input.branchId,
        input.businessId,
        input.originMode,
        now,
        now,
      ]
    );

    for (const item of input.resolvedItems) {
      await execute(
        `INSERT INTO ReturnRequestItem
         (id, returnRequestId, saleItemId, productId, productName, sku, barcode, quantity, unitPrice, lineTotal, condition, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid(),
          id,
          item.saleItemId,
          item.productId,
          item.productName,
          item.sku,
          item.barcode,
          item.quantity,
          item.unitPrice,
          item.lineTotal,
          item.condition,
          now,
        ]
      );
    }

    for (const item of input.resolvedExchangeItems) {
      await execute(
        `INSERT INTO ReturnExchangeItem
         (id, returnRequestId, productId, productName, sku, barcode, quantity, unitPrice, lineTotal, unit, weight, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid(),
          id,
          item.productId,
          item.productName,
          item.sku,
          item.barcode,
          item.quantity,
          item.unitPrice,
          item.lineTotal,
          item.unit,
          item.weight,
          now,
        ]
      );
    }

    return this.findById(id) as Promise<ReturnRequestDTO>;
  },

  async setApprovalCode(
    id: string,
    codeHash: string,
    expiresAt: string,
    generatedById: string,
    generatedByName: string
  ): Promise<void> {
    await execute(
      `UPDATE ReturnRequest
       SET approvalCodeHash = ?, codeExpiresAt = ?, codeUsedAt = NULL,
           codeGeneratedById = ?, codeGeneratedByName = ?, updatedAt = ?
       WHERE id = ?`,
      [codeHash, expiresAt, generatedById, generatedByName, new Date().toISOString(), id]
    );
  },

  async approve(
    id: string,
    approvedById: string,
    approvedByName: string
  ): Promise<void> {
    await execute(
      `UPDATE ReturnRequest
       SET status = 'APPROVED', codeUsedAt = ?, approvedById = ?, approvedByName = ?, approvedAt = ?, updatedAt = ?
       WHERE id = ?`,
      [new Date().toISOString(), approvedById, approvedByName, new Date().toISOString(), new Date().toISOString(), id]
    );
  },

  async reject(
    id: string,
    rejectedById: string,
    rejectedByName: string,
    reason: string | null
  ): Promise<void> {
    await execute(
      `UPDATE ReturnRequest
       SET status = 'REJECTED', rejectedById = ?, rejectedByName = ?, rejectedAt = ?, rejectionReason = ?, updatedAt = ?
       WHERE id = ?`,
      [rejectedById, rejectedByName, new Date().toISOString(), reason, new Date().toISOString(), id]
    );
  },

  async cancel(id: string): Promise<void> {
    await execute(
      `UPDATE ReturnRequest SET status = 'CANCELLED', updatedAt = ? WHERE id = ?`,
      [new Date().toISOString(), id]
    );
  },

  async markCompleted(
    id: string,
    exchangeSaleId: string,
    topUpMethod: string | null,
    priceDifference: number,
    customerAcceptedShortfall: boolean
  ): Promise<void> {
    await execute(
      `UPDATE ReturnRequest
       SET status = 'COMPLETED', exchangeSaleId = ?, topUpMethod = ?, priceDifference = ?,
           customerAcceptedShortfall = ?, updatedAt = ?
       WHERE id = ?`,
      [
        exchangeSaleId,
        topUpMethod,
        priceDifference,
        customerAcceptedShortfall ? 1 : 0,
        new Date().toISOString(),
        id,
      ]
    );
  },

  async markSynced(id: string): Promise<void> {
    await execute("UPDATE ReturnRequest SET synced = 1 WHERE id = ?", [id]);
  },

  /**
   * Quantity of a sale item already committed to return requests
   * (pending, approved, or completed — rejected/cancelled requests do not
   * consume the return cap).
   */
  async findReturnedQuantities(saleId: string): Promise<Map<string, number>> {
    const placeholders = ACTIVE_STATUSES_FOR_RETURN_CAP.map(() => "?").join(", ");
    const rows = await query<{ saleItemId: string; returnedQty: number }>(
      `SELECT ri.saleItemId as saleItemId, COALESCE(SUM(ri.quantity), 0) as returnedQty
       FROM ReturnRequestItem ri
       INNER JOIN ReturnRequest r ON ri.returnRequestId = r.id
       WHERE r.saleId = ? AND r.status IN (${placeholders}) AND ri.saleItemId IS NOT NULL
       GROUP BY ri.saleItemId`,
      [saleId, ...ACTIVE_STATUSES_FOR_RETURN_CAP]
    );
    const map = new Map<string, number>();
    for (const row of rows) map.set(row.saleItemId, row.returnedQty);
    return map;
  },
};

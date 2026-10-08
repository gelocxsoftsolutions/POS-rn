import { query, queryFirst } from "@/lib/db/connection";

// Customers are recorded as free-text customerName on completed sales.
// There is no separate customer master table, so every aggregate below is
// derived from named sales (blank/anonymous checkouts are excluded).

export interface CustomerSummary {
  name: string;
  orders: number;
  totalSpent: number;
  lastPurchase: string | null;
}

export interface CustomerItemStat {
  productName: string;
  quantity: number;
  revenue: number;
}

export interface CustomerSaleRow {
  id: string;
  receiptNumber: string;
  total: number;
  itemCount: number;
  paymentMethod: string;
  status: string;
  createdAt: string;
}

export interface CustomerProfile extends CustomerSummary {
  weeklySpent: number;
  weeklyOrders: number;
  monthlySpent: number;
  monthlyOrders: number;
  topItems: CustomerItemStat[];
  recentSales: CustomerSaleRow[];
  refunds: CustomerSaleRow[];
}

const NAMED_SALE = `s.status = 'COMPLETED' AND s.customerName IS NOT NULL AND TRIM(s.customerName) <> ''`;
const BLANK_SALE = `s.status = 'COMPLETED' AND (s.customerName IS NULL OR TRIM(s.customerName) = '')`;

export const WALK_IN_LABEL = "Walk-in";

// undefined = all named customers, string = that customer, null = no-name sales.
function saleScope(customerName: string | null | undefined): { clause: string; params: string[] } {
  if (customerName === null) return { clause: BLANK_SALE, params: [] };
  if (customerName === undefined) return { clause: NAMED_SALE, params: [] };
  return { clause: `${NAMED_SALE} AND TRIM(s.customerName) = TRIM(?)`, params: [customerName.trim()] };
}

function cashierClause(cashierIds: string[]): { clause: string; params: string[] } {
  if (cashierIds.length === 0) return { clause: "1 = 0", params: [] };
  return {
    clause: `s.cashierId IN (${cashierIds.map(() => "?").join(",")})`,
    params: [...cashierIds],
  };
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

export const CustomerService = {
  async list(cashierIds: string[]): Promise<CustomerSummary[]> {
    if (cashierIds.length === 0) return [];
    const { clause, params } = cashierClause(cashierIds);
    const rows = await query<{
      name: string;
      orders: number;
      totalSpent: number;
      lastPurchase: string | null;
    }>(
      `SELECT TRIM(s.customerName) as name,
              COUNT(*) as orders,
              COALESCE(SUM(s.total), 0) as totalSpent,
              MAX(s.createdAt) as lastPurchase
       FROM Sale s
       WHERE ${NAMED_SALE} AND ${clause}
       GROUP BY TRIM(s.customerName)
       ORDER BY totalSpent DESC`,
      params
    );
    return rows.map((r) => ({
      name: r.name,
      orders: Number(r.orders ?? 0),
      totalSpent: Number(r.totalSpent ?? 0),
      lastPurchase: r.lastPurchase,
    }));
  },

  async anonymous(cashierIds: string[]): Promise<CustomerSummary | null> {
    if (cashierIds.length === 0) return null;
    const { clause, params } = cashierClause(cashierIds);
    const row = await queryFirst<{ orders: number; totalSpent: number; lastPurchase: string | null }>(
      `SELECT COUNT(*) as orders,
              COALESCE(SUM(s.total), 0) as totalSpent,
              MAX(s.createdAt) as lastPurchase
       FROM Sale s
       WHERE ${BLANK_SALE} AND ${clause}`,
      params
    );
    if (!row || Number(row.orders ?? 0) === 0) return null;
    return {
      name: WALK_IN_LABEL,
      orders: Number(row.orders ?? 0),
      totalSpent: Number(row.totalSpent ?? 0),
      lastPurchase: row.lastPurchase,
    };
  },

  async topItems(cashierIds: string[], limit = 5, customerName?: string | null): Promise<CustomerItemStat[]> {
    if (cashierIds.length === 0) return [];
    const { clause, params } = cashierClause(cashierIds);
    const scope = saleScope(customerName);
    const rows = await query<{ productName: string; quantity: number; revenue: number }>(
      `SELECT si.productName as productName,
              COALESCE(SUM(si.quantity), 0) as quantity,
              COALESCE(SUM(si.lineTotal), 0) as revenue
       FROM SaleItem si
       INNER JOIN Sale s ON s.id = si.saleId
       WHERE ${scope.clause} AND ${clause}
         AND si.productName IS NOT NULL AND TRIM(si.productName) <> ''
       GROUP BY TRIM(si.productName)
       ORDER BY quantity DESC
       LIMIT ?`,
      [...scope.params, ...params, limit]
    );
    return rows.map((r) => ({
      productName: r.productName,
      quantity: Number(r.quantity ?? 0),
      revenue: Number(r.revenue ?? 0),
    }));
  },

  async profile(customerName: string | null, cashierIds: string[]): Promise<CustomerProfile | null> {
    const isWalkIn = customerName === null;
    const displayName = isWalkIn ? WALK_IN_LABEL : customerName.trim();
    if ((!isWalkIn && !displayName) || cashierIds.length === 0) return null;
    const { clause, params } = cashierClause(cashierIds);
    const scope = saleScope(isWalkIn ? null : displayName);

    const summary = isWalkIn
      ? await queryFirst<{ orders: number; totalSpent: number; lastPurchase: string | null }>(
          `SELECT COUNT(*) as orders,
                  COALESCE(SUM(s.total), 0) as totalSpent,
                  MAX(s.createdAt) as lastPurchase
           FROM Sale s
           WHERE ${scope.clause} AND ${clause}`,
          [...scope.params, ...params]
        )
      : await queryFirst<CustomerSummary>(
          `SELECT TRIM(s.customerName) as name,
                  COUNT(*) as orders,
                  COALESCE(SUM(s.total), 0) as totalSpent,
                  MAX(s.createdAt) as lastPurchase
           FROM Sale s
           WHERE ${scope.clause} AND ${clause}
           GROUP BY TRIM(s.customerName)`,
          [...scope.params, ...params]
        );
    if (!summary || Number(summary.orders ?? 0) === 0) return null;

    const week = await queryFirst<{ spent: number; orders: number }>(
      `SELECT COALESCE(SUM(s.total), 0) as spent, COUNT(*) as orders
       FROM Sale s
       WHERE ${scope.clause} AND ${clause} AND s.createdAt >= ?`,
      [...scope.params, ...params, isoDaysAgo(7)]
    );
    const month = await queryFirst<{ spent: number; orders: number }>(
      `SELECT COALESCE(SUM(s.total), 0) as spent, COUNT(*) as orders
       FROM Sale s
       WHERE ${scope.clause} AND ${clause} AND s.createdAt >= ?`,
      [...scope.params, ...params, isoDaysAgo(30)]
    );

    const topItems = await this.topItems(cashierIds, 8, isWalkIn ? null : displayName);

    const recent = await query<CustomerSaleRow>(
      `SELECT s.id as id, s.receiptNumber as receiptNumber, s.total as total,
              s.itemCount as itemCount, s.paymentMethod as paymentMethod,
              s.status as status, s.createdAt as createdAt
       FROM Sale s
       WHERE ${scope.clause} AND ${clause}
       ORDER BY s.createdAt DESC
       LIMIT 10`,
      [...scope.params, ...params]
    );

    // Returns / refunds: sales explicitly marked as such for this customer.
    const refundNameFilter = isWalkIn
      ? `(s.customerName IS NULL OR TRIM(s.customerName) = '')`
      : `TRIM(s.customerName) = TRIM(?)`;
    const refundNameParams = isWalkIn ? [] : [displayName];
    const refunds = await query<CustomerSaleRow>(
      `SELECT s.id as id, s.receiptNumber as receiptNumber, s.total as total,
              s.itemCount as itemCount, s.paymentMethod as paymentMethod,
              s.status as status, s.createdAt as createdAt
       FROM Sale s
       WHERE ${refundNameFilter}
         AND s.status IN ('REFUNDED', 'CANCELLED') AND ${clause}
       ORDER BY s.createdAt DESC
       LIMIT 20`,
      [...refundNameParams, ...params]
    );

    return {
      name: isWalkIn ? WALK_IN_LABEL : (summary as CustomerSummary).name,
      orders: Number(summary.orders ?? 0),
      totalSpent: Number(summary.totalSpent ?? 0),
      lastPurchase: summary.lastPurchase,
      weeklySpent: Number(week?.spent ?? 0),
      weeklyOrders: Number(week?.orders ?? 0),
      monthlySpent: Number(month?.spent ?? 0),
      monthlyOrders: Number(month?.orders ?? 0),
      topItems,
      recentSales: recent,
      refunds,
    };
  },
};

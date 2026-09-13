import { query, queryFirst, execute } from "@/lib/db/connection";

export interface StockAlertRow {
  id: string;
  productId: string;
  alertType: string;
  currentQty: number;
  thresholdQty: number;
  acknowledged: number;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

export const StockAlertRepository = {
  async findUnacknowledged(): Promise<StockAlertRow[]> {
    return query<StockAlertRow>(
      `SELECT sa.*, p.name as productName, p.sku as productSku
       FROM StockAlert sa
       INNER JOIN Product p ON sa.productId = p.id
       WHERE sa.acknowledged = 0
       ORDER BY sa.createdAt DESC`
    );
  },

  async acknowledge(
    id: string,
    acknowledgedBy?: string
  ): Promise<void> {
    const now = new Date().toISOString();
    await execute(
      `UPDATE StockAlert SET acknowledged = 1, acknowledgedBy = ?, acknowledgedAt = ? WHERE id = ?`,
      [acknowledgedBy ?? null, now, id]
    );
  },
};

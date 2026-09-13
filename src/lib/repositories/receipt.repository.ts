import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import type { ReceiptDTO } from "@/lib/types/sales";

export const ReceiptRepository = {
  async findBySaleId(saleId: string): Promise<ReceiptDTO | null> {
    return queryFirst<ReceiptDTO>(
      "SELECT * FROM Receipt WHERE saleId = ?",
      [saleId]
    );
  },

  async create(data: {
    saleId: string;
    storeName?: string;
    storeCode?: string;
    address?: string;
    phone?: string;
    footer?: string;
    printedAt?: string;
  }): Promise<ReceiptDTO> {
    const id = uuid();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO Receipt (id, saleId, storeName, storeCode, address, phone, footer, printedAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.saleId,
        data.storeName ?? null,
        data.storeCode ?? null,
        data.address ?? null,
        data.phone ?? null,
        data.footer ?? null,
        data.printedAt ?? null,
        now,
      ]
    );
    return queryFirst<ReceiptDTO>(
      "SELECT * FROM Receipt WHERE id = ?",
      [id]
    ) as Promise<ReceiptDTO>;
  },
};

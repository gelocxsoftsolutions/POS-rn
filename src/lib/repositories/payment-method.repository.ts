import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import type { PaymentMethodDTO } from "@/lib/types/sales";

export const PaymentMethodRepository = {
  async findAll(): Promise<PaymentMethodDTO[]> {
    return query<PaymentMethodDTO>(
      "SELECT * FROM PaymentMethod WHERE active = 1 ORDER BY sortOrder ASC, name ASC"
    );
  },

  async findByCode(code: string): Promise<PaymentMethodDTO | null> {
    return queryFirst<PaymentMethodDTO>(
      "SELECT * FROM PaymentMethod WHERE code = ? AND active = 1",
      [code]
    );
  },

  async create(data: {
    code: string;
    name: string;
    type?: string;
    active?: boolean;
    sortOrder?: number;
  }): Promise<PaymentMethodDTO> {
    const id = uuid();
    await execute(
      `INSERT INTO PaymentMethod (id, code, name, type, active, sortOrder)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.code,
        data.name,
        data.type ?? "CASH",
        data.active !== false ? 1 : 0,
        data.sortOrder ?? 0,
      ]
    );
    return queryFirst<PaymentMethodDTO>(
      "SELECT * FROM PaymentMethod WHERE id = ?",
      [id]
    ) as Promise<PaymentMethodDTO>;
  },
};

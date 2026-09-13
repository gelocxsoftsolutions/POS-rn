import { query, queryFirst, execute } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";

export interface ProductImageRow {
  id: string;
  fileName: string | null;
  mimeType: string;
  data: Buffer | null;
  checksum: string | null;
  createdAt: string;
  updatedAt: string;
}

export const ProductImageRepository = {
  async findById(id: string): Promise<ProductImageRow | null> {
    return queryFirst<ProductImageRow>(
      "SELECT * FROM ProductImage WHERE id = ?",
      [id]
    );
  },

  async create(data: {
    fileName?: string;
    mimeType?: string;
    data?: Buffer;
    checksum?: string;
  }): Promise<ProductImageRow> {
    const id = uuid();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO ProductImage (id, fileName, mimeType, data, checksum, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.fileName ?? null,
        data.mimeType ?? "image/jpeg",
        data.data ?? null,
        data.checksum ?? null,
        now,
        now,
      ]
    );
    return queryFirst<ProductImageRow>(
      "SELECT * FROM ProductImage WHERE id = ?",
      [id]
    ) as Promise<ProductImageRow>;
  },
};

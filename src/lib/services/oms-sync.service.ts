import { api, setApiConfig, getApiConfig } from "@/lib/api/http";
import { InventoryRepository } from "@/lib/repositories/inventory.repository";
import { ProductRepository } from "@/lib/repositories/product.repository";
import { TransferRepository } from "@/lib/repositories/transfer.repository";
import { execute, query, queryFirst } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import { DeviceRepository } from "@/lib/repositories/device.repository";
import { BarcodeRepository } from "@/lib/repositories/barcode.repository";

interface VariationDto {
  id: string;
  productId?: string | number;
  productName?: string;
  variationName?: string;
  barcode?: string | null;
  unit?: string | null;
  weight?: number;
  price?: number;
  posPrice?: number;
  imageUrl?: string | null;
  category?: { name: string; color?: string | null } | null;
}

const LEGACY_MOCK_SKUS = [
  "SHR-001", "TUN-001", "SAL-001", "SQU-001", "CRA-001",
  "CHI-001", "POR-001", "MLK-001", "APL-001", "WTR-001",
];

async function findCategoryId(name: string): Promise<string | undefined> {
  const existing = await queryFirst<{ id: string }>(
    "SELECT id FROM Category WHERE name = ?", [name]
  );
  if (existing?.id) return existing.id;
  const created = await execute(
    "INSERT INTO Category (id, name, sortOrder, active, createdAt, updatedAt) VALUES (?, ?, 0, 1, datetime('now'), datetime('now'))",
    [uuid(), name]
  );
  if (!created || !created.lastInsertRowId) {
    return (await queryFirst<{ id: string }>("SELECT id FROM Category WHERE name = ?", [name]))?.id;
  }
  return created.lastInsertRowId.toString();
}

async function findUnitId(name: string): Promise<string | undefined> {
  const existing = await queryFirst<{ id: string }>(
    "SELECT id FROM Unit WHERE name = ?", [name]
  );
  if (existing?.id) return existing.id;
  const created = await execute(
    "INSERT INTO Unit (id, name, active, createdAt, updatedAt) VALUES (?, ?, 1, datetime('now'), datetime('now'))",
    [uuid(), name]
  );
  if (!created || !created.lastInsertRowId) {
    return (await queryFirst<{ id: string }>("SELECT id FROM Unit WHERE name = ?", [name]))?.id;
  }
  return created.lastInsertRowId.toString();
}

interface SyncProduct {
  id?: string;
  sku: string;
}

async function upsertProductFromVariation(
  variation: VariationDto,
  fallbackPosPrice?: number
): Promise<SyncProduct | null> {
  const sku = String(variation.id ?? variation.productId ?? "").trim();
  if (!sku) return null;

  const name = variation.productName || variation.variationName || "Item";

  const categoryId = variation.category?.name
    ? await findCategoryId(variation.category.name)
    : undefined;
  const unitId = variation.unit ? await findUnitId(variation.unit) : undefined;

  const existing = await queryFirst<{ id: string }>(
    "SELECT id FROM Product WHERE sku = ?", [sku]
  );

  let productId: string;
  if (existing?.id) {
    productId = existing.id;
    await ProductRepository.update(productId, {
      name,
      categoryId,
      unitId,
      description: variation.variationName || undefined,
    });
  } else {
    const createResult = await execute(
      `INSERT INTO Product (id, sku, productCode, name, description, categoryId, brandId, unitId, taxGroupId, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, 'ACTIVE', datetime('now'), datetime('now'))`,
      [
        uuid(),
        sku,
        variation.productId !== undefined ? String(variation.productId) : sku,
        name,
        variation.variationName || null,
        categoryId ?? null,
        unitId ?? null,
      ]
    );
    productId = createResult.lastInsertRowId?.toString()
      ?? (await queryFirst<{ id: string }>("SELECT id FROM Product WHERE sku = ?", [sku]))?.id
      ?? "";
  }

  if (!productId) return null;

  const price = Number(fallbackPosPrice ?? variation.posPrice ?? variation.price ?? 0);
  if (price > 0) {
    await execute(
      `INSERT OR REPLACE INTO ProductPrice (id, productId, priceList, price, currency, active, createdAt, updatedAt)
       VALUES (?, ?, 'retail', ?, 'PHP', 1, ?, ?)`,
      [uuid(), productId, price, new Date().toISOString(), new Date().toISOString()]
    );
  }

  if (variation.barcode) {
    await BarcodeRepository.upsert({ productId, barcode: variation.barcode });
  }

  return { id: productId, sku };
}

async function deleteLegacyMockProducts(): Promise<void> {
  const placeholders = LEGACY_MOCK_SKUS.map(() => "?").join(",");
  const skus = LEGACY_MOCK_SKUS;
  await execute(
    `DELETE FROM PosInventory WHERE productId IN (SELECT id FROM Product WHERE sku IN (${placeholders}))`,
    skus
  );
  await execute(
    `DELETE FROM Barcode WHERE productId IN (SELECT id FROM Product WHERE sku IN (${placeholders}))`,
    skus
  );
  await execute(
    `DELETE FROM Product WHERE sku IN (${placeholders})`,
    skus
  );
  const orphanCategories = await query<{ id: string }>(
    "SELECT id FROM Category WHERE name IN ('Seafood','Meat','Produce','Dairy','Beverages') AND id NOT IN (SELECT DISTINCT categoryId FROM Product WHERE categoryId IS NOT NULL)"
  );
  for (const c of orphanCategories) {
    await execute("DELETE FROM Category WHERE id = ?", [c.id]);
  }
}

export const OmsSyncService = {
  async syncInventory(deviceId: string): Promise<{ synced: number }> {
    try {
      const res = await api.get<{ data: Array<{
        groupKey: string;
        qty: number;
        deviceId: string;
        variation: VariationDto;
      }> }>(`/api/pos/inventory?deviceId=${deviceId}`);

      const rows = res.data?.data;
      if (!res.ok || !Array.isArray(rows)) return { synced: 0 };

      let synced = 0;
      for (const item of rows) {
        if (!item.variation) continue;
        const product = await upsertProductFromVariation(item.variation);
        if (!product?.id) continue;

        await InventoryRepository.upsert(product.id, {
          availableQty: Number(item.qty ?? 0),
        });
        synced++;
      }

      return { synced };
    } catch {
      return { synced: 0 };
    }
  },

  async syncBranchProducts(branchId: number): Promise<{ synced: number }> {
    try {
      const res = await api.get<{ data: Array<{
        id: string;
        variationId: string;
        posPrice?: number;
        variation: VariationDto;
      }> }>(`/api/pos/products?branchId=${branchId}`);

      const rows = res.data?.data;
      if (!res.ok || !Array.isArray(rows)) return { synced: 0 };

      let synced = 0;
      for (const item of rows) {
        if (!item.variation) continue;
        const product = await upsertProductFromVariation(item.variation, item.posPrice);
        if (!product?.id) continue;
        synced++;
      }

      if (synced > 0) {
        await deleteLegacyMockProducts();
      }

      return { synced };
    } catch {
      return { synced: 0 };
    }
  },

  async pushSale(sale: {
    receiptNumber: string;
    cashierId?: string;
    cashierName?: string;
    total: number;
    items: Array<{ productId: string; quantity: number; unitPrice: number; lineTotal: number }>;
    payments: Array<{ method: string; amount: number }>;
  }): Promise<boolean> {
    try {
      const res = await api.post("/api/pos/sales", sale);
      return res.ok;
    } catch {
      return false;
    }
  },

  async syncPendingTransfers(deviceId: string): Promise<{ synced: number }> {
    try {
      const res = await api.get<{ data: Array<{
        id: string;
        direction: string;
        variationId?: string;
        qty: number;
        deviceName?: string | null;
        createdAt?: string;
      }> }>(`/api/pos/transfers/pending?deviceId=${deviceId}`);

      const logs = res.data?.data;
      if (!res.ok || !Array.isArray(logs)) return { synced: 0 };

      let synced = 0;
      for (const log of logs) {
        if (!log.variationId) continue;

        const product = await queryFirst<{ id: string }>(
          "SELECT id FROM Product WHERE sku = ?", [String(log.variationId)]
        );
        if (!product) continue;

        const existing = await queryFirst<{ id: string }>(
          "SELECT id FROM InventoryTransfer WHERE transferNumber = ?", [log.id]
        );
        if (existing) continue;

        await TransferRepository.create({
          transferNumber: log.id,
          sourceWarehouse: log.deviceName ?? undefined,
          notes: log.direction === "OUT" ? "Stock transfer out" : "Stock transfer in",
          items: [{ productId: product.id, allocatedQty: Number(log.qty ?? 0) }],
        });
        synced++;
      }

      return { synced };
    } catch {
      return { synced: 0 };
    }
  },

  async connect(url: string, apiKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      const current = getApiConfig();
      const effectiveApiKey = apiKey || current.apiKey;
      console.log("[OmsSync] connect — apiKey:", effectiveApiKey ? "set" : "MISSING", "accessToken:", current.accessToken ? "set" : "MISSING");
      setApiConfig({ baseUrl: url, apiKey: effectiveApiKey, accessToken: current.accessToken });

      const res = await api.get("/api/health");
      if (!res.ok) {
        return { success: false, error: "Server unreachable" };
      }

      try {
        const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
        const updatedConfig = getApiConfig();
        if (updatedConfig.apiKey) {
          await AsyncStorage.setItem("nct-pos-oms", JSON.stringify({
            state: { serverUrl: url, apiKey: updatedConfig.apiKey, accessToken: updatedConfig.accessToken },
            version: 0,
          }));
        }
      } catch { /* non-blocking */ }

      const device = await DeviceRepository.find();
      if (device?.id) {
        await this.syncInventory(device.id);
        if (device.branchId) {
          await this.syncBranchProducts(device.branchId);
        }
        await this.syncPendingTransfers(device.id);
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message ?? "Connection failed" };
    }
  },
};
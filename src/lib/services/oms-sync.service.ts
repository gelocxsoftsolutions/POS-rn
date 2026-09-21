import { api, setApiConfig, getApiConfig } from "@/lib/api/http";
import { InventoryRepository } from "@/lib/repositories/inventory.repository";
import { ProductRepository } from "@/lib/repositories/product.repository";
import { TransferRepository } from "@/lib/repositories/transfer.repository";
import { execute, query, queryFirst } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import { DeviceRepository } from "@/lib/repositories/device.repository";
import { BarcodeRepository } from "@/lib/repositories/barcode.repository";
import { ProductImageRepository } from "@/lib/repositories/product-image.repository";
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

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
  const id = uuid();
  await execute(
    "INSERT INTO Category (id, name, sortOrder, active, createdAt, updatedAt) VALUES (?, ?, 0, 1, datetime('now'), datetime('now'))",
    [id, name]
  );
  return id;
}

async function findUnitId(name: string): Promise<string | undefined> {
  const existing = await queryFirst<{ id: string }>(
    "SELECT id FROM Unit WHERE name = ?", [name]
  );
  if (existing?.id) return existing.id;
  const id = uuid();
  await execute(
    "INSERT INTO Unit (id, name, active, createdAt, updatedAt) VALUES (?, ?, 1, datetime('now'), datetime('now'))",
    [id, name]
  );
  return id;
}

interface SyncProduct {
  id?: string;
  sku: string;
}

async function cacheProductImage(imageId: string, sku: string, imageUrl: string): Promise<string> {
  if (Platform.OS === "web") return imageUrl;

  const existing = await ProductImageRepository.findById(imageId);
  if (existing?.fileName?.startsWith("file:") && existing.checksum === imageUrl) {
    const cached = new File(existing.fileName);
    if (cached.exists) return cached.uri;
  }

  const directory = new Directory(Paths.document, "product-images");
  directory.create({ intermediates: true, idempotent: true });
  const extension = imageUrl.match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/)?.[1]?.toLowerCase() ?? "jpg";
  const safeSku = sku.replace(/[^a-zA-Z0-9_-]/g, "_");
  const destination = new File(directory, `${safeSku}.${extension}`);

  const apiConfig = getApiConfig();
  const headers: Record<string, string> = {};
  if (apiConfig.apiKey) headers["x-pos-key"] = apiConfig.apiKey;
  if (apiConfig.accessToken) headers.Authorization = `Bearer ${apiConfig.accessToken}`;

  try {
    const downloaded = await File.downloadFileAsync(imageUrl, destination, {
      headers,
      idempotent: true,
    });
    return downloaded.uri;
  } catch {
    if (existing?.fileName?.startsWith("file:")) {
      const cached = new File(existing.fileName);
      if (cached.exists) return cached.uri;
    }
    return imageUrl;
  }
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
  const rawImageUrl = variation.imageUrl?.trim();
  const imageUrl = rawImageUrl
    ? (/^https?:\/\//i.test(rawImageUrl)
      ? rawImageUrl
      : `${getApiConfig().baseUrl.replace(/\/$/, "")}/${rawImageUrl.replace(/^\//, "")}`)
    : undefined;
  const imageId = imageUrl ? `oms-variation-${sku}` : undefined;

  if (imageId && imageUrl) {
    const imageLocation = await cacheProductImage(imageId, sku, imageUrl);
    await ProductImageRepository.upsertRemote(imageId, imageLocation, imageUrl);
  }

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
      imageId,
    });
  } else {
    productId = uuid();
    await execute(
      `INSERT INTO Product (id, sku, productCode, name, description, categoryId, brandId, unitId, taxGroupId, status, imageId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, 'ACTIVE', ?, datetime('now'), datetime('now'))`,
      [
        productId,
        sku,
        variation.productId !== undefined ? String(variation.productId) : sku,
        name,
        variation.variationName || null,
        categoryId ?? null,
        unitId ?? null,
        imageId ?? null,
      ]
    );
  }

  if (!productId) return null;

  const price = Number(fallbackPosPrice ?? variation.posPrice ?? variation.price ?? 0);
  if (price > 0) {
    await execute(
      "DELETE FROM ProductPrice WHERE productId = ? AND priceList = 'retail'",
      [productId]
    );
    await execute(
      `INSERT INTO ProductPrice (id, productId, priceList, price, currency, active, createdAt, updatedAt)
       VALUES (?, ?, 'retail', ?, 'PHP', 1, ?, ?)`,
      [uuid(), productId, price, new Date().toISOString(), new Date().toISOString()]
    );
  }

  if (variation.barcode) {
    await BarcodeRepository.upsert({ productId, barcode: variation.barcode, type: "variation" });
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
  // Purge legacy/unmappable sales from SyncQueue to stop 400 loop
  try {
    for (const sku of LEGACY_MOCK_SKUS) {
      await execute(`DELETE FROM SyncQueue WHERE payload LIKE ? AND entityType = 'Sale'`, [`%${sku}%`]);
    }
    const pendingSales = await query<{ id: string; payload: string | null; entityId: string }>(`SELECT id, payload, entityId FROM SyncQueue WHERE entityType = 'Sale' AND status IN ('PENDING','FAILED')`);
    for (const row of pendingSales) {
      try {
        const body = row.payload ? JSON.parse(row.payload) : null;
        if (!body?.items || !Array.isArray(body.items) || body.items.length === 0) {
          await execute(`UPDATE SyncQueue SET status = 'SYNCED', updatedAt = ? WHERE id = ?`, [new Date().toISOString(), row.id]);
          await execute(`UPDATE Sale SET synced = 1 WHERE id = ?`, [row.entityId]);
          continue;
        }
        let mappable = 0;
        for (const it of body.items as Array<{ productId?: string; sku?: string; variationId?: number }>) {
          const pid = (it as any).productId ?? (it as any).sku;
          if (it.variationId && Number.isFinite(Number(it.variationId))) { mappable++; continue; }
          if (!pid) continue;
          const r = await queryFirst<{ sku: string | null }>(`SELECT sku FROM Product WHERE id = ?`, [String(pid)]);
          const sku = r?.sku ?? String(pid);
          const vid = Number(sku);
          if (Number.isFinite(vid) && vid > 0) mappable++;
        }
        if (mappable === 0) {
          console.warn("[OmsSync] Purging unmappable SyncQueue sale", row.id);
          await execute(`UPDATE SyncQueue SET status = 'SYNCED', updatedAt = ? WHERE id = ?`, [new Date().toISOString(), row.id]);
          await execute(`UPDATE Sale SET synced = 1 WHERE id = ?`, [row.entityId]);
        }
      } catch {}
    }
  } catch {}
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

        // Guard: if this product belongs to an IN_TRANSIT transfer, don't apply OMS device stock yet
        // — stock is only added when user confirms via QR checklist (prevents 999/early stock bug).
        try {
          const pending = await queryFirst<{ one: number }>(
            `SELECT 1 as one FROM InventoryTransfer t JOIN InventoryTransferItem iti ON iti.transferId = t.id WHERE t.status = 'IN_TRANSIT' AND iti.productId = ? LIMIT 1`,
            [product.id]
          );
          if (pending) continue;
        } catch {}

        await InventoryRepository.upsert(product.id, {
          availableQty: Number(item.qty ?? 0),
        });
        synced++;
      }

      // Eagerly purge legacy mocks even if inventory sync is empty (device may have no branch)
      try { await deleteLegacyMockProducts(); } catch {}

      return { synced };
    } catch {
      try { await deleteLegacyMockProducts(); } catch {}
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

      await deleteLegacyMockProducts();

      return { synced };
    } catch {
      try { await deleteLegacyMockProducts(); } catch {}
      return { synced: 0 };
    }
  },

  async pushSale(sale: {
    receiptNumber?: string;
    cashierId?: string;
    cashierName?: string;
    cashierUserId?: string;
    paymentMethod?: string;
    total?: number;
    items: Array<{ variationId: number; qty: number }>;
    payments?: Array<{ method: string; amount: number }>;
  }): Promise<boolean> {
    try {
      // Normalize to OMS canonical schema: items[{variationId, qty}], paymentMethod, cashierUserId
      const body: any = {
        items: sale.items,
        paymentMethod: sale.paymentMethod ?? sale.payments?.[0]?.method,
        cashierUserId: sale.cashierUserId ?? sale.cashierId,
      };
      const res = await api.post("/api/pos/sales", body);
      return res.ok;
    } catch {
      return false;
    }
  },

  async syncPendingTransfers(deviceId: string): Promise<{ synced: number }> {
    try {
      // Primary: fetch approved/in-transit inventory_transfers for this device (proper TRF numbers + full items)
      const res = await api.get<{ data: Array<{
        id: number;
        transferNumber: string;
        status: string;
        direction: string;
        createdAt: string;
        approvedAt: string | null;
        notes: string | null;
        items: Array<{
          id: number;
          variationId: number;
          productName: string;
          allocatedQty: number;
          unit: string | null;
          variation: VariationDto | null;
        }>;
      }> }>(`/api/pos/transfers/for-device?deviceId=${deviceId}`);

      const transfers = res.data?.data;
      if (res.ok && Array.isArray(transfers) && transfers.length > 0) {
        let synced = 0;
        for (const t of transfers) {
          const existing = await queryFirst<{ id: string }>(
            "SELECT id FROM InventoryTransfer WHERE transferNumber = ?", [t.transferNumber]
          );

          const items: Array<{ productId: string; allocatedQty: number; unit?: string }> = [];
          for (const it of t.items ?? []) {
            let product: { id: string } | null = null;
            if ((it as any).variation) {
              const up = await upsertProductFromVariation((it as any).variation as VariationDto);
              if (up?.id) product = { id: up.id };
            }
            if (!product) {
              product = await queryFirst<{ id: string }>(
                "SELECT id FROM Product WHERE sku = ?", [String(it.variationId)]
              );
            }
            if (!product) continue;
            items.push({ productId: product.id, allocatedQty: Number(it.allocatedQty ?? 0), unit: it.unit ?? undefined });
          }
          if (existing) continue;
          if (items.length === 0) continue;

          await TransferRepository.create({
            transferNumber: t.transferNumber,
            sourceWarehouse: "OMS Warehouse",
            destinationPos: undefined,
            notes: t.notes ?? t.direction,
            status: "IN_TRANSIT",
            items,
          });
          synced++;
        }
        return { synced };
      }

      // Fallback: legacy pending logs (creates synthetic IN_TRANSIT records, no inventory touch)
      const fallback = await api.get<{ data: Array<{
        id: string;
        direction: string;
        variationId?: string;
        qty: number;
        deviceName?: string | null;
        variation?: VariationDto | null;
      }> }>(`/api/pos/transfers/pending?deviceId=${deviceId}`);
      const logs = fallback.data?.data;
      if (!fallback.ok || !Array.isArray(logs)) return { synced: 0 };
      let synced = 0;
      for (const log of logs) {
        if (!log.variationId) continue;
        let product: { id: string } | null = null;
        if ((log as any).variation) {
          const up = await upsertProductFromVariation((log as any).variation as VariationDto);
          if (up?.id) product = { id: up.id };
        }
        if (!product) {
          product = await queryFirst<{ id: string }>(
            "SELECT id FROM Product WHERE sku = ?", [String(log.variationId)]
          );
        }
        if (!product) continue;
        const existing = await queryFirst<{ id: string }>(
          "SELECT id FROM InventoryTransfer WHERE transferNumber = ?", [String(log.id)]
        );
        if (existing) continue;
        await TransferRepository.create({
          transferNumber: String(log.id),
          sourceWarehouse: log.deviceName ?? undefined,
          notes: log.direction,
          status: "IN_TRANSIT",
          items: [{ productId: product.id, allocatedQty: Number(log.qty ?? 0) }],
        });
        synced++;
      }
      return { synced };
    } catch {
      return { synced: 0 };
    }
  },

  async connect(url: string, apiKey: string): Promise<{ success: boolean; error?: string; synced?: { inventory: number; products: number; transfers: number } }> {
    try {
      const current = getApiConfig();
      const effectiveApiKey = apiKey || current.apiKey;
      console.log("[OmsSync] connect — apiKey:", effectiveApiKey ? "set" : "MISSING", "accessToken:", current.accessToken ? "set" : "MISSING");
      setApiConfig({ baseUrl: url, apiKey: effectiveApiKey, accessToken: current.accessToken });

      // Use authenticated POS health — /api/health is always 200 and gives false positives
      const health = await api.get<{ ok?: boolean; message?: string }>("/api/pos/health");
      if (!health.ok) {
        const msg = (health.error as any)?.error ?? (health.error as any)?.message ?? `OMS auth failed (HTTP ${health.status})`;
        if (health.status === 401) return { success: false, error: "Invalid API key" };
        if (health.status === 0) return { success: false, error: "Server unreachable" };
        return { success: false, error: msg };
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

      let inv = 0, prod = 0, tr = 0;
      let device = await DeviceRepository.find();
      // Remediation: local Device.id was previously random UUID, must match OMS deviceId (store deviceId)
      try {
        const { useDeviceStore } = await import("@/lib/stores/device-store");
        const storeDeviceId = useDeviceStore.getState().device?.deviceId;
        if (storeDeviceId && device?.id && device.id !== storeDeviceId) {
          console.log("[OmsSync] fixing device id mismatch", device.id, "->", storeDeviceId);
          await execute("UPDATE Device SET id = ? WHERE id = ?", [storeDeviceId, device.id]);
          device.id = storeDeviceId;
        }
      } catch {}
      if (device?.id) {
        inv = (await this.syncInventory(device.id)).synced;
        if (device.branchId) {
          prod = (await this.syncBranchProducts(device.branchId)).synced;
        }
        tr = (await this.syncPendingTransfers(device.id)).synced;
      } else {
        // No device yet — still purge mocks
        try { await deleteLegacyMockProducts(); } catch {}
      }

      return { success: true, synced: { inventory: inv, products: prod, transfers: tr } };
    } catch (e: any) {
      return { success: false, error: e.message ?? "Connection failed" };
    }
  },
};

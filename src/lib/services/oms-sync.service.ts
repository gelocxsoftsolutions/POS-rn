import { api, setApiConfig, getApiConfig } from "@/lib/api/http";
import { InventoryRepository } from "@/lib/repositories/inventory.repository";
import { ProductRepository } from "@/lib/repositories/product.repository";
import { TransferRepository } from "@/lib/repositories/transfer.repository";
import { execute, query, queryFirst } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import { DeviceRepository } from "@/lib/repositories/device.repository";
import { BarcodeRepository } from "@/lib/repositories/barcode.repository";
import { ProductImageRepository } from "@/lib/repositories/product-image.repository";
import { ProductPriceRepository } from "@/lib/repositories/product-price.repository";
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
  price?: number | string;
  posPrice?: number | string;
  priceForCustomer?: number | string;
  customerPrice?: number | string;
  retailPrice?: number | string;
  sellingPrice?: number | string;
  pricing?: Record<string, unknown> | null;
  prices?: Array<Record<string, unknown>> | null;
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

export interface SalePushResult {
  success: boolean;
  status: number;
  error?: string;
  retryable: boolean;
}

function parsePrice(value: unknown): number | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return parsePrice(record.amount ?? record.value ?? record.price);
  }
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const normalized = typeof value === "string"
    ? value.replace(/,/g, "").replace(/[^0-9.-]/g, "").trim()
    : value;
  if (normalized === "") return undefined;
  const price = Number(normalized);
  return Number.isFinite(price) && price >= 0 ? price : undefined;
}

function findLabeledCustomerPrice(prices: unknown): number | undefined {
  if (!Array.isArray(prices)) return undefined;
  for (const entry of prices) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const label = String(
      record.name ?? record.label ?? record.type ?? record.priceList ?? record.code ?? ""
    ).toLowerCase();
    if (!/(customer|retail|selling|pos)/.test(label)) continue;
    const price = parsePrice(record.price ?? record.amount ?? record.value);
    if (price !== undefined) return price;
  }
  return undefined;
}

function resolveCustomerPrice(variation: VariationDto, assignment?: unknown): number | undefined {
  const outer = assignment && typeof assignment === "object"
    ? assignment as Record<string, unknown>
    : {};
  const variationRecord = variation as unknown as Record<string, unknown>;
  const pricing = variation.pricing && typeof variation.pricing === "object"
    ? variation.pricing
    : {};

  const candidates = [
    outer.priceForCustomer,
    outer.price_for_customer,
    variation.priceForCustomer,
    variationRecord.price_for_customer,
    pricing.priceForCustomer,
    pricing.price_for_customer,
    outer.customerPrice,
    outer.customer_price,
    variation.customerPrice,
    variationRecord.customer_price,
    pricing.customerPrice,
    pricing.customer_price,
    outer.retailPrice,
    outer.retail_price,
    variation.retailPrice,
    variationRecord.retail_price,
    pricing.retailPrice,
    pricing.retail_price,
    outer.sellingPrice,
    outer.selling_price,
    variation.sellingPrice,
    variationRecord.selling_price,
    pricing.sellingPrice,
    pricing.selling_price,
    findLabeledCustomerPrice(outer.prices),
    findLabeledCustomerPrice(variation.prices),
    outer.posPrice,
    outer.pos_price,
    variation.posPrice,
    variationRecord.pos_price,
    pricing.posPrice,
    pricing.pos_price,
    outer.price,
    variation.price,
  ];

  for (const candidate of candidates) {
    const price = parsePrice(candidate);
    if (price !== undefined) return price;
  }
  return undefined;
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
  priceAssignment?: unknown
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

  const price = resolveCustomerPrice(variation, priceAssignment);
  if (price !== undefined) {
    await ProductPriceRepository.upsert({
      productId,
      priceList: "retail",
      price,
      currency: "PHP",
    });
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

        // Sales and received transfers are applied locally and recorded with an
        // exact resulting balance. Once a product has local movements, that
        // ledger balance is authoritative for this POS device; an older OMS
        // snapshot must not restore stock that was already sold.
        const localMovements = await queryFirst<{ movementCount: number; localBalance: number }>(
          `SELECT
             COUNT(*) as movementCount,
             COALESCE((
               SELECT firstMovement.balanceBefore
               FROM InventoryLedger firstMovement
               WHERE firstMovement.productId = ?
               ORDER BY firstMovement.createdAt ASC, firstMovement.rowid ASC
               LIMIT 1
             ), 0) + COALESCE(SUM(quantity), 0) as localBalance
           FROM InventoryLedger
           WHERE productId = ?`,
          [product.id, product.id]
        );
        if (Number(localMovements?.movementCount ?? 0) > 0) {
          await InventoryRepository.setQuantity(
            product.id,
            Math.max(0, Number(localMovements?.localBalance ?? 0))
          );
          synced++;
          continue;
        }

        // Compatibility for sales created before inventory ledger entries were
        // enforced: keep any still-unsynced quantities deducted from OMS stock.
        const pendingSales = await queryFirst<{ qty: number }>(
          `SELECT COALESCE(SUM(si.quantity), 0) as qty
           FROM SaleItem si
           INNER JOIN Sale s ON s.id = si.saleId
           WHERE si.productId = ?
             AND s.status = 'COMPLETED'
             AND s.synced = 0`,
          [product.id]
        );
        const availableQty = Math.max(
          0,
          Number(item.qty ?? 0) - Number(pendingSales?.qty ?? 0)
        );

        await InventoryRepository.upsert(product.id, { availableQty });
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
        const product = await upsertProductFromVariation(item.variation, item);
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
  }): Promise<SalePushResult> {
    try {
      // Normalize to OMS canonical schema: items[{variationId, qty}], paymentMethod, cashierUserId
      const body: any = {
        items: sale.items,
        paymentMethod: sale.paymentMethod ?? sale.payments?.[0]?.method,
        cashierUserId: sale.cashierUserId ?? sale.cashierId,
      };
      const res = await api.post("/api/pos/sales", body);
      if (res.ok) {
        return { success: true, status: res.status, retryable: false };
      }
      const error = String(
        (res.error as any)?.error ?? (res.error as any)?.message ?? `HTTP ${res.status}`
      );
      const retryable = res.status === 0 || res.status === 408 || res.status === 429 || res.status >= 500;
      return { success: false, status: res.status, error, retryable };
    } catch (error: any) {
      return { success: false, status: 0, error: error?.message ?? "Network error", retryable: true };
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
      if (res.ok && Array.isArray(transfers)) {
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

        // Numeric transfer numbers were created by the legacy endpoint from its
        // row ID (for example "16") rather than the canonical TRF number.
        // Clean them only after canonical rows have been safely processed.
        await TransferRepository.removeLegacyNumericPending();
        return { synced };
      }

      // Fallback only when the modern endpoint is unavailable or malformed.
      // Legacy pending logs create synthetic IN_TRANSIT records with numeric IDs.
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

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
import { BusinessConfigurationService } from "@/lib/business/configuration.service";

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
  saleId?: number;
  receiptNumber?: string;
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

  // OMS stores pos_price defaulting to 0.00 — a zero posPrice is NOT a real
  // price and must not shadow the variation's actual price. Prefer the first
  // strictly positive candidate; only fall back to 0 when nothing positive
  // exists (genuinely free item).
  let zeroFallback: number | undefined;
  for (const candidate of candidates) {
    const price = parsePrice(candidate);
    if (price !== undefined && price > 0) return price;
    if (zeroFallback === undefined && price !== undefined) zeroFallback = price;
  }
  return zeroFallback;
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
  priceAssignment?: unknown,
  inventoryGroupKey?: string
): Promise<SyncProduct | null> {
  const sku = String(variation.id ?? variation.productId ?? "").trim();
  if (!sku) return null;

  const name = variation.productName || variation.variationName || "Item";
  const productCode = String(inventoryGroupKey ?? variation.productId ?? sku).trim();

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

  const rawWeight = (variation as any).weight ?? (variation as any).netWeight ?? (variation as any).grossWeight;
  const weight = rawWeight != null && String(rawWeight).trim() !== "" ? Number(String(rawWeight).replace(/[^0-9.-]/g, "")) : null;
  const parsedWeight = weight != null && Number.isFinite(weight) && weight >= 0 ? weight : null;
  const businessId = BusinessConfigurationService.current().businessId;

  const existing = await queryFirst<{ id: string }>(
    `SELECT id FROM Product
     WHERE businessId = ? AND identitySource = 'NCT'
       AND (omsVariationId = ? OR sku = ?)
     LIMIT 1`, [businessId, sku, sku]
  );

  let productId: string;
  if (existing?.id) {
    productId = existing.id;
    await ProductRepository.update(productId, {
      productCode,
      name,
      categoryId,
      unitId,
      description: variation.variationName || undefined,
      imageId,
      weight: parsedWeight,
    });
    await execute(
      "UPDATE Product SET businessId = ?, identitySource = 'NCT', omsVariationId = ? WHERE id = ?",
      [businessId, sku, productId]
    );
  } else {
    productId = uuid();
    await execute(
      `INSERT INTO Product (id, sku, productCode, name, description, categoryId, brandId, unitId, weight, taxGroupId, status, imageId, businessId, identitySource, omsVariationId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, 'ACTIVE', ?, ?, 'NCT', ?, datetime('now'), datetime('now'))`,
      [
        productId,
        sku,
        productCode,
        name,
        variation.variationName || null,
        categoryId ?? null,
        unitId ?? null,
        parsedWeight,
        imageId ?? null,
        businessId,
        sku,
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
  // Flag legacy/unmappable queued sales as FAILED (never silently mark them Synced)
  try {
    for (const sku of LEGACY_MOCK_SKUS) {
      await execute(
        `UPDATE SyncQueue
         SET status = 'FAILED', error = ?, retryCount = maxRetries, updatedAt = ?
         WHERE entityType = 'Sale' AND status <> 'SYNCED' AND payload LIKE ?`,
        [`Legacy mock SKU ${sku} is not linked to an OMS variation`, new Date().toISOString(), `%${sku}%`]
      );
    }
    const pendingSales = await query<{ id: string; payload: string | null; entityId: string }>(`SELECT id, payload, entityId FROM SyncQueue WHERE entityType = 'Sale' AND status IN ('PENDING','FAILED')`);
    for (const row of pendingSales) {
      try {
        const body = row.payload ? JSON.parse(row.payload) : null;
        if (!body?.items || !Array.isArray(body.items) || body.items.length === 0) {
          await execute(
            `UPDATE SyncQueue SET status = 'FAILED', error = ?, retryCount = maxRetries, updatedAt = ? WHERE id = ?`,
            ["Sale has no items linked to OMS variations", new Date().toISOString(), row.id]
          );
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
          console.warn("[OmsSync] Sale", row.entityId, "has no items linked to OMS variations");
          await execute(
            `UPDATE SyncQueue SET status = 'FAILED', error = ?, retryCount = maxRetries, updatedAt = ? WHERE id = ?`,
            ["No items linked to OMS variations", new Date().toISOString(), row.id]
          );
        }
      } catch {}
    }
  } catch {}
}

export const OmsSyncService = {
  async syncInventory(deviceId: string): Promise<{ synced: number }> {
    if (!BusinessConfigurationService.capabilities().importNctCatalog) return { synced: 0 };
    try {
      const res = await api.get<{ data: Array<{
        groupKey: string;
        qty: number;
        deviceId: string;
        variation: VariationDto;
      }> }>(`/api/pos/inventory?deviceId=${deviceId}`);

      const inventoryPayload = res.data as any;
      const rows = Array.isArray(inventoryPayload)
        ? inventoryPayload
        : inventoryPayload?.data ?? inventoryPayload?.items ?? inventoryPayload?.inventory;
      if (!res.ok || !Array.isArray(rows)) return { synced: 0 };

      let synced = 0;
      const syncedVariationSkus = new Set<string>();
      for (const item of rows) {
        if (!item.variation) continue;
        const product = await upsertProductFromVariation(item.variation, item, item.groupKey);
        if (!product?.id) continue;
        syncedVariationSkus.add(String(item.variation.id));

        // Guard: if this product belongs to an IN_TRANSIT transfer, don't apply OMS device stock yet
        // — stock is only added when user confirms via QR checklist (prevents 999/early stock bug).
        try {
          const pending = await queryFirst<{ one: number }>(
            `SELECT 1 as one FROM InventoryTransfer t JOIN InventoryTransferItem iti ON iti.transferId = t.id WHERE t.status = 'IN_TRANSIT' AND iti.productId = ? LIMIT 1`,
            [product.id]
          );
          if (pending) continue;
        } catch {}

        // OMS is the canonical stock baseline. Preserve only completed sales
        // that have not reached OMS yet so offline checkout remains accurate.
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

      // The inventory endpoint can omit zero-balance variations. Reset those
      // OMS-linked products so stale transfer/ledger quantities cannot be sold
      // locally and then rejected by the sales endpoint.
      const localOmsProducts = await query<{ id: string; sku: string; pendingQty: number }>(
        `SELECT p.id, p.sku,
                COALESCE((
                  SELECT SUM(si.quantity)
                  FROM SaleItem si
                  INNER JOIN Sale s ON s.id = si.saleId
                  WHERE si.productId = p.id
                    AND s.status = 'COMPLETED'
                    AND s.synced = 0
                ), 0) as pendingQty
         FROM Product p
         INNER JOIN PosInventory pi ON pi.productId = p.id
         WHERE p.sku IS NOT NULL
           AND p.sku <> ''
           AND p.sku NOT GLOB '*[^0-9]*'
           AND NOT EXISTS (
             SELECT 1
             FROM InventoryTransfer t
             INNER JOIN InventoryTransferItem iti ON iti.transferId = t.id
             WHERE t.status = 'IN_TRANSIT' AND iti.productId = p.id
           )`
      );
      for (const product of localOmsProducts) {
        if (syncedVariationSkus.has(String(product.sku))) continue;
        await InventoryRepository.setQuantity(product.id, 0);
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
    if (!BusinessConfigurationService.capabilities().importNctCatalog) return { synced: 0 };
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
    deviceId?: string | null;
    branchId?: number | null;
  }): Promise<SalePushResult> {
    return { success: false, status: 403, retryable: false, error: "Dealership sales remain local and are included in cloud database backups." };
  },

  async syncPendingTransfers(deviceId: string): Promise<{ synced: number }> {
    if (!BusinessConfigurationService.capabilities().receiveNctTransfers) return { synced: 0 };
    try {
      // Repair transfers received by older OMS builds that marked the transfer
      // complete without crediting the destination device's inventory bucket.
      // Only probe when a locally RECEIVED transfer exists: otherwise this is
      // just 400 noise every sync cycle on servers without reconcile support.
      let needsReconcile = true;
      try {
        const row = await queryFirst<{ c: number }>(
          `SELECT COUNT(*) as c FROM InventoryTransfer WHERE status = 'RECEIVED'`
        );
        needsReconcile = (row?.c ?? 0) > 0;
      } catch {
        needsReconcile = true;
      }
      if (needsReconcile) {
        console.log("[OmsSync] transfer reconcile check", { deviceId });
        const reconciliation = await api.post<{
          success?: boolean;
          creditedQty?: number;
          reconciled?: number;
        }>("/api/pos/transfers/receive", { deviceId, reconcile: true });
        if (
          reconciliation.ok &&
          Number(reconciliation.data?.creditedQty ?? 0) > 0
        ) {
          await this.syncInventory(deviceId);
        }
      }

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
          const existing = await queryFirst<{ id: string; status: string }>(
            "SELECT id, status FROM InventoryTransfer WHERE transferNumber = ?", [t.transferNumber]
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
          if (existing) {
            // Repair transfers received by older builds that updated local
            // stock before the OMS confirmation request completed.
            if (existing.status === "RECEIVED" && !["RECEIVED", "COMPLETED"].includes(String(t.status).toUpperCase())) {
              const confirmation = await api.post<{ success?: boolean }>(
                "/api/pos/transfers/receive",
                { transferId: t.id, deviceId }
              );
              if (confirmation.ok && (confirmation.data as any)?.success !== false) {
                await this.syncInventory(deviceId);
              }
            }
            continue;
          }
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
        const AsyncStorage = (await import("@/lib/storage/app-storage")).default;
        const updatedConfig = getApiConfig();
        if (updatedConfig.apiKey) {
          await AsyncStorage.setItem("nct-pos-oms", JSON.stringify({
            state: { serverUrl: url, apiKey: updatedConfig.apiKey, accessToken: updatedConfig.accessToken },
            version: 0,
          }));
        }
      } catch { /* non-blocking */ }

      let inv = 0, prod = 0, tr = 0;
      // Independent OMS connections are only for queued EOD and backup
      // delivery. They must never import NCT catalog, stock, or transfers.
      if (BusinessConfigurationService.capabilities().importNctCatalog) {
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

      }
      return { success: true, synced: { inventory: inv, products: prod, transfers: tr } };
    } catch (e: any) {
      return { success: false, error: e.message ?? "Connection failed" };
    }
  },
};

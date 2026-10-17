import { v4 as uuid } from "uuid";
import { execute, query, queryFirst } from "@/lib/db/connection";
import { ProductRepository } from "@/lib/repositories/product.repository";
import { ProductPriceRepository } from "@/lib/repositories/product-price.repository";
import { ProductImageRepository } from "@/lib/repositories/product-image.repository";
import { InventoryRepository } from "@/lib/repositories/inventory.repository";
import { InventoryLedgerRepository } from "@/lib/repositories/inventory-ledger.repository";
import { BarcodeRepository } from "@/lib/repositories/barcode.repository";
import { BusinessConfigurationService } from "./configuration.service";
import { assertCapability } from "./capabilities";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { PermissionService } from "@/lib/services/permission.service";
import { SUPER_ADMIN_ID } from "@/lib/services/cashier.service";
import type { ProductDTO } from "@/lib/types/inventory";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_PROOF_BYTES = 20 * 1024 * 1024;
const LOSS_CATEGORIES = ["EXPIRED", "DAMAGED", "SPOILED", "MISSING", "QUALITY_REJECTION", "INTERNAL_USE", "OTHER"] as const;
export type LossCategory = typeof LOSS_CATEGORIES[number];
export type IndependentStockMovement = "RECEIVING" | "ADJUSTMENT" | "LOSS";

export interface ProductActionHistoryRow {
  id: string;
  businessId: string;
  productId: string | null;
  productCode: string | null;
  action: string;
  reasonCategory: string | null;
  reason: string;
  proofImageDataUri: string;
  quantity: number | null;
  balanceBefore: number | null;
  balanceAfter: number | null;
  beforeJson: string | null;
  afterJson: string | null;
  createdById: string | null;
  createdByName: string | null;
  deviceId: string | null;
  createdAt: string;
}

export interface IndependentVariationDraft {
  id?: string;
  variationName: string;
  price: number;
  stock?: number;
}

export interface CreateIndependentProductInput {
  productName: string;
  imageDataUri?: string | null;
  variations: IndependentVariationDraft[];
  createdById?: string;
  createdByName?: string;
}

export interface CreateIndependentVariationInput {
  productName: string;
  variationName?: string;
  price: number;
  openingStock?: number;
  createdById?: string;
  createdByName?: string;
  imageDataUri?: string | null;
}

function compactNamespace(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(6, "0").slice(-6);
}

async function nextBarcodeIdentifier(businessId: string, deviceId: string): Promise<string> {
  await execute("INSERT OR IGNORE INTO BarcodeNamespace (businessId, deviceId, nextSequence) VALUES (?, ?, 1)", [businessId, deviceId]);
  const row = await queryFirst<{ nextSequence: number }>("SELECT nextSequence FROM BarcodeNamespace WHERE businessId = ? AND deviceId = ?", [businessId, deviceId]);
  const sequence = Math.max(1, Number(row?.nextSequence ?? 1));
  await execute("UPDATE BarcodeNamespace SET nextSequence = ? WHERE businessId = ? AND deviceId = ?", [sequence + 1, businessId, deviceId]);
  return `D${compactNamespace(businessId).slice(0, 4)}${compactNamespace(deviceId).slice(0, 4)}${sequence.toString(36).toUpperCase().padStart(4, "0").slice(-4)}`;
}

async function reserveBarcode(businessId: string, deviceId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = await nextBarcodeIdentifier(businessId, deviceId);
    if (!(await queryFirst<{ id: string }>("SELECT id FROM Barcode WHERE barcode = ?", [candidate]))) return candidate;
  }
  throw new Error("Unable to reserve a unique variation barcode. Try again.");
}

function requireIndependent(capability: "manageLocalCatalog" | "manageLocalInventory") {
  assertCapability(BusinessConfigurationService.current().operatingMode, capability);
}

async function requireAuthorizedUser(permission: "POS_PRODUCTS" | "POS_INVENTORY") {
  const session = useCashierStore.getState().session;
  if (!session) throw new Error("Sign in before changing dealership catalog or stock.");
  if (session.isSuperAdmin) return;
  if (!session.roleId || !(await PermissionService.hasPermission(session.roleId, permission, session.cashierId))) throw new Error("Your account is not authorized for this operation.");
}

function validateImage(dataUri: string | null | undefined, label: string): string {
  if (!dataUri || !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(dataUri)) throw new Error(`${label} is required and must be a JPEG, PNG, or WebP image.`);
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
  if (Math.ceil(base64.length * 0.75) > MAX_IMAGE_BYTES) throw new Error(`${label} must be 4 MB or smaller.`);
  return dataUri;
}

function validateProofMedia(dataUri: string | null | undefined, label: string): string {
  if (!dataUri || !/^data:(image\/(jpeg|jpg|png|webp)|video\/(mp4|quicktime));base64,/i.test(dataUri)) throw new Error(`${label} is required and must be a captured photo or video.`);
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
  if (Math.ceil(base64.length * 0.75) > MAX_PROOF_BYTES) throw new Error(`${label} must be 20 MB or smaller.`);
  return dataUri;
}

function validateVariations(variations: IndependentVariationDraft[]) {
  if (variations.length === 0) throw new Error("Add at least one variation.");
  const names = new Set<string>();
  for (const variation of variations) {
    const name = variation.variationName.trim();
    if (!name) throw new Error("Every variation needs a name.");
    const key = name.toLowerCase();
    if (names.has(key)) throw new Error(`Variation name “${name}” is duplicated.`);
    names.add(key);
    if (!Number.isFinite(variation.price) || variation.price < 0) throw new Error(`Enter a valid price for ${name}.`);
    if (variation.stock !== undefined && (!Number.isFinite(variation.stock) || variation.stock < 0)) throw new Error(`Enter a valid stock quantity for ${name}.`);
  }
}

async function findGroup(productId: string): Promise<ProductDTO[]> {
  const anchor = await ProductRepository.findById(productId);
  if (!anchor) return [];
  const rows = anchor.productCode ? await query<{ id: string }>("SELECT id FROM Product WHERE productCode = ? AND status = 'ACTIVE' ORDER BY createdAt", [anchor.productCode]) : [{ id: productId }];
  const products = await Promise.all(rows.map((row) => ProductRepository.findById(row.id)));
  return products.filter((product): product is ProductDTO => Boolean(product));
}

function auditSnapshot(group: ProductDTO[]) {
  return group.map((item) => ({
    id: item.id,
    productCode: item.productCode,
    name: item.name,
    variationName: item.description,
    sku: item.sku,
    price: item.retailPrice,
    availableQty: item.availableQty ?? 0,
    status: item.status,
    imageId: item.imageId,
  }));
}

async function auditAction(input: {
  productId?: string; productCode?: string | null; action: string; reasonCategory?: string;
  reason: string; proofImageDataUri: string; quantity?: number; balanceBefore?: number;
  balanceAfter?: number; before?: unknown; after?: unknown;
}) {
  const business = BusinessConfigurationService.current();
  const session = useCashierStore.getState().session;
  const deviceId = useDeviceStore.getState().device.deviceId;
  const auditId = uuid();
  await execute(
    `INSERT INTO ProductActionAudit
     (id, businessId, productId, productCode, action, reasonCategory, reason,
      proofImageDataUri, quantity, balanceBefore, balanceAfter, beforeJson, afterJson,
      createdById, createdByName, deviceId, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [auditId, business.businessId, input.productId ?? null, input.productCode ?? null,
      input.action, input.reasonCategory ?? null, input.reason.trim(), input.proofImageDataUri,
      input.quantity ?? null, input.balanceBefore ?? null, input.balanceAfter ?? null,
      input.before === undefined ? null : JSON.stringify(input.before), input.after === undefined ? null : JSON.stringify(input.after),
      session?.cashierId ?? null, session?.cashierName ?? null, deviceId ?? null, new Date().toISOString()]
  );
  await execute(
    `INSERT INTO AuditLog
     (id, eventType, description, cashierId, cashierName, roleId, metadata, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), input.action, input.reason.trim(), session?.cashierId ?? null,
      session?.cashierName ?? null, session?.roleId ?? null,
      JSON.stringify({ productActionAuditId: auditId, businessId: business.businessId,
        productId: input.productId ?? null, productCode: input.productCode ?? null,
        reasonCategory: input.reasonCategory ?? null, quantity: input.quantity ?? null,
        balanceBefore: input.balanceBefore ?? null, balanceAfter: input.balanceAfter ?? null,
        proofType: input.proofImageDataUri.startsWith("data:video/") ? "video" : "photo" }),
      new Date().toISOString()]
  );
}

async function createImage(dataUri?: string | null): Promise<string | null> {
  if (!dataUri) return null;
  validateImage(dataUri, "Product photo");
  const mimeType = dataUri.slice(5, dataUri.indexOf(";"));
  return (await ProductImageRepository.create({ fileName: dataUri, mimeType })).id;
}

async function insertVariation(input: {
  groupCode: string; productName: string; variation: IndependentVariationDraft;
  imageId: string | null; businessId: string; deviceId: string;
  createdById?: string; createdByName?: string;
}) {
  const productId = uuid();
  const barcode = await reserveBarcode(input.businessId, input.deviceId);
  const now = new Date().toISOString();
  await execute(
    `INSERT INTO Product
     (id, sku, productCode, name, description, status, imageId, businessId, identitySource, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, 'INDEPENDENT', ?, ?)`,
    [productId, barcode, input.groupCode, input.productName.trim(), input.variation.variationName.trim(), input.imageId, input.businessId, now, now]
  );
  await ProductPriceRepository.upsert({ productId, price: input.variation.price, currency: "PHP" });
  await BarcodeRepository.upsert({ productId, barcode, type: "code128" });
  const startingStock = Number(input.variation.stock ?? 0);
  await InventoryRepository.upsert(productId, { availableQty: startingStock, adjustmentQty: startingStock, minimumStock: 0 });
  if (startingStock > 0) {
    await InventoryLedgerRepository.create({
      movementType: "INITIAL_STOCK", referenceNumber: `INITIAL-${productId}`, productId,
      quantity: startingStock, balanceBefore: 0, balanceAfter: startingStock,
      notes: "Optional stock entered when the variation was created",
      createdById: input.createdById, createdByName: input.createdByName,
    });
  }
  return { productId, barcode };
}

export const IndependentCatalogService = {
  async getProductGroup(productId: string) { return findGroup(productId); },

  async getProductHistory(productId: string): Promise<ProductActionHistoryRow[]> {
    const product = await ProductRepository.findById(productId);
    if (!product) return [];
    return query<ProductActionHistoryRow>(
      `SELECT id, businessId, productId, productCode, action, reasonCategory, reason,
              proofImageDataUri, quantity, balanceBefore, balanceAfter, beforeJson,
              afterJson, createdById, createdByName, deviceId, createdAt
       FROM ProductActionAudit
       WHERE productId = ? OR (productCode IS NOT NULL AND productCode = ?)
       ORDER BY createdAt DESC`,
      [productId, product.productCode]
    );
  },

  async createProduct(input: CreateIndependentProductInput) {
    requireIndependent("manageLocalCatalog");
    await requireAuthorizedUser("POS_PRODUCTS");
    if (!input.productName.trim()) throw new Error("Product name is required.");
    validateVariations(input.variations);
    const business = BusinessConfigurationService.current();
    const deviceId = useDeviceStore.getState().device.deviceId;
    if (!deviceId) throw new Error("This local terminal must be set up before creating barcodes.");
    await execute("BEGIN IMMEDIATE");
    try {
      const imageId = await createImage(input.imageDataUri);
      const groupCode = uuid();
      const created = [];
      for (const variation of input.variations) created.push(await insertVariation({ groupCode, productName: input.productName, variation, imageId, businessId: business.businessId, deviceId, createdById: input.createdById, createdByName: input.createdByName }));
      await execute("COMMIT");
      return { groupCode, variations: created };
    } catch (error) { await execute("ROLLBACK"); throw error; }
  },

  async createVariation(input: CreateIndependentVariationInput) {
    const result = await this.createProduct({ productName: input.productName, imageDataUri: input.imageDataUri, variations: [{ variationName: input.variationName?.trim() || "Standard", price: input.price, stock: input.openingStock }], createdById: input.createdById, createdByName: input.createdByName });
    return { product: await ProductRepository.findById(result.variations[0].productId), barcode: result.variations[0].barcode, symbology: "CODE_128" as const };
  },

  async updateProduct(input: { productId: string; productName: string; imageDataUri?: string | null; variations: IndependentVariationDraft[]; reason: string; proofImageDataUri: string }) {
    requireIndependent("manageLocalCatalog");
    await requireAuthorizedUser("POS_PRODUCTS");
    if (!input.productName.trim()) throw new Error("Product name is required.");
    if (!input.reason.trim()) throw new Error("A reason is required for product changes.");
    const proof = validateProofMedia(input.proofImageDataUri, "Proof media");
    validateVariations(input.variations);
    const before = await findGroup(input.productId);
    const business = BusinessConfigurationService.current();
    if (!before.length || before.some((item) => item.identitySource !== "INDEPENDENT" || item.businessId !== business.businessId)) throw new Error("Only this dealership's independent products can be edited locally.");
    const deviceId = useDeviceStore.getState().device.deviceId;
    if (!deviceId) throw new Error("Local terminal identity is unavailable.");
    const groupCode = before[0].productCode || before[0].id;
    const existingIds = new Set(before.map((item) => item.id));
    for (const variation of input.variations) if (variation.id && !existingIds.has(variation.id)) throw new Error("A variation does not belong to this product.");
    const retainedIds = new Set(input.variations.flatMap((item) => item.id ? [item.id] : []));
    const removed = before.filter((item) => !retainedIds.has(item.id));
    const addedCount = input.variations.filter((item) => !item.id).length;
    if (removed.some((item) => Number(item.availableQty ?? 0) !== 0)) throw new Error("A variation with stock cannot be removed. Record or transfer its remaining stock first.");
    await execute("BEGIN IMMEDIATE");
    try {
      const imageId = input.imageDataUri ? await createImage(input.imageDataUri) : before[0].imageId;
      const now = new Date().toISOString();
      for (const variation of input.variations) {
        if (variation.id) {
          await execute("UPDATE Product SET name = ?, description = ?, imageId = ?, updatedAt = ? WHERE id = ?", [input.productName.trim(), variation.variationName.trim(), imageId, now, variation.id]);
          await ProductPriceRepository.upsert({ productId: variation.id, price: variation.price, currency: "PHP" });
        } else await insertVariation({ groupCode, productName: input.productName, variation, imageId: imageId ?? null, businessId: business.businessId, deviceId });
      }
      for (const item of removed) {
        await execute("UPDATE Product SET status = 'ARCHIVED', updatedAt = ? WHERE id = ?", [now, item.id]);
        await execute("UPDATE Barcode SET active = 0, updatedAt = ? WHERE productId = ?", [now, item.id]);
      }
      const after = await findGroup(input.productId);
      const reasonCategory = addedCount > 0 && removed.length > 0 ? "VARIATIONS_CHANGED" : addedCount > 0 ? "VARIATION_ADDED" : removed.length > 0 ? "VARIATION_ARCHIVED" : "PRODUCT_DETAILS_CHANGED";
      await auditAction({ productId: input.productId, productCode: groupCode, action: "PRODUCT_EDIT", reasonCategory, reason: input.reason, proofImageDataUri: proof, quantity: addedCount + removed.length || undefined, before: auditSnapshot(before), after: auditSnapshot(after) });
      await execute("COMMIT");
      return after;
    } catch (error) { await execute("ROLLBACK"); throw error; }
  },

  async adjustStock(input: { productId: string; quantity: number; movementType: Exclude<IndependentStockMovement, "LOSS">; reason: string; proofImageDataUri: string; createdById?: string; createdByName?: string }) {
    requireIndependent("manageLocalInventory");
    await requireAuthorizedUser("POS_INVENTORY");
    if (!Number.isFinite(input.quantity) || input.quantity === 0) throw new Error("Stock quantity must be non-zero.");
    if (input.quantity < 0) throw new Error("Stock removal must use Record Loss so a category and proof photo are retained.");
    if (!input.reason.trim()) throw new Error("A stock movement reason is required.");
    const proof = validateProofMedia(input.proofImageDataUri, "Stock change proof media");
    const product = await ProductRepository.findById(input.productId);
    const business = BusinessConfigurationService.current();
    if (!product || product.status !== "ACTIVE" || product.identitySource !== "INDEPENDENT" || product.businessId !== business.businessId) throw new Error("Only this dealership's independent products can be adjusted locally.");
    const current = await InventoryRepository.findByProduct(input.productId);
    const before = current?.availableQty ?? 0;
    if (before + input.quantity < 0) throw new Error("This movement would make stock negative.");
    await execute("BEGIN IMMEDIATE");
    try {
      if (!current) await InventoryRepository.upsert(input.productId, { availableQty: 0 });
      const updated = await InventoryRepository.updateQuantities(input.productId, { availableQty: input.quantity, adjustmentQty: input.movementType === "ADJUSTMENT" ? input.quantity : undefined });
      if (!updated) throw new Error("Inventory record is unavailable.");
      await InventoryLedgerRepository.create({ movementType: input.movementType, referenceNumber: `${input.movementType}-${uuid()}`, productId: input.productId, quantity: input.quantity, balanceBefore: before, balanceAfter: updated.availableQty, notes: input.reason.trim(), createdById: input.createdById, createdByName: input.createdByName });
      await auditAction({
        productId: input.productId,
        productCode: product.productCode,
        action: "INVENTORY_STOCK_CHANGE",
        reasonCategory: input.movementType === "RECEIVING" ? "RECEIVE_STOCK" : "POSITIVE_CORRECTION",
        reason: input.reason,
        proofImageDataUri: proof,
        quantity: input.quantity,
        balanceBefore: before,
        balanceAfter: updated.availableQty,
      });
      await execute("COMMIT");
      return updated;
    } catch (error) { await execute("ROLLBACK"); throw error; }
  },

  async recordLoss(input: { productId: string; quantity: number; category: LossCategory; reason: string; proofImageDataUri: string }) {
    requireIndependent("manageLocalInventory");
    await requireAuthorizedUser("POS_INVENTORY");
    if (!LOSS_CATEGORIES.includes(input.category)) throw new Error("Select a valid loss reason.");
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error("Loss quantity must be greater than zero.");
    if (!input.reason.trim()) throw new Error("A written loss explanation is required.");
    const proof = validateProofMedia(input.proofImageDataUri, "Loss proof media");
    const product = await ProductRepository.findById(input.productId);
    const business = BusinessConfigurationService.current();
    if (!product || product.status !== "ACTIVE" || product.identitySource !== "INDEPENDENT" || product.businessId !== business.businessId) throw new Error("This independent variation is unavailable.");
    const inventory = await InventoryRepository.findByProduct(input.productId);
    const before = Number(inventory?.availableQty ?? 0);
    if (input.quantity > before) throw new Error("Loss quantity cannot exceed available stock.");
    await execute("BEGIN IMMEDIATE");
    try {
      const updated = await InventoryRepository.updateQuantities(input.productId, { availableQty: -input.quantity, damagedQty: input.quantity });
      if (!updated) throw new Error("Inventory record is unavailable.");
      await InventoryLedgerRepository.create({ movementType: `LOSS_${input.category}`, referenceNumber: `LOSS-${uuid()}`, productId: input.productId, quantity: -input.quantity, balanceBefore: before, balanceAfter: updated.availableQty, notes: input.reason.trim(), createdById: useCashierStore.getState().session?.cashierId, createdByName: useCashierStore.getState().session?.cashierName });
      await auditAction({ productId: input.productId, productCode: product.productCode, action: "STOCK_LOSS", reasonCategory: input.category, reason: input.reason, proofImageDataUri: proof, quantity: input.quantity, balanceBefore: before, balanceAfter: updated.availableQty });
      await execute("COMMIT");
      return updated;
    } catch (error) { await execute("ROLLBACK"); throw error; }
  },

  async archiveProduct(input: { productId: string; reason: string; proofImageDataUri: string }) {
    requireIndependent("manageLocalCatalog");
    await requireAuthorizedUser("POS_PRODUCTS");
    if (!input.reason.trim()) throw new Error("An archive reason is required.");
    const proof = validateProofMedia(input.proofImageDataUri, "Archive proof media");
    const group = await findGroup(input.productId);
    if (!group.length) throw new Error("Product not found.");
    if (group.some((item) => Number(item.availableQty ?? 0) !== 0)) throw new Error("Products with remaining stock cannot be archived.");
    await execute("BEGIN IMMEDIATE");
    try {
      const now = new Date().toISOString();
      for (const item of group) {
        await execute("UPDATE Product SET status = 'ARCHIVED', updatedAt = ? WHERE id = ?", [now, item.id]);
        await execute("UPDATE Barcode SET active = 0, updatedAt = ? WHERE productId = ?", [now, item.id]);
      }
      await auditAction({ productId: input.productId, productCode: group[0].productCode, action: "PRODUCT_ARCHIVE", reason: input.reason, proofImageDataUri: proof, before: auditSnapshot(group) });
      await execute("COMMIT");
    } catch (error) { await execute("ROLLBACK"); throw error; }
  },

  async permanentlyDeleteProduct(input: { productId: string; reason: string; proofImageDataUri: string; confirmation: string }) {
    requireIndependent("manageLocalCatalog");
    const session = useCashierStore.getState().session;
    if (session?.cashierId !== SUPER_ADMIN_ID) throw new Error("Only the system Super Admin can permanently delete products.");
    if (!input.reason.trim()) throw new Error("A permanent deletion reason is required.");
    const proof = validateProofMedia(input.proofImageDataUri, "Deletion proof media");
    const group = await findGroup(input.productId);
    if (!group.length) throw new Error("Product not found.");
    const expected = `DELETE ${group[0].name}`;
    if (input.confirmation.trim() !== expected) throw new Error(`Type “${expected}” to confirm permanent deletion.`);
    const ids = group.map((item) => item.id);
    const marks = ids.map(() => "?").join(",");
    const refs = await queryFirst<{ sales: number; transfers: number; ledger: number; mappings: number }>(
      `SELECT (SELECT COUNT(*) FROM SaleItem WHERE productId IN (${marks})) sales,
       (SELECT COUNT(*) FROM InventoryTransferItem WHERE productId IN (${marks})) transfers,
       (SELECT COUNT(*) FROM InventoryLedger WHERE productId IN (${marks})) ledger,
       (SELECT COUNT(*) FROM ProductOmsMapping WHERE localProductId IN (${marks})) mappings`,
      [...ids, ...ids, ...ids, ...ids]
    );
    if ((refs?.sales ?? 0) + (refs?.transfers ?? 0) + (refs?.ledger ?? 0) + (refs?.mappings ?? 0) > 0) throw new Error("This product has transaction, transfer, stock-movement, or OMS-mapping history and cannot be deleted. Archive it instead.");
    if (group.some((item) => Number(item.availableQty ?? 0) !== 0)) throw new Error("A product with stock cannot be deleted.");
    const imageId = group[0].imageId;
    await execute("BEGIN IMMEDIATE");
    try {
      await auditAction({ productId: input.productId, productCode: group[0].productCode, action: "PRODUCT_DELETE", reason: input.reason, proofImageDataUri: proof, before: auditSnapshot(group) });
      for (const id of ids) {
        await execute("DELETE FROM ProductPrice WHERE productId = ?", [id]);
        await execute("DELETE FROM Barcode WHERE productId = ?", [id]);
        await execute("DELETE FROM PosInventory WHERE productId = ?", [id]);
        await execute("DELETE FROM Product WHERE id = ?", [id]);
      }
      if (imageId && !(await queryFirst<{ id: string }>("SELECT id FROM Product WHERE imageId = ? LIMIT 1", [imageId]))) await execute("DELETE FROM ProductImage WHERE id = ?", [imageId]);
      await execute("COMMIT");
    } catch (error) { await execute("ROLLBACK"); throw error; }
  },
};

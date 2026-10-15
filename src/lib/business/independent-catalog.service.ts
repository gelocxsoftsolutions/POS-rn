import { v4 as uuid } from "uuid";
import { execute, queryFirst } from "@/lib/db/connection";
import { ProductRepository } from "@/lib/repositories/product.repository";
import { ProductPriceRepository } from "@/lib/repositories/product-price.repository";
import { InventoryRepository } from "@/lib/repositories/inventory.repository";
import { InventoryLedgerRepository } from "@/lib/repositories/inventory-ledger.repository";
import { BarcodeRepository } from "@/lib/repositories/barcode.repository";
import { BusinessConfigurationService } from "./configuration.service";
import { assertCapability } from "./capabilities";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { PermissionService } from "@/lib/services/permission.service";

export interface CreateIndependentVariationInput {
  productName: string;
  variationName?: string;
  productCode?: string;
  description?: string;
  categoryId?: string;
  brandId?: string;
  unitId?: string;
  weight?: number | null;
  taxGroupId?: string;
  price: number;
  openingStock?: number;
  minimumStock?: number;
  createdById?: string;
  createdByName?: string;
}

export type IndependentStockMovement = "OPENING_STOCK" | "RECEIVING" | "ADJUSTMENT" | "DAMAGE";

function compactNamespace(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(6, "0").slice(-6);
}

async function nextBarcodeIdentifier(businessId: string, deviceId: string): Promise<string> {
  await execute(
    `INSERT OR IGNORE INTO BarcodeNamespace (businessId, deviceId, nextSequence)
     VALUES (?, ?, 1)`,
    [businessId, deviceId]
  );
  const row = await queryFirst<{ nextSequence: number }>(
    "SELECT nextSequence FROM BarcodeNamespace WHERE businessId = ? AND deviceId = ?",
    [businessId, deviceId]
  );
  const sequence = Math.max(1, Number(row?.nextSequence ?? 1));
  await execute(
    "UPDATE BarcodeNamespace SET nextSequence = ? WHERE businessId = ? AND deviceId = ?",
    [sequence + 1, businessId, deviceId]
  );
  const businessPart = compactNamespace(businessId).slice(0, 4);
  const devicePart = compactNamespace(deviceId).slice(0, 4);
  const sequencePart = sequence.toString(36).toUpperCase().padStart(4, "0").slice(-4);
  return `D${businessPart}${devicePart}${sequencePart}`;
}

function requireIndependent(capability: "manageLocalCatalog" | "manageLocalInventory") {
  const mode = BusinessConfigurationService.current().operatingMode;
  assertCapability(mode, capability);
}

async function requireAuthorizedUser(permission: "POS_PRODUCTS" | "POS_INVENTORY") {
  const session = useCashierStore.getState().session;
  if (!session) throw new Error("Sign in before changing dealership catalog or stock.");
  if (session.isSuperAdmin) return;
  if (!session.roleId || !(await PermissionService.hasPermission(session.roleId, permission))) {
    throw new Error("Your account is not authorized for this operation.");
  }
}

export const IndependentCatalogService = {
  async createVariation(input: CreateIndependentVariationInput) {
    requireIndependent("manageLocalCatalog");
    await requireAuthorizedUser("POS_PRODUCTS");
    const business = BusinessConfigurationService.current();
    const deviceId = useDeviceStore.getState().device.deviceId;
    if (!deviceId) throw new Error("Register this device before creating offline variation barcodes.");
    if (!input.productName.trim()) throw new Error("Product name is required.");
    if (!Number.isFinite(input.price) || input.price < 0) throw new Error("Enter a valid selling price.");
    const openingStock = Math.max(0, Number(input.openingStock ?? 0));

    await execute("BEGIN IMMEDIATE");
    try {
      let barcode = "";
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = await nextBarcodeIdentifier(business.businessId, deviceId);
        const collision = await queryFirst<{ id: string }>(
          "SELECT id FROM Barcode WHERE barcode = ?",
          [candidate]
        );
        if (!collision) {
          barcode = candidate;
          break;
        }
      }
      if (!barcode) throw new Error("Unable to reserve a unique variation barcode. Try again.");

      const productId = uuid();
      const now = new Date().toISOString();
      const description = [input.variationName?.trim(), input.description?.trim()]
        .filter(Boolean)
        .join(" — ") || null;
      await execute(
        `INSERT INTO Product
         (id, sku, productCode, name, description, categoryId, brandId, unitId,
          weight, taxGroupId, status, businessId, identitySource, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, 'INDEPENDENT', ?, ?)`,
        [productId, barcode, input.productCode?.trim() || productId,
          input.productName.trim(), description, input.categoryId ?? null,
          input.brandId ?? null, input.unitId ?? null, input.weight ?? null,
          input.taxGroupId ?? null, business.businessId, now, now]
      );
      await ProductPriceRepository.upsert({ productId, price: input.price, currency: "PHP" });
      await BarcodeRepository.upsert({ productId, barcode, type: "code128" });
      await InventoryRepository.upsert(productId, {
        availableQty: openingStock,
        adjustmentQty: openingStock,
        minimumStock: Math.max(0, Number(input.minimumStock ?? 0)),
      });
      if (openingStock > 0) {
        await InventoryLedgerRepository.create({
          movementType: "OPENING_STOCK",
          referenceNumber: `OPEN-${productId}`,
          productId,
          quantity: openingStock,
          balanceBefore: 0,
          balanceAfter: openingStock,
          createdById: input.createdById,
          createdByName: input.createdByName,
        });
      }
      await execute("COMMIT");
      return {
        product: await ProductRepository.findById(productId),
        barcode,
        symbology: "CODE_128" as const,
      };
    } catch (error) {
      await execute("ROLLBACK");
      throw error;
    }
  },

  async adjustStock(input: {
    productId: string;
    quantity: number;
    movementType: IndependentStockMovement;
    reason: string;
    createdById?: string;
    createdByName?: string;
  }) {
    requireIndependent("manageLocalInventory");
    await requireAuthorizedUser("POS_INVENTORY");
    if (!Number.isFinite(input.quantity) || input.quantity === 0) {
      throw new Error("Stock quantity must be non-zero.");
    }
    if (!input.reason.trim()) throw new Error("A stock movement reason is required.");
    const product = await queryFirst<{ identitySource: string; businessId: string }>(
      "SELECT identitySource, businessId FROM Product WHERE id = ? AND status = 'ACTIVE'",
      [input.productId]
    );
    const business = BusinessConfigurationService.current();
    if (!product || product.identitySource !== "INDEPENDENT" || product.businessId !== business.businessId) {
      throw new Error("Only this dealership's independent products can be adjusted locally.");
    }
    const current = await InventoryRepository.findByProduct(input.productId);
    const before = current?.availableQty ?? 0;
    if (before + input.quantity < 0) throw new Error("This movement would make stock negative.");

    await execute("BEGIN IMMEDIATE");
    try {
      if (!current) await InventoryRepository.upsert(input.productId, { availableQty: 0 });
      const updated = await InventoryRepository.updateQuantities(input.productId, {
        availableQty: input.quantity,
        adjustmentQty: input.movementType === "ADJUSTMENT" ? input.quantity : undefined,
        damagedQty: input.movementType === "DAMAGE" ? Math.abs(input.quantity) : undefined,
      });
      if (!updated) throw new Error("Inventory record is unavailable.");
      await InventoryLedgerRepository.create({
        movementType: input.movementType,
        referenceNumber: `${input.movementType}-${uuid()}`,
        productId: input.productId,
        quantity: input.quantity,
        balanceBefore: before,
        balanceAfter: updated.availableQty,
        notes: input.reason.trim(),
        createdById: input.createdById,
        createdByName: input.createdByName,
      });
      await execute("COMMIT");
      return updated;
    } catch (error) {
      await execute("ROLLBACK");
      throw error;
    }
  },

  async archiveVariation(productId: string) {
    requireIndependent("manageLocalCatalog");
    await requireAuthorizedUser("POS_PRODUCTS");
    const business = BusinessConfigurationService.current();
    const product = await queryFirst<{ identitySource: string; businessId: string }>(
      "SELECT identitySource, businessId FROM Product WHERE id = ?",
      [productId]
    );
    if (!product || product.identitySource !== "INDEPENDENT" || product.businessId !== business.businessId) {
      throw new Error("Only this dealership's independent products can be archived locally.");
    }
    await execute("BEGIN IMMEDIATE");
    try {
      await execute("UPDATE Product SET status = 'ARCHIVED', updatedAt = ? WHERE id = ?", [new Date().toISOString(), productId]);
      await execute("UPDATE Barcode SET active = 0, updatedAt = ? WHERE productId = ?", [new Date().toISOString(), productId]);
      await execute("COMMIT");
    } catch (error) {
      await execute("ROLLBACK");
      throw error;
    }
  },
};

import { v4 as uuid } from "uuid";
import { getDatabase } from "@/lib/db/connection";
import { BusinessConfigurationService } from "@/lib/business/configuration.service";
import { assertCapability } from "@/lib/business/capabilities";
import { requirePermission } from "@/lib/services/authorization.service";
import { useCashierStore } from "@/lib/stores/cashier-store";

export interface LocalProductInput { name: string; sku: string; barcode?: string; price: number; openingStock: number; expectedStock?: number; }
export const LocalCatalogService = {
  async update(id: string, input: LocalProductInput) {
    await requirePermission("POS_PRODUCTS", "edit local products");
    const business = BusinessConfigurationService.current();
    assertCapability(business.operatingMode, "manageLocalCatalog");
    if (!input.name.trim() || input.name.length > 255 || !input.sku.trim() || input.sku.length > 100) throw new Error("Enter a product name and a unique SKU.");
    if (!Number.isFinite(input.price) || input.price < 0 || !Number.isFinite(input.openingStock) || input.openingStock < 0) throw new Error("Price and stock must be zero or greater.");
    const db = await getDatabase(), now = new Date().toISOString();
    const session = useCashierStore.getState().session!;
    await db.withTransactionAsync(async () => {
      const product = await db.getFirstAsync<{ businessId: string }>("SELECT businessId FROM Product WHERE id=?", [id]);
      if (!product || product.businessId !== business.businessId) throw new Error("Product does not belong to this dealership.");
      const inventory = await db.getFirstAsync<{ availableQty: number }>("SELECT availableQty FROM PosInventory WHERE productId=?", [id]);
      const before = inventory?.availableQty ?? 0, delta = input.openingStock - before;
      if (input.expectedStock !== undefined && before !== input.expectedStock) throw new Error("Stock changed while editing. Reopen the product and retry.");
      await db.runAsync("UPDATE Product SET name=?,sku=?,updatedAt=? WHERE id=?", [input.name.trim(),input.sku.trim(),now,id]);
      await db.runAsync("UPDATE ProductPrice SET active=0,updatedAt=? WHERE productId=? AND priceList='retail'", [now,id]);
      await db.runAsync("INSERT INTO ProductPrice (id,productId,priceList,price,currency,active,createdAt,updatedAt) VALUES (?,?,'retail',?,'PHP',1,?,?)", [uuid(),id,input.price,now,now]);
      const primary = await db.getFirstAsync<{ id: string }>("SELECT id FROM Barcode WHERE productId=? AND type='primary' ORDER BY createdAt LIMIT 1", [id]);
      if (primary) await db.runAsync("UPDATE Barcode SET barcode=?,active=?,updatedAt=? WHERE id=?", [input.barcode?.trim() || `inactive:${primary.id}`,input.barcode?.trim()?1:0,now,primary.id]);
      else if (input.barcode?.trim()) await db.runAsync("INSERT INTO Barcode (id,productId,barcode,type,active,createdAt,updatedAt) VALUES (?,?,?,'primary',1,?,?)", [uuid(),id,input.barcode.trim(),now,now]);
      if (inventory) await db.runAsync("UPDATE PosInventory SET availableQty=?,adjustmentQty=adjustmentQty+?,updatedAt=? WHERE productId=?", [input.openingStock,delta,now,id]);
      else await db.runAsync("INSERT INTO PosInventory (id,productId,availableQty,adjustmentQty,updatedAt) VALUES (?,?,?,?,?)", [uuid(),id,input.openingStock,delta,now]);
      if (delta) await db.runAsync("INSERT INTO InventoryLedger (id,movementType,referenceNumber,productId,quantity,balanceBefore,balanceAfter,createdById,createdByName,createdAt) VALUES (?,'ADJUSTMENT',?,?,?,?,?,?,?,?)", [uuid(),`edit:${id}`,id,delta,before,input.openingStock,session.cashierId,session.cashierName,now]);
      await db.runAsync("INSERT INTO AuditLog (id,eventType,description,cashierId,cashierName,metadata,createdAt) VALUES (?,'LOCAL_PRODUCT_UPDATED',?,?,?,?,?)", [uuid(),`Updated product ${input.name.trim()}`,session.cashierId,session.cashierName,JSON.stringify({productId:id,businessId:business.businessId,stockBefore:before,stockAfter:input.openingStock}),now]);
    });
  },
  async create(input: LocalProductInput) {
    await requirePermission("POS_PRODUCTS", "add local products");
    const business = BusinessConfigurationService.current();
    assertCapability(business.operatingMode, "manageLocalCatalog");
    if (!input.name.trim() || input.name.length > 255 || !input.sku.trim() || input.sku.length > 100) throw new Error("Enter a product name and a unique SKU.");
    if (!Number.isFinite(input.price) || input.price < 0 || !Number.isFinite(input.openingStock) || input.openingStock < 0) throw new Error("Price and opening stock must be zero or greater.");
    const db = await getDatabase();
    const id = uuid(), now = new Date().toISOString();
    const session = useCashierStore.getState().session!;
    await db.withTransactionAsync(async () => {
      await db.runAsync("INSERT INTO Product (id,sku,productCode,name,businessId,identitySource,status,createdAt,updatedAt) VALUES (?,?,?,?,?,'LOCAL','ACTIVE',?,?)", [id,input.sku.trim(),input.sku.trim(),input.name.trim(),business.businessId,now,now]);
      await db.runAsync("INSERT INTO ProductPrice (id,productId,priceList,price,currency,active,createdAt,updatedAt) VALUES (?,?,'retail',?,'PHP',1,?,?)", [uuid(),id,input.price,now,now]);
      await db.runAsync("INSERT INTO PosInventory (id,productId,availableQty,allocatedQty,updatedAt) VALUES (?,?,?,?,?)", [uuid(),id,input.openingStock,input.openingStock,now]);
      if (input.barcode?.trim()) await db.runAsync("INSERT INTO Barcode (id,productId,barcode,type,active,createdAt,updatedAt) VALUES (?,?,?,'primary',1,?,?)", [uuid(),id,input.barcode.trim(),now,now]);
      await db.runAsync("INSERT INTO InventoryLedger (id,movementType,referenceNumber,productId,quantity,balanceBefore,balanceAfter,createdById,createdByName,createdAt) VALUES (?,'OPENING',?,?,?,0,?,?,?,?)", [uuid(),`local:${id}`,id,input.openingStock,input.openingStock,session.cashierId,session.cashierName,now]);
      await db.runAsync("INSERT INTO AuditLog (id,eventType,description,cashierId,cashierName,metadata,createdAt) VALUES (?,'LOCAL_PRODUCT_CREATED',?,?,?,?,?)", [uuid(),`Created local product ${input.name.trim()}`,session.cashierId,session.cashierName,JSON.stringify({productId:id,businessId:business.businessId}),now]);
    });
    return id;
  },
};

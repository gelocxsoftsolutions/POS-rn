import { v4 as uuid } from "uuid";
import { getDatabase } from "@/lib/db/connection";
import { BusinessConfigurationService } from "@/lib/business/configuration.service";
import { assertCapability } from "@/lib/business/capabilities";
import { requirePermission } from "@/lib/services/authorization.service";
import { useCashierStore } from "@/lib/stores/cashier-store";

export interface LocalProductInput { name: string; sku: string; barcode?: string; price: number; openingStock: number; }
export const LocalCatalogService = {
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

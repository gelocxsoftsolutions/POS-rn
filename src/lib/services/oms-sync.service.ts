import { api, setApiConfig, getApiConfig } from "@/lib/api/http";
import { InventoryRepository } from "@/lib/repositories/inventory.repository";
import { ProductRepository } from "@/lib/repositories/product.repository";
import { TransferRepository } from "@/lib/repositories/transfer.repository";
import { execute, query } from "@/lib/db/connection";
import { v4 as uuid } from "uuid";
import { DeviceRepository } from "@/lib/repositories/device.repository";
import { CategoryRepository } from "@/lib/repositories/category.repository";
import { BrandRepository } from "@/lib/repositories/brand.repository";
import { UnitRepository } from "@/lib/repositories/unit.repository";
import { TaxGroupRepository } from "@/lib/repositories/tax-group.repository";
import { BarcodeRepository } from "@/lib/repositories/barcode.repository";

export const OmsSyncService = {
  async syncInventory(deviceId: string): Promise<{ synced: number }> {
    try {
      const res = await api.get<Array<{
        productId: string;
        availableQty: number;
        allocatedQty: number;
        reservedQty: number;
        minimumStock: number;
        maximumStock: number;
      }>>(`/api/pos/inventory?deviceId=${deviceId}`);

      if (!res.ok || !res.data) return { synced: 0 };

      let synced = 0;
      for (const item of res.data) {
        await InventoryRepository.upsert(item.productId, {
          availableQty: item.availableQty,
          allocatedQty: item.allocatedQty,
          reservedQty: item.reservedQty,
          minimumStock: item.minimumStock,
          maximumStock: item.maximumStock,
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
      const res = await api.get<Array<{
        sku: string;
        productCode?: string;
        name: string;
        description?: string;
        categoryName?: string;
        brandName?: string;
        unitName?: string;
        taxGroupName?: string;
        taxRate?: number;
        retailPrice?: number;
        barcode?: string;
        minimumStock?: number;
        maximumStock?: number;
      }>>(`/api/pos/products?branchId=${branchId}`);

      if (!res.ok || !res.data) return { synced: 0 };

      let synced = 0;
      for (const p of res.data) {
        let categoryId: string | undefined;
        if (p.categoryName) {
          const cats = await query<{ id: string }>(
            "SELECT id FROM Category WHERE name = ?", [p.categoryName]
          );
          if (cats.length > 0) categoryId = cats[0].id;
        }

        let brandId: string | undefined;
        if (p.brandName) {
          const brands = await query<{ id: string }>(
            "SELECT id FROM Brand WHERE name = ?", [p.brandName]
          );
          if (brands.length > 0) brandId = brands[0].id;
        }

        let unitId: string | undefined;
        if (p.unitName) {
          const units = await query<{ id: string }>(
            "SELECT id FROM Unit WHERE name = ?", [p.unitName]
          );
          if (units.length > 0) unitId = units[0].id;
        }

        let taxGroupId: string | undefined;
        if (p.taxGroupName) {
          const tgs = await query<{ id: string }>(
            "SELECT id FROM TaxGroup WHERE name = ?", [p.taxGroupName]
          );
          if (tgs.length > 0) taxGroupId = tgs[0].id;
        }

        const existing = await query<{ id: string }>(
          "SELECT id FROM Product WHERE sku = ?", [p.sku]
        );

        if (existing.length > 0) {
          await ProductRepository.update(existing[0].id, {
            name: p.name,
            description: p.description,
            categoryId,
            brandId,
            unitId,
            taxGroupId,
          });
        } else {
          const created = await ProductRepository.create({
            sku: p.sku,
            productCode: p.productCode,
            name: p.name,
            description: p.description,
            categoryId,
            brandId,
            unitId,
            taxGroupId,
          });

          if (p.retailPrice !== undefined) {
            await execute(
              `INSERT OR REPLACE INTO ProductPrice (id, productId, priceList, price, currency, active, createdAt, updatedAt)
               VALUES (?, ?, 'retail', ?, 'PHP', 1, ?, ?)`,
              [uuid(), created.id, p.retailPrice, new Date().toISOString(), new Date().toISOString()]
            );
          }

          if (p.barcode) {
            await BarcodeRepository.upsert({
              productId: created.id,
              barcode: p.barcode,
            });
          }
        }

        synced++;
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
      const res = await api.get<Array<{
        transferNumber: string;
        sourceWarehouse?: string;
        destinationPos?: string;
        status: string;
        items: Array<{
          productId: string;
          allocatedQty: number;
          unit?: string;
        }>;
      }>>(`/api/pos/transfers/pending?deviceId=${deviceId}`);

      if (!res.ok || !res.data) return { synced: 0 };

      let synced = 0;
      for (const t of res.data) {
        const existing = await query<{ id: string }>(
          "SELECT id FROM InventoryTransfer WHERE transferNumber = ?", [t.transferNumber]
        );

        if (existing.length === 0) {
          await TransferRepository.create({
            transferNumber: t.transferNumber,
            sourceWarehouse: t.sourceWarehouse,
            destinationPos: t.destinationPos,
            items: t.items,
          });
          synced++;
        }
      }

      return { synced };
    } catch {
      return { synced: 0 };
    }
  },

  async connect(url: string, apiKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      setApiConfig({ baseUrl: url, apiKey });

      const res = await api.get("/api/health");
      if (!res.ok) {
        return { success: false, error: "Server unreachable" };
      }

      try {
        const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
        await AsyncStorage.setItem("nct-pos-oms", JSON.stringify({
          state: { serverUrl: url, apiKey },
          version: 0,
        }));
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

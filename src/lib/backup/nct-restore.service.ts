import * as SQLite from "expo-sqlite";
import { Directory, File, Paths } from "expo-file-system";
import { getDatabase } from "@/lib/db/connection";
import { serializeLocalOperation } from "@/lib/db/local-operation";
import { serializeNctSync } from "@/lib/services/nct-sync-coordinator";
import { BusinessConfigurationService } from "@/lib/business/configuration.service";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { restoreUiPreferences } from "@/lib/stores/ui-store";
import { SCHEMA_VERSION } from "@/lib/db/schema";
import { v4 as uuid } from "uuid";
import { RecoveryService, type BackupEnvelope } from "./recovery.service";

function bytes(base64: string) {
  const binary = atob(base64), value = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (value.length < 100) throw new Error("Invalid SQLite database.");
  value[18] = 1; value[19] = 1;
  return value;
}
export async function inspectRestoreSource(source: SQLite.SQLiteDatabase, envelope: BackupEnvelope, identity: { deviceId: string; branchId: number | null; businessId: string }) {
  const integrity = await source.getFirstAsync<{ quick_check: string }>("PRAGMA quick_check");
  if (integrity?.quick_check !== "ok") throw new Error("Backup SQLite integrity check failed.");
  const violations = await source.getAllAsync("PRAGMA foreign_key_check");
  if (violations.length) throw new Error("Backup contains broken database relationships.");
  const meta = await source.getFirstAsync<{ v: number }>("SELECT v FROM _meta WHERE key='schema_version'");
  const business = await source.getFirstAsync<{ businessId: string }>("SELECT businessId FROM StoreSettings WHERE id='default'");
  const device = await source.getFirstAsync<{ id: string; branchId: number }>("SELECT id,branchId FROM Device LIMIT 1");
  if (meta?.v !== SCHEMA_VERSION || business?.businessId !== identity.businessId || envelope.businessId !== identity.businessId ||
    device?.id !== identity.deviceId || envelope.deviceId !== identity.deviceId || Number(device.branchId) !== identity.branchId) throw new Error("Backup schema, business, branch or device identity does not match this installation.");
  const sales = await source.getFirstAsync<{ sales: number; saleTotal: number }>("SELECT COUNT(*) sales,COALESCE(SUM(total),0) saleTotal FROM Sale WHERE status='COMPLETED'");
  const inventory = await source.getFirstAsync<{ inventoryQuantity: number }>("SELECT COALESCE(SUM(availableQty),0) inventoryQuantity FROM PosInventory");
  const products = await source.getFirstAsync<{ products: number }>("SELECT COUNT(*) products FROM Product WHERE status='ACTIVE'");
  const actual = { sales: sales?.sales ?? 0, saleTotal: sales?.saleTotal ?? 0, inventoryQuantity: inventory?.inventoryQuantity ?? 0, products: products?.products ?? 0 };
  if (Object.keys(actual).some((key) => actual[key as keyof typeof actual] !== envelope.totals[key as keyof typeof actual])) throw new Error("Backup totals do not match the verified manifest. Current database was preserved.");
}

export async function restoreNctBackup(fileUri: string) {
  const envelope = await RecoveryService.validate(fileUri);
  const device = useDeviceStore.getState().device;
  if (!device.deviceId) throw new Error("Reconnect the intended NCT device before restoring.");
  // Persist a recovery copy as well as retaining an in-memory rollback snapshot.
  await RecoveryService.createBackup({ upload: false });
  return serializeNctSync(() => serializeLocalOperation(async () => {
    const source = await SQLite.deserializeDatabaseAsync(bytes(envelope.databaseBase64));
    try {
      await inspectRestoreSource(source, envelope, { deviceId: device.deviceId!, branchId: device.branchId, businessId: BusinessConfigurationService.current().businessId });
      const destination = await getDatabase();
      const rescueBytes = await destination.serializeAsync();
      // Keep the original snapshot available for rollback without changing its size.
      const original = new Uint8Array(rescueBytes); original[18] = 1; original[19] = 1;
      const rollback = await SQLite.deserializeDatabaseAsync(original);
      try {
        await SQLite.backupDatabaseAsync({ sourceDatabase: source, destDatabase: destination });
        await destination.execAsync("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
        const directory = new Directory(Paths.document, "business-branding");
        directory.create({ intermediates: true, idempotent: true });
        for (const asset of envelope.assets) {
          if (!["businessLogo", "receiptLogo"].includes(asset.name) || !/^\.[a-zA-Z0-9]{1,8}$/.test(asset.extension)) throw new Error("Invalid branding asset metadata.");
          const file = new File(directory, `nct-restored-${uuid()}-${asset.name}${asset.extension}`);
          file.create({ overwrite: true });
          const raw = atob(asset.base64); file.write(Uint8Array.from(raw, (char) => char.charCodeAt(0)));
          await destination.runAsync(`UPDATE StoreSettings SET ${asset.name === "businessLogo" ? "businessLogoUri" : "receiptLogoUri"}=? WHERE id='default'`, [file.uri]);
        }
        await BusinessConfigurationService.load();
        restoreUiPreferences(envelope.uiPreferences);
        useCashierStore.getState().clearSession(); useAuthStore.getState().signOut();
      } catch (error) {
        await SQLite.backupDatabaseAsync({ sourceDatabase: rollback, destDatabase: destination });
        await destination.execAsync("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
        await BusinessConfigurationService.load();
        throw error;
      } finally { await rollback.closeAsync(); }
    } finally { await source.closeAsync(); }
  }));
}

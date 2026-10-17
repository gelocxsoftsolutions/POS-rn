import * as SQLite from "expo-sqlite";
import { Directory, File, Paths } from "expo-file-system";
import { sha256 as sha256Bytes } from "@noble/hashes/sha2.js";
import { v4 as uuid } from "uuid";
import { SCHEMA_VERSION } from "@/lib/db/schema";
import { execute, getDatabase, queryFirst } from "@/lib/db/connection";
import { BusinessConfigurationService } from "@/lib/business/configuration.service";
import { useDeviceStore } from "@/lib/stores/device-store";
import { SyncQueueService } from "@/lib/services/sync-queue.service";
import { exportUiPreferences, restoreUiPreferences, type PersistedUiPreferences } from "@/lib/stores/ui-store";

interface BackupAsset {
  name: "businessLogo" | "receiptLogo";
  extension: string;
  base64: string;
}

export interface BackupEnvelope {
  format: "nct-pos-backup";
  formatVersion: 1 | 2;
  schemaVersion: number;
  businessId: string;
  deviceId: string | null;
  createdAt: string;
  databaseChecksum: string;
  backupChecksum?: string;
  databaseBase64: string;
  assets: BackupAsset[];
  uiPreferences?: PersistedUiPreferences;
  totals: { sales: number; saleTotal: number; inventoryQuantity: number; products: number };
}

function backupIntegrityPayload(envelope: Omit<BackupEnvelope, "backupChecksum"> | BackupEnvelope) {
  return JSON.stringify({
    format: envelope.format,
    formatVersion: envelope.formatVersion,
    schemaVersion: envelope.schemaVersion,
    businessId: envelope.businessId,
    deviceId: envelope.deviceId,
    createdAt: envelope.createdAt,
    databaseChecksum: envelope.databaseChecksum,
    assets: envelope.assets,
    uiPreferences: envelope.uiPreferences ?? null,
    totals: envelope.totals,
  });
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((value) => value.toString(16).padStart(2, "0")).join("");
}

function base64ToBytes(base64: string): Uint8Array {
  const decode = globalThis.atob;
  if (!decode) throw new Error("Base64 decoding is unavailable on this platform.");
  const raw = decode(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

async function databaseTotals() {
  const sales = await queryFirst<{ count: number; total: number }>(
    "SELECT COUNT(*) count, COALESCE(SUM(total), 0) total FROM Sale WHERE status = 'COMPLETED'"
  );
  const inventory = await queryFirst<{ quantity: number }>(
    "SELECT COALESCE(SUM(availableQty), 0) quantity FROM PosInventory"
  );
  const products = await queryFirst<{ count: number }>(
    "SELECT COUNT(*) count FROM Product WHERE status = 'ACTIVE'"
  );
  return { sales: sales?.count ?? 0, saleTotal: sales?.total ?? 0, inventoryQuantity: inventory?.quantity ?? 0, products: products?.count ?? 0 };
}

async function readAsset(name: BackupAsset["name"], uri: string | null): Promise<BackupAsset | null> {
  if (!uri || uri.startsWith("data:") || uri.startsWith("http")) return null;
  try {
    const file = new File(uri);
    if (!file.exists) return null;
    return { name, extension: file.extension || ".jpg", base64: await file.base64() };
  } catch { return null; }
}

export const RecoveryService = {
  async createBackup(): Promise<{ file: File; envelope: BackupEnvelope }> {
    const business = BusinessConfigurationService.current();
    const deviceId = useDeviceStore.getState().device.deviceId;
    const database = await getDatabase();
    await database.execAsync("PRAGMA wal_checkpoint(FULL)");
    const bytes = await database.serializeAsync();
    const temp = new File(Paths.cache, `pos-${Date.now()}.sqlite`);
    temp.create({ overwrite: true });
    temp.write(bytes);
    const assets = (await Promise.all([
      readAsset("businessLogo", business.businessLogoUri),
      readAsset("receiptLogo", business.receiptLogoUri),
    ])).filter((asset): asset is BackupAsset => Boolean(asset));
    const draft: Omit<BackupEnvelope, "backupChecksum"> = {
      format: "nct-pos-backup", formatVersion: 2, schemaVersion: SCHEMA_VERSION,
      businessId: business.businessId, deviceId, createdAt: new Date().toISOString(),
      databaseChecksum: bytesToHex(sha256Bytes(bytes)), databaseBase64: await temp.base64(),
      assets, uiPreferences: exportUiPreferences(), totals: await databaseTotals(),
    };
    const envelope: BackupEnvelope = {
      ...draft,
      backupChecksum: bytesToHex(sha256Bytes(new TextEncoder().encode(backupIntegrityPayload(draft)))),
    };
    temp.delete();
    const directory = new Directory(Paths.document, "pos-backups");
    directory.create({ intermediates: true, idempotent: true });
    const file = new File(directory, `${business.businessId}-${Date.now()}.nctposbackup`);
    file.create({ overwrite: false });
    file.write(JSON.stringify(envelope));
    return { file, envelope };
  },

  async queueBackupUpload(reference: string): Promise<{ backupId: string; fileUri: string }> {
    const currentBusiness = BusinessConfigurationService.current();
    const currentDeviceId = useDeviceStore.getState().device.deviceId;
    const idempotencyKey = `${currentBusiness.businessId}:${currentDeviceId ?? "device"}:${reference}:backup`;
    const existing = await queryFirst<{ entityId: string }>(
      `SELECT entityId FROM SyncQueue
       WHERE dedupeKey = ? AND status IN ('PENDING', 'PROCESSING', 'SYNCED')
       ORDER BY createdAt DESC LIMIT 1`, [idempotencyKey]
    );
    if (existing) return { backupId: existing.entityId, fileUri: "Stored in the durable upload queue" };
    const { file, envelope } = await this.createBackup();
    const backupId = uuid();
    await execute(
      `INSERT INTO BackupManifest
       (id, businessId, deviceId, schemaVersion, databaseChecksum, status, createdAt)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
      [backupId, envelope.businessId, envelope.deviceId, envelope.schemaVersion, envelope.databaseChecksum, envelope.createdAt]
    );
    await SyncQueueService.enqueue("DatabaseBackup", backupId, "UPLOAD", {
      idempotencyKey, businessId: envelope.businessId, deviceId: envelope.deviceId,
      schemaVersion: envelope.schemaVersion, checksum: envelope.databaseChecksum,
      createdAt: envelope.createdAt, contentBase64: await file.base64(),
    }, idempotencyKey);
    return { backupId, fileUri: file.uri };
  },

  async validate(fileUri: string): Promise<BackupEnvelope> {
    const envelope = JSON.parse(await new File(fileUri).text()) as BackupEnvelope;
    if (envelope.format !== "nct-pos-backup" || ![1, 2].includes(envelope.formatVersion)) throw new Error("Unsupported backup format.");
    if (envelope.schemaVersion !== SCHEMA_VERSION) throw new Error(`Backup schema ${envelope.schemaVersion} is incompatible with app schema ${SCHEMA_VERSION}.`);
    const bytes = base64ToBytes(envelope.databaseBase64);
    if (bytesToHex(sha256Bytes(bytes)) !== envelope.databaseChecksum) throw new Error("Backup checksum validation failed.");
    if (envelope.formatVersion === 2) {
      const expected = bytesToHex(sha256Bytes(new TextEncoder().encode(backupIntegrityPayload(envelope))));
      if (!envelope.backupChecksum || expected !== envelope.backupChecksum) throw new Error("Backup settings and asset checksum validation failed.");
    }
    return envelope;
  },

  async restoreFreshInstallation(fileUri: string): Promise<void> {
    const envelope = await this.validate(fileUri);
    const existing = await queryFirst<{ records: number }>(
      `SELECT (SELECT COUNT(*) FROM Sale) + (SELECT COUNT(*) FROM Product) +
              (SELECT COUNT(*) FROM InventoryTransfer) records`
    );
    if ((existing?.records ?? 0) > 0) throw new Error("Restore is allowed only on a fresh installation; existing POS data was not changed.");
    const source = await SQLite.deserializeDatabaseAsync(base64ToBytes(envelope.databaseBase64));
    try {
      const meta = await source.getFirstAsync<{ v: number }>("SELECT v FROM _meta WHERE key = 'schema_version'");
      const identity = await source.getFirstAsync<{ businessId: string }>("SELECT businessId FROM StoreSettings WHERE id = 'default'");
      if (meta?.v !== SCHEMA_VERSION || identity?.businessId !== envelope.businessId) throw new Error("Backup identity or schema metadata does not match its manifest.");
      await SQLite.backupDatabaseAsync({ sourceDatabase: source, destDatabase: await getDatabase() });
    } finally { await source.closeAsync(); }
    const restoredTotals = await databaseTotals();
    if (JSON.stringify(restoredTotals) !== JSON.stringify(envelope.totals)) throw new Error("Restored database totals do not match the backup manifest.");
    const directory = new Directory(Paths.document, "business-branding");
    directory.create({ intermediates: true, idempotent: true });
    for (const asset of envelope.assets) {
      const file = new File(directory, `${envelope.businessId}-restored-${asset.name}${asset.extension}`);
      file.create({ overwrite: true }); file.write(base64ToBytes(asset.base64));
      await execute(`UPDATE StoreSettings SET ${asset.name === "businessLogo" ? "businessLogoUri" : "receiptLogoUri"} = ? WHERE id = 'default'`, [file.uri]);
    }
    await BusinessConfigurationService.load();
    restoreUiPreferences(envelope.uiPreferences);
  },
};

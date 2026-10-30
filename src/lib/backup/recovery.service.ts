import { Directory, File, Paths } from "expo-file-system";
import { sha256 as sha256Bytes } from "@noble/hashes/sha2.js";
import { v4 as uuid } from "uuid";
import { SCHEMA_VERSION } from "@/lib/db/schema";
import { execute, getDatabase, queryFirst } from "@/lib/db/connection";
import { BusinessConfigurationService } from "@/lib/business/configuration.service";
import { useDeviceStore } from "@/lib/stores/device-store";
import { SyncQueueService } from "@/lib/services/sync-queue.service";
import { exportUiPreferences, type PersistedUiPreferences } from "@/lib/stores/ui-store";
import { requirePermission } from "@/lib/services/authorization.service";
import { isNctPos } from "@/lib/services/nct-scope";
import { nctBackupReference } from "./nct-schedule";
import { cachedBranchBackupTime } from "@/lib/stores/backup-settings-store";
import { serializeLocalOperation } from "@/lib/db/local-operation";

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
  source?: "MANUAL" | "AUTOMATIC";
  databaseBase64: string;
  assets: BackupAsset[];
  uiPreferences?: PersistedUiPreferences;
  totals: { sales: number; saleTotal: number; inventoryQuantity: number; products: number };
}

export interface BackupFileInfo {
  name: string;
  uri: string;
  size: number;
  createdAt: string;
  source: "MANUAL" | "AUTOMATIC" | "LEGACY";
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
    ...(envelope.source !== undefined ? { source: envelope.source } : {}),
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

function forceRollbackJournalMode(bytes: Uint8Array): Uint8Array {
  // SQLite serialized images that declare WAL mode (header bytes 18/19 == 2)
  // cannot be queried after being loaded into an in-memory database: the first
  // prepare fails with SQLITE_CANTOPEN ("unable to open database file").
  // The snapshot is fully checkpointed before serialization, so downgrading the
  // header to the legacy rollback-journal mode is safe and keeps deserialized
  // restores queryable.
  if (bytes.length >= 20 && (bytes[18] === 2 || bytes[19] === 2)) {
    bytes[18] = 1;
    bytes[19] = 1;
  }
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

async function createBackupFile(source: "MANUAL" | "AUTOMATIC"): Promise<{ file: File; envelope: BackupEnvelope }> {
  const business = BusinessConfigurationService.current();
  const deviceId = useDeviceStore.getState().device.deviceId;
  const database = await getDatabase();
  await database.execAsync("PRAGMA wal_checkpoint(FULL)");
  const bytes = forceRollbackJournalMode(await database.serializeAsync());
  const temp = new File(Paths.cache, `pos-${uuid()}.sqlite`);
  temp.create({ overwrite: true });
  temp.writeSync(bytes);
  const assets = (await Promise.all([
    readAsset("businessLogo", business.businessLogoUri),
    readAsset("receiptLogo", business.receiptLogoUri),
  ])).filter((asset): asset is BackupAsset => Boolean(asset));
  const draft: Omit<BackupEnvelope, "backupChecksum"> = {
    format: "nct-pos-backup", formatVersion: 2, schemaVersion: SCHEMA_VERSION,
    businessId: business.businessId, deviceId, createdAt: new Date().toISOString(),
    databaseChecksum: bytesToHex(sha256Bytes(bytes)), databaseBase64: await temp.base64(),
    assets, uiPreferences: exportUiPreferences(), totals: await databaseTotals(),
    source,
  };
  const envelope: BackupEnvelope = {
    ...draft,
    backupChecksum: bytesToHex(sha256Bytes(new TextEncoder().encode(backupIntegrityPayload(draft)))),
  };
  temp.delete();
  const directory = new Directory(Paths.document, "pos-backups");
  directory.create({ intermediates: true, idempotent: true });
  const file = new File(directory, `${business.businessId}-${source.toLowerCase()}-${uuid()}-${Date.now()}.nctposbackup`);
  file.create({ overwrite: false });
  file.writeSync(JSON.stringify(envelope));
  return { file, envelope };
}

export const RecoveryService = {
  async createBackup(options: { upload?: boolean } = {}): Promise<{ file: File; envelope: BackupEnvelope }> {
    await requirePermission("POS_BACKUP", "export database backups");
    const backup = await serializeLocalOperation(() => createBackupFile("MANUAL"));
    if (options.upload !== false) await queueCreatedBackup(backup.file, backup.envelope, `manual:${backup.envelope.createdAt}`);
    return backup;
  },

  async createAutoBackup(reference?: string): Promise<{ file: File; envelope: BackupEnvelope }> {
    const time = cachedBranchBackupTime(useDeviceStore.getState().device.branchId);
    return createQueuedAutomaticBackup(reference ?? nctBackupReference(new Date(), time));
  },

  async createEndOfDayBackup(reference: string): Promise<{ file: File; envelope: BackupEnvelope }> {
    return createQueuedAutomaticBackup(reference);
  },

  async listBackups(): Promise<BackupFileInfo[]> {
    const directory = new Directory(Paths.document, "pos-backups");
    if (!directory.exists) return [];
    let entries: (File | Directory)[] = [];
    try {
      entries = directory.list();
    } catch {
      return [];
    }
    return entries
      .filter((entry): entry is File => entry instanceof File && entry.name.endsWith(".nctposbackup") && entry.exists)
      .map((file) => {
        const stamp = /-(\d{10,})\.nctposbackup$/.exec(file.name)?.[1];
        const parsed = stamp ? new Date(Number(stamp)) : null;
        const createdAt = parsed && !Number.isNaN(parsed.valueOf()) ? parsed.toISOString() : new Date().toISOString();
        const source: BackupFileInfo["source"] = file.name.includes("-automatic-") ? "AUTOMATIC" : file.name.includes("-manual-") ? "MANUAL" : "LEGACY";
        return { name: file.name, uri: file.uri, size: file.size ?? 0, createdAt, source };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async deleteBackup(uri: string): Promise<void> {
    await requirePermission("POS_BACKUP", "delete database backups");
    const pending = await queryFirst<{ count: number }>("SELECT COUNT(*) count FROM SyncQueue WHERE entityType = 'DatabaseBackup' AND status IN ('PENDING','PROCESSING','FAILED') AND json_extract(payload, '$.fileUri') = ?", [uri]);
    if (pending?.count) throw new Error("This backup is waiting for cloud upload. Upload it before deleting the local file.");
    const file = new File(uri);
    if (file.exists) file.delete();
  },

  async queueBackupUpload(reference: string): Promise<{ backupId: string; fileUri: string }> {
    const currentBusiness = BusinessConfigurationService.current();
    const currentDeviceId = useDeviceStore.getState().device.deviceId;
    if (!currentDeviceId) throw new Error("Register the intended NCT device first.");
    const idempotencyKey = `${currentBusiness.businessId}:${currentDeviceId ?? "device"}:${reference}:backup`;
    const existing = await queryFirst<{ entityId: string }>(
      `SELECT entityId FROM SyncQueue
       WHERE dedupeKey = ? AND status IN ('PENDING', 'PROCESSING', 'SYNCED')
       ORDER BY createdAt DESC LIMIT 1`, [idempotencyKey]
    );
    if (existing) return { backupId: existing.entityId, fileUri: "Stored in the durable upload queue" };
    await requirePermission("POS_BACKUP", "upload database backups");
    const { file, envelope } = await serializeLocalOperation(() => createBackupFile("MANUAL"));
    const backupId = await queueCreatedBackup(file, envelope, reference);
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

  async restoreBackup(fileUri: string): Promise<void> {
    await requirePermission("POS_BACKUP", "restore database backups");
    const { restoreNctBackup } = await import("./nct-restore.service");
    return restoreNctBackup(fileUri);
  },
};

async function queueCreatedBackup(file: File, envelope: BackupEnvelope, reference: string) {
  if (!isNctPos()) throw new Error("NCT-dependent POS configuration is required.");
  const backupId = uuid();
  const idempotencyKey = `${envelope.businessId}:${envelope.deviceId}:${reference}:backup`;
  if (file.size > 32 * 1024 * 1024) throw new Error("Backup exceeds the 32 MiB cloud upload limit. Your local backup is retained.");
  await execute("INSERT INTO BackupManifest (id,businessId,deviceId,schemaVersion,databaseChecksum,status,createdAt) VALUES (?,?,?,?,?,'PENDING',?)", [backupId,envelope.businessId,envelope.deviceId,envelope.schemaVersion,envelope.databaseChecksum,envelope.createdAt]);
  // Keep bytes in the local backup file. Embedding snapshots in SyncQueue
  // would recursively inflate every later database backup.
  const queued = await SyncQueueService.enqueue("DatabaseBackup", backupId, "UPLOAD", {
    scope: "NCT",
    idempotencyKey, businessId: envelope.businessId, deviceId: envelope.deviceId,
    schemaVersion: envelope.schemaVersion, checksum: envelope.databaseChecksum,
    createdAt: envelope.createdAt, fileUri: file.uri,
    source: envelope.source ?? "LEGACY",
  }, idempotencyKey);
  if (!queued) throw new Error("Local backup saved, but cloud upload could not be queued. Please retry.");
  return backupId;
}

async function createQueuedAutomaticBackup(reference: string): Promise<{ file: File; envelope: BackupEnvelope }> {
  const deviceId = useDeviceStore.getState().device.deviceId;
  if (!deviceId) throw new Error("Register the intended NCT device before queueing backups.");
  const businessId = BusinessConfigurationService.current().businessId;
  const key = businessId + ":" + deviceId + ":" + reference + ":backup";
  const existing = await queryFirst<{ payload: string }>("SELECT payload FROM SyncQueue WHERE dedupeKey=? ORDER BY createdAt DESC LIMIT 1", [key]);
  if (existing) {
    const payload = JSON.parse(existing.payload);
    if (payload.scope !== "NCT") throw new Error("An unscoped historical backup needs review before retrying.");
    const file = new File(payload.fileUri);
    if (!file.exists) throw new Error("The queued backup file is missing. Review the queue before retrying.");
    return { file, envelope: await RecoveryService.validate(file.uri) };
  }
  const backup = await serializeLocalOperation(() => createBackupFile("AUTOMATIC"));
  await queueCreatedBackup(backup.file, backup.envelope, reference);
  return backup;
}

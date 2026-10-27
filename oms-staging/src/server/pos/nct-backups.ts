import { randomUUID } from "node:crypto";
import { z } from "zod";
import { uploadSchema, decodeBackup, BackupError } from "~/server/services/dealership-backups";
import { checksum } from "~/server/services/dealership-storage";
import { db } from "~/server/db";

export { BackupError, checksum };
export async function requireNctBackupSchema() {
  const [schema] = await db.$queryRaw<
    Array<{ ready: boolean }>
  >`SELECT to_regclass('pos.database_backups') IS NOT NULL AS ready`;
  if (!schema?.ready)
    throw new BackupError("NCT backup metadata is awaiting approved database setup", 503);
}
export class NctBackupStorage {
  private url(key: string) {
    const origin = process.env.NCT_POS_BACKUP_STORAGE_URL;
    if (!origin) throw new BackupError("NCT staging backup storage is not configured", 503);
    return `${origin.replace(/\/$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
  async get(key: string) {
    const response = await fetch(this.url(key), {
      cache: "no-store",
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new BackupError("NCT backup storage read failed", 503);
    return Buffer.from(await response.arrayBuffer());
  }
  async put(key: string, bytes: Buffer) {
    const response = await fetch(this.url(key), {
      method: "PUT",
      body: new Uint8Array(bytes),
      headers: { "Content-Type": "application/octet-stream" },
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok || checksum(await this.get(key)) !== checksum(bytes))
      throw new BackupError("NCT backup storage verification failed; retain the local file", 503);
  }
}
export interface NctBackupRow {
  id: string;
  deviceId: string;
  businessId: string;
  objectKey: string;
  contentHash: string;
  byteSize: number;
  schemaVersion: number;
  source: string;
  status: string;
  createdAt: Date;
}
export async function saveNctBackup(deviceId: string, raw: unknown) {
  await requireNctBackupSchema();
  // NCT's established business ID is nct-default, rather than a Dealership UUID.
  const parsed = uploadSchema.extend({ businessId: z.string().min(1).max(100) }).safeParse(raw);
  if (!parsed.success) throw new BackupError("Invalid NCT backup upload");
  const input = parsed.data;
  if (input.deviceId !== deviceId) throw new BackupError("Backup belongs to another device", 403);
  const bytes = decodeBackup(input),
    hash = checksum(bytes),
    id = randomUUID();
  const objectKey = `nct-pos/devices/${deviceId}/${id}.nctposbackup`;
  await db.$executeRaw`INSERT INTO pos.database_backups
    (id,device_id,business_id,client_key,object_key,content_hash,database_hash,byte_size,schema_version,source,source_created_at)
    VALUES (${id}::uuid,${deviceId},${input.businessId},${input.idempotencyKey},${objectKey},${hash},${input.checksum},${bytes.length},${input.schemaVersion},${input.source},${new Date(input.createdAt)})
    ON CONFLICT (device_id,client_key) DO NOTHING`;
  const [row] = await db.$queryRaw<
    Array<{ id: string; objectKey: string; contentHash: string; status: string }>
  >`
    SELECT id::text, object_key AS "objectKey", content_hash AS "contentHash", status
    FROM pos.database_backups WHERE device_id=${deviceId} AND client_key=${input.idempotencyKey}`;
  if (!row || row.contentHash !== hash)
    throw new BackupError("Backup key was already used with different content", 409);
  if (row.status !== "READY") {
    await new NctBackupStorage().put(row.objectKey, bytes);
    await db.$executeRaw`UPDATE pos.database_backups SET status='READY' WHERE id=${row.id}::uuid`;
  }
  return { backupId: row.id, checksum: hash, byteSize: bytes.length };
}

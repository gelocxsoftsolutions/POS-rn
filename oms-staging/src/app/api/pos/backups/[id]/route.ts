import { z } from "zod";
import { db } from "~/server/db";
import { auth } from "~/server/auth";
import { isAuthorizedPOS } from "~/lib/pos-auth";
import { userHasPermission } from "~/server/lib/permissions";
import { PERMISSIONS } from "~/lib/permissions";
import { backupFailure } from "~/server/services/dealership-http";
import { NctBackupStorage, requireNctBackupSchema, checksum, BackupError, type NctBackupRow } from "~/server/pos/nct-backups";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) throw new BackupError("Invalid backup ID");
    let deviceId: string | null = null;
    if (request.headers.has("x-pos-key")) {
      const device = await isAuthorizedPOS(request);
      if (!device.ok || !device.deviceId) throw new BackupError("Registered device required", 401);
      deviceId = device.deviceId;
    } else {
      const session = await auth();
      if (!session || !await userHasPermission({ db, session }, PERMISSIONS.MANAGE_POS_DEVICES)) throw new BackupError("POS device administration permission required", 403);
    }
    await requireNctBackupSchema();
    const [row] = await db.$queryRaw<NctBackupRow[]>`SELECT id::text,device_id AS "deviceId",object_key AS "objectKey",content_hash AS "contentHash" FROM pos.database_backups WHERE id=${id}::uuid AND status='READY'`;
    if (!row || (deviceId && row.deviceId !== deviceId)) throw new BackupError("Backup not found", 404);
    const bytes = await new NctBackupStorage().get(row.objectKey);
    if (checksum(bytes) !== row.contentHash) throw new BackupError("Stored backup integrity check failed", 503);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${id}.nctposbackup"`, "Cache-Control": "private, no-store", "X-Backup-SHA256": row.contentHash } });
  } catch (error) { return backupFailure(error); }
}

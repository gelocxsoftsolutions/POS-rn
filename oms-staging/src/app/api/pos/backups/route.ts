import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "~/server/db";
import { auth } from "~/server/auth";
import { isAuthorizedPOS } from "~/lib/pos-auth";
import { userHasPermission } from "~/server/lib/permissions";
import { PERMISSIONS } from "~/lib/permissions";
import { readBackupRequest, backupFailure } from "~/server/services/dealership-http";
import { saveNctBackup, requireNctBackupSchema, BackupError, type NctBackupRow } from "~/server/pos/nct-backups";

export const runtime = "nodejs";
let activeUploads = 0;
export async function POST(request: Request) {
  try {
    const device = await isAuthorizedPOS(request);
    if (!device.ok || !device.deviceId) throw new BackupError("Registered NCT device required", 401);
    if (await db.dealershipDevice.findUnique({ where: { posDeviceId: device.deviceId }, select: { id: true } })) throw new BackupError("NCT backup endpoint only", 403);
    if (activeUploads >= 2) throw new BackupError("Backup service busy; retry later", 429);
    activeUploads++;
    try { return NextResponse.json(await saveNctBackup(device.deviceId, await readBackupRequest(request))); }
    finally { activeUploads--; }
  } catch (error) { return backupFailure(error); }
}
export async function GET(request: Request) {
  try {
    let deviceId: string | undefined;
    if (request.headers.has("x-pos-key")) {
      const device = await isAuthorizedPOS(request);
      if (!device.ok || !device.deviceId) throw new BackupError("Registered device required", 401);
      deviceId = device.deviceId;
    } else {
      const session = await auth();
      if (!session || !await userHasPermission({ db, session }, PERMISSIONS.MANAGE_POS_DEVICES)) throw new BackupError("POS device administration permission required", 403);
    }
    await requireNctBackupSchema();
    const branch = new URL(request.url).searchParams.get("branchId");
    if (branch && !z.coerce.number().int().positive().safeParse(branch).success) throw new BackupError("Invalid branch");
    const backups = await db.$queryRaw<NctBackupRow[]>(Prisma.sql`
      SELECT b.id::text,b.device_id AS "deviceId",b.business_id AS "businessId",b.byte_size AS "byteSize",
        b.content_hash AS "contentHash",b.schema_version AS "schemaVersion",b.source,b.status,b.source_created_at AS "createdAt"
      FROM pos.database_backups b JOIN pos.pos_devices d ON d.id=b.device_id
      WHERE b.status='READY' ${deviceId ? Prisma.sql`AND b.device_id=${deviceId}` : Prisma.empty}
      ${branch ? Prisma.sql`AND d."branchId"=${BigInt(branch)}` : Prisma.empty}
      ORDER BY b.source_created_at DESC LIMIT 100`);
    return NextResponse.json({ backups }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return backupFailure(error); }
}

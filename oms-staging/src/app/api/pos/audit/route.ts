import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "~/server/db";
import { isAuthorizedPOS } from "~/lib/pos-auth";

const event = z.object({
  id: z.string().uuid(), action: z.string().min(1).max(100),
  cashierId: z.string().max(100).nullable(), cashierName: z.string().max(255).nullable(),
  entityType: z.string().max(50).nullable(), entityId: z.string().max(100).nullable(),
  description: z.string().max(1000).nullable(), metadata: z.record(z.unknown()).nullable(),
  createdAt: z.string().datetime({ offset: true }), branchId: z.number().int().positive(),
});
export async function POST(request: Request) {
  const auth = await isAuthorizedPOS(request);
  if (!auth.ok || !auth.deviceId) return NextResponse.json({ error: "Registered NCT device required" }, { status: 401 });
  if (await db.dealershipDevice.findUnique({ where: { posDeviceId: auth.deviceId }, select: { id: true } })) return NextResponse.json({ error: "NCT audit endpoint only" }, { status: 403 });
  const text = await request.text();
  if (text.length > 1024 * 1024) return NextResponse.json({ error: "Audit batch too large" }, { status: 413 });
  let body: unknown; try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = z.object({ events: z.array(event).min(1).max(50) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid audit batch" }, { status: 400 });
  const device = await db.posDevice.findUnique({ where: { id: auth.deviceId }, select: { branchId: true } });
  if (!device || parsed.data.events.some((e) => e.branchId !== Number(device.branchId))) return NextResponse.json({ error: "Audit branch mismatch" }, { status: 403 });
  try {
    await db.$transaction(async (tx) => {
      for (const e of parsed.data.events) {
        const previous = await tx.posAuditLog.findUnique({ where: { id: e.id }, select: { deviceId: true } });
        if (previous && previous.deviceId !== auth.deviceId) throw new Error("Audit event belongs to another device");
        await tx.posAuditLog.upsert({ where: { id: e.id }, update: {}, create: {
          id: e.id, deviceId: auth.deviceId, cashierUserId: e.cashierId, action: e.action,
          entityType: e.entityType, entityId: e.entityId, createdAt: new Date(e.createdAt),
          details: { source: "NCT_POS", branchId: e.branchId, cashierName: e.cashierName, description: e.description, metadata: e.metadata } as Prisma.InputJsonValue,
        } });
      }
    });
    return NextResponse.json({ acceptedIds: parsed.data.events.map((e) => e.id) });
  } catch (error) {
    console.error("NCT audit delivery failed", error);
    return NextResponse.json({ error: "Audit batch not accepted; retry later" }, { status: 503 });
  }
}

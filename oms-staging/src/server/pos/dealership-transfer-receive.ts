import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "~/server/db";
import { Prisma } from "@prisma/client";
import { isAuthorizedPOS } from "~/lib/pos-auth";

const bodySchema = z.object({
  transferId: z.number().int().positive(),
  deviceId: z.string().min(1),
});

export async function POST(request: Request) {
  const authz = await isAuthorizedPOS(request);
  if (!authz.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: authz.status });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { transferId, deviceId } = parsed.data;

  const transfers = await db.$queryRaw<
    {
      id: number;
      status: string;
      transfer_number: string;
    }[]
  >(
    Prisma.sql`SELECT id, status, transfer_number FROM pos.inventory_transfers WHERE id = ${transferId}`,
  );

  const transfer = transfers[0];
  if (!transfer) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  }

  if (transfer.status !== "APPROVED" && transfer.status !== "IN_TRANSIT") {
    return NextResponse.json(
      { error: `Cannot receive transfer with status ${transfer.status}` },
      { status: 400 },
    );
  }

  const now = new Date();
  await db.$executeRaw(
    Prisma.sql`UPDATE pos.inventory_transfers
      SET status = 'RECEIVED', received_by_id = ${deviceId}, received_at = ${now}
      WHERE id = ${transferId}`,
  );

  return NextResponse.json({
    success: true,
    transferNumber: transfer.transfer_number,
  });
}

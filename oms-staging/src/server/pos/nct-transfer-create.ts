import { TRPCError } from "@trpc/server";
import { getUserPermissionSet } from "~/server/lib/permissions";
import { PERMISSIONS } from "~/lib/permissions";

export async function createNctTransfer(
  ctx: any,
  input: {
    clientRequestId?: string;
    direction: string;
    targetDeviceId?: string;
    targetBranchId?: number;
    sourceBranchId?: number;
    notes?: string;
    items: Array<{
      variationId: number;
      productName: string;
      allocatedQty: number;
      variationName?: string;
      sku?: string;
      unit?: string;
    }>;
  },
) {
  if (!(await getUserPermissionSet(ctx)).has(PERMISSIONS.MANAGE_POS_INVENTORY))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "POS inventory management permission required.",
    });
  if (
    !input.clientRequestId ||
    !input.targetDeviceId ||
    !input.targetBranchId ||
    !input.items.length ||
    input.items.some(
      (i) =>
        !Number.isInteger(i.allocatedQty) ||
        i.allocatedQty <= 0 ||
        !Number.isInteger(i.variationId),
    )
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose a branch device and positive whole quantities.",
    });
  if (new Set(input.items.map((i) => i.variationId)).size !== input.items.length)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Combine duplicate product variations before creating a transfer.",
    });
  const number = `TRF-${new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10).replace(/-/g, "")}-${input.clientRequestId.replace(/-/g, "")}`;
  return ctx.db.$transaction(async (tx: any) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.clientRequestId}))::text`;
    // The UUID remains stable even if a retry crosses Philippine midnight.
    const suffix = input.clientRequestId!.replace(/-/g, "");
    const existing = await tx.inventoryTransfer.findFirst({
      where: { transferNumber: { endsWith: suffix } },
      include: { items: true },
    });
    if (existing) {
      const normalize = (items: Array<{ variationId: number; allocatedQty: number }>) =>
        JSON.stringify(
          items
            .map((i) => ({ variationId: i.variationId, allocatedQty: i.allocatedQty }))
            .sort((a, b) => a.variationId - b.variationId),
        );
      if (
        existing.direction !== input.direction ||
        existing.targetDeviceId !== input.targetDeviceId ||
        existing.targetBranchId !== input.targetBranchId ||
        (existing.notes ?? "") !== (input.notes ?? "") ||
        normalize(existing.items) !== normalize(input.items)
      )
        throw new TRPCError({
          code: "CONFLICT",
          message: "Transfer request ID already used with different data.",
        });
      return { id: existing.id, transferNumber: existing.transferNumber, duplicate: true };
    }
    const device = await tx.posDevice.findUnique({
      where: { id: input.targetDeviceId },
      select: { branchId: true, status: true },
    });
    if (!device || device.status === "DISABLED" || Number(device.branchId) !== input.targetBranchId)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Choose an enabled device in this branch.",
      });
    const ids = input.items.map((i) => i.variationId);
    const variations = await tx.productVariation.count({
      where: { id: { in: ids }, deleted_at: null },
    });
    if (variations !== ids.length)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "A selected product is no longer available. Refresh products.",
      });
    const created = await tx.inventoryTransfer.create({
      data: {
        transferNumber: number,
        direction: input.direction,
        targetDeviceId: input.targetDeviceId,
        targetBranchId: input.targetBranchId,
        sourceBranchId: input.sourceBranchId,
        createdByName: ctx.session.user.name ?? null,
        notes: input.notes ?? null,
        items: { create: input.items },
      },
    });
    await tx.posAuditLog.create({
      data: {
        deviceId: input.targetDeviceId,
        action: "TRANSFER_CREATED",
        entityType: "InventoryTransfer",
        entityId: String(created.id),
        details: {
          actorId: String(ctx.session.user.id),
          branchId: input.targetBranchId,
          transferNumber: number,
        },
      },
    });
    return { id: created.id, transferNumber: number, duplicate: false };
  });
}

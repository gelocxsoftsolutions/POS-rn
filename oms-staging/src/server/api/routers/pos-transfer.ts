import { dependentConnectionWhere } from "~/server/services/dealership-mode-switch";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { Prisma } from "@prisma/client";
import { createNctTransfer } from "~/server/pos/nct-transfer-create";
import { isDealershipOperator } from "~/server/pos/dealership-procedure";
import { getUserPermissionSet } from "~/server/lib/permissions";
import { PERMISSIONS } from "~/lib/permissions";

export function createPosTransferRouter(procedure = protectedProcedure) { return createTRPCRouter({
  list: procedure
    .input(
      z.object({
        status: z.string().optional(),
        branchId: z.number().optional(),
        deviceId: z.string().optional(),
        page: z.number().default(1),
        pageSize: z.number().default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { status, branchId, deviceId, page, pageSize } = input;
      const offset = (page - 1) * pageSize;

      let countSql: Prisma.Sql;
      let listSql: Prisma.Sql;

      if (branchId && status && deviceId) {
        countSql = Prisma.sql`SELECT COUNT(*) as count FROM pos.inventory_transfers t WHERE t.status = ${status} AND t.target_device_id = ${deviceId} AND (t.target_branch_id = ${branchId} OR t.target_device_id IN (SELECT id::text FROM pos.pos_devices WHERE "branchId" = ${branchId}))`;
        listSql = Prisma.sql`SELECT t.id, t.transfer_number, t.status, t.direction, t.source_branch_id, t.target_branch_id, t.target_device_id, t.created_by_id, t.created_by_name, t.created_at, t.approved_by_name, t.approved_at, t.received_by_id, t.received_at, t.notes, (SELECT COUNT(*)::int FROM pos.inventory_transfer_items i WHERE i.transfer_id = t.id) as item_count FROM pos.inventory_transfers t WHERE t.status = ${status} AND t.target_device_id = ${deviceId} AND (t.target_branch_id = ${branchId} OR t.target_device_id IN (SELECT id::text FROM pos.pos_devices WHERE "branchId" = ${branchId})) ORDER BY t.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`;
      } else if (branchId && status) {
        countSql = Prisma.sql`SELECT COUNT(*) as count FROM pos.inventory_transfers t WHERE t.status = ${status} AND (t.target_branch_id = ${branchId} OR t.target_device_id IN (SELECT id::text FROM pos.pos_devices WHERE "branchId" = ${branchId}))`;
        listSql = Prisma.sql`SELECT t.id, t.transfer_number, t.status, t.direction, t.source_branch_id, t.target_branch_id, t.target_device_id, t.created_by_id, t.created_by_name, t.created_at, t.approved_by_name, t.approved_at, t.received_by_id, t.received_at, t.notes, (SELECT COUNT(*)::int FROM pos.inventory_transfer_items i WHERE i.transfer_id = t.id) as item_count FROM pos.inventory_transfers t WHERE t.status = ${status} AND (t.target_branch_id = ${branchId} OR t.target_device_id IN (SELECT id::text FROM pos.pos_devices WHERE "branchId" = ${branchId})) ORDER BY t.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`;
      } else if (branchId && deviceId) {
        countSql = Prisma.sql`SELECT COUNT(*) as count FROM pos.inventory_transfers t WHERE t.target_device_id = ${deviceId} AND (t.target_branch_id = ${branchId} OR t.target_device_id IN (SELECT id::text FROM pos.pos_devices WHERE "branchId" = ${branchId}))`;
        listSql = Prisma.sql`SELECT t.id, t.transfer_number, t.status, t.direction, t.source_branch_id, t.target_branch_id, t.target_device_id, t.created_by_id, t.created_by_name, t.created_at, t.approved_by_name, t.approved_at, t.received_by_id, t.received_at, t.notes, (SELECT COUNT(*)::int FROM pos.inventory_transfer_items i WHERE i.transfer_id = t.id) as item_count FROM pos.inventory_transfers t WHERE t.target_device_id = ${deviceId} AND (t.target_branch_id = ${branchId} OR t.target_device_id IN (SELECT id::text FROM pos.pos_devices WHERE "branchId" = ${branchId})) ORDER BY t.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`;
      } else if (branchId) {
        countSql = Prisma.sql`SELECT COUNT(*) as count FROM pos.inventory_transfers t WHERE (t.target_branch_id = ${branchId} OR t.target_device_id IN (SELECT id::text FROM pos.pos_devices WHERE "branchId" = ${branchId}))`;
        listSql = Prisma.sql`SELECT t.id, t.transfer_number, t.status, t.direction, t.source_branch_id, t.target_branch_id, t.target_device_id, t.created_by_id, t.created_by_name, t.created_at, t.approved_by_name, t.approved_at, t.received_by_id, t.received_at, t.notes, (SELECT COUNT(*)::int FROM pos.inventory_transfer_items i WHERE i.transfer_id = t.id) as item_count FROM pos.inventory_transfers t WHERE (t.target_branch_id = ${branchId} OR t.target_device_id IN (SELECT id::text FROM pos.pos_devices WHERE "branchId" = ${branchId})) ORDER BY t.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`;
      } else if (status && deviceId) {
        countSql = Prisma.sql`SELECT COUNT(*) as count FROM pos.inventory_transfers t WHERE t.status = ${status} AND t.target_device_id = ${deviceId}`;
        listSql = Prisma.sql`SELECT t.id, t.transfer_number, t.status, t.direction, t.source_branch_id, t.target_branch_id, t.target_device_id, t.created_by_id, t.created_by_name, t.created_at, t.approved_by_name, t.approved_at, t.received_by_id, t.received_at, t.notes, (SELECT COUNT(*)::int FROM pos.inventory_transfer_items i WHERE i.transfer_id = t.id) as item_count FROM pos.inventory_transfers t WHERE t.status = ${status} AND t.target_device_id = ${deviceId} ORDER BY t.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`;
      } else if (status) {
        countSql = Prisma.sql`SELECT COUNT(*) as count FROM pos.inventory_transfers t WHERE t.status = ${status}`;
        listSql = Prisma.sql`SELECT t.id, t.transfer_number, t.status, t.direction, t.source_branch_id, t.target_branch_id, t.target_device_id, t.created_by_id, t.created_by_name, t.created_at, t.approved_by_name, t.approved_at, t.received_by_id, t.received_at, t.notes, (SELECT COUNT(*)::int FROM pos.inventory_transfer_items i WHERE i.transfer_id = t.id) as item_count FROM pos.inventory_transfers t WHERE t.status = ${status} ORDER BY t.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`;
      } else if (deviceId) {
        countSql = Prisma.sql`SELECT COUNT(*) as count FROM pos.inventory_transfers t WHERE t.target_device_id = ${deviceId}`;
        listSql = Prisma.sql`SELECT t.id, t.transfer_number, t.status, t.direction, t.source_branch_id, t.target_branch_id, t.target_device_id, t.created_by_id, t.created_by_name, t.created_at, t.approved_by_name, t.approved_at, t.received_by_id, t.received_at, t.notes, (SELECT COUNT(*)::int FROM pos.inventory_transfer_items i WHERE i.transfer_id = t.id) as item_count FROM pos.inventory_transfers t WHERE t.target_device_id = ${deviceId} ORDER BY t.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`;
      } else {
        countSql = Prisma.sql`SELECT COUNT(*) as count FROM pos.inventory_transfers t`;
        listSql = Prisma.sql`SELECT t.id, t.transfer_number, t.status, t.direction, t.source_branch_id, t.target_branch_id, t.target_device_id, t.created_by_id, t.created_by_name, t.created_at, t.approved_by_name, t.approved_at, t.received_by_id, t.received_at, t.notes, (SELECT COUNT(*)::int FROM pos.inventory_transfer_items i WHERE i.transfer_id = t.id) as item_count FROM pos.inventory_transfers t ORDER BY t.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`;
      }

      const countResult = await ctx.db.$queryRaw<[{ count: bigint }]>(countSql);
      const total = Number(countResult[0]?.count ?? 0);

      const transfers = await ctx.db.$queryRaw<
        {
          id: number;
          transfer_number: string;
          status: string;
          direction: string;
          source_branch_id: number | null;
          target_branch_id: number | null;
          target_device_id: string | null;
          created_by_id: number | null;
          created_by_name: string | null;
          created_at: Date;
          approved_by_name: string | null;
          approved_at: Date | null;
          received_by_id: string | null;
          received_at: Date | null;
          notes: string | null;
          item_count: bigint;
        }[]
      >(listSql);

      return {
        transfers: transfers.map((t) => ({
          id: t.id,
          transferNumber: t.transfer_number,
          status: t.status,
          direction: t.direction,
          sourceBranchId: t.source_branch_id,
          targetBranchId: t.target_branch_id,
          targetDeviceId: t.target_device_id,
          createdById: t.created_by_id,
          createdByName: t.created_by_name,
          createdAt: t.created_at?.toISOString?.() ?? null,
          approvedByName: t.approved_by_name,
          approvedAt: t.approved_at?.toISOString?.() ?? null,
          receivedById: t.received_by_id,
          receivedAt: t.received_at?.toISOString?.() ?? null,
          notes: t.notes,
          itemCount: Number(t.item_count),
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    }),

  getById: procedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const transfers = await ctx.db.$queryRaw<
        {
          id: number;
          transfer_number: string;
          status: string;
          direction: string;
          source_branch_id: number | null;
          target_branch_id: number | null;
          target_device_id: string | null;
          created_by_id: number | null;
          created_by_name: string | null;
          created_at: Date;
          approved_by_name: string | null;
          approved_at: Date | null;
          received_by_id: string | null;
          received_by_name: string | null;
          received_at: Date | null;
          notes: string | null;
        }[]
      >(
        Prisma.sql`SELECT * FROM pos.inventory_transfers WHERE id = ${input.id}`,
      );

      const transfer = transfers[0];
      if (!transfer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Transfer not found" });
      }

      const items = await ctx.db.$queryRaw<
        {
          id: number;
          transfer_id: number;
          variation_id: number;
          product_name: string;
          variation_name: string | null;
          sku: string | null;
          allocated_qty: number;
          received_qty: number | null;
          unit: string | null;
          notes: string | null;
        }[]
      >(
        Prisma.sql`SELECT * FROM pos.inventory_transfer_items WHERE transfer_id = ${input.id}`,
      );

      return {
        id: transfer.id,
        transferNumber: transfer.transfer_number,
        status: transfer.status,
        direction: transfer.direction,
        sourceBranchId: transfer.source_branch_id,
        targetBranchId: transfer.target_branch_id,
        targetDeviceId: transfer.target_device_id,
        createdById: transfer.created_by_id,
        createdByName: transfer.created_by_name,
        createdAt: transfer.created_at?.toISOString?.() ?? null,
        approvedByName: transfer.approved_by_name,
        approvedAt: transfer.approved_at?.toISOString?.() ?? null,
        receivedById: transfer.received_by_id,
        receivedByName: transfer.received_by_name,
        receivedAt: transfer.received_at?.toISOString?.() ?? null,
        notes: transfer.notes,
        items: items.map((i) => ({
          id: i.id,
          transferId: i.transfer_id,
          variationId: i.variation_id,
          productName: i.product_name,
          variationName: i.variation_name,
          sku: i.sku,
          allocatedQty: i.allocated_qty,
          receivedQty: i.received_qty,
          unit: i.unit,
          notes: i.notes,
        })),
      };
    }),

  stats: procedure
    .input(z.object({ branchId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.$queryRaw<
        { status: string; count: bigint }[]
      >(
        input.branchId
          ? Prisma.sql`SELECT status, COUNT(*)::int as count FROM pos.inventory_transfers WHERE (target_branch_id = ${input.branchId} OR target_device_id IN (SELECT id::text FROM pos.pos_devices WHERE "branchId" = ${input.branchId})) GROUP BY status`
          : Prisma.sql`SELECT status, COUNT(*)::int as count FROM pos.inventory_transfers GROUP BY status`,
      );

      const stats = {
        pending: 0,
        approved: 0,
        inTransit: 0,
        received: 0,
        rejected: 0,
        cancelled: 0,
        total: 0,
      };

      for (const row of rows) {
        const count = Number(row.count);
        stats.total += count;
        switch (row.status) {
          case "PENDING":
            stats.pending = count;
            break;
          case "APPROVED":
            stats.approved = count;
            break;
          case "IN_TRANSIT":
            stats.inTransit = count;
            break;
          case "RECEIVED":
            stats.received = count;
            break;
          case "REJECTED":
            stats.rejected = count;
            break;
          case "CANCELLED":
            stats.cancelled = count;
            break;
        }
      }

      return stats;
    }),

  create: procedure
    .input(
      z.object({
        clientRequestId: z.string().uuid().optional(),
        direction: z.enum(["INVENTORY_TO_POS", "POS_TO_INVENTORY"]),
        dealershipId: z.string().uuid().optional(),
        targetDeviceId: z.string().optional(),
        targetBranchId: z.number().optional(),
        sourceBranchId: z.number().optional(),
        items: z.array(
          z.object({
            variationId: z.number(),
            productName: z.string(),
            variationName: z.string().optional(),
            sku: z.string().optional(),
            allocatedQty: z.number().min(1),
            unit: z.string().optional(),
          }),
        ),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isDealershipOperator(ctx)) return createNctTransfer(ctx, input);
      if (input.items.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "At least one item is required" });
      }

      if ((ctx.session.user as { posScope?: string }).posScope === "dealership" && !input.targetDeviceId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a dealership device" });
      if (input.targetDeviceId) {
        const target = await ctx.db.posDevice.findUnique({ where: { id: input.targetDeviceId }, select: { id: true, status: true, branchId: true } });
        if (!target || target.status === "DISABLED" || (input.targetBranchId && Number(target.branchId) !== input.targetBranchId)) throw new TRPCError({ code: "BAD_REQUEST", message: "The target device does not belong to this module and branch" });
      }
      if ((ctx.session.user as { posScope?: string }).posScope === "dealership") {
        if (!input.dealershipId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a dealership" });
        const connection = await ctx.db.dealershipDevice.findFirst({ where: { dealershipId: input.dealershipId, posDeviceId: input.targetDeviceId, enabled: true, ...dependentConnectionWhere } });
        if (!connection) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an enabled device belonging to this dealership" });
      }
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
      const seqResult = await ctx.db.$queryRaw<[{ seq: bigint }]>(
        Prisma.sql`SELECT COUNT(*) + 1 as seq FROM pos.inventory_transfers WHERE transfer_number LIKE ${`TRF-${dateStr}-%`}`,
      );
      const seq = Number(seqResult[0]?.seq ?? 1);
      const transferNumber = `TRF-${dateStr}-${String(seq).padStart(4, "0")}`;

      const user = ctx.session.user as any;
      const userId = user.id ? Number.parseInt(user.id, 10) : null;
      const userName = user.name ?? null;

      const transfer = await ctx.db.$queryRaw<
        { id: number }[]
      >(
        Prisma.sql`INSERT INTO pos.inventory_transfers
          (transfer_number, status, direction, source_branch_id, target_branch_id, target_device_id, created_by_id, created_by_name, notes, created_at)
        VALUES
          (${transferNumber}, 'PENDING', ${input.direction}, ${input.sourceBranchId ?? null}, ${input.targetBranchId ?? null}, ${input.targetDeviceId ?? null}, ${userId}, ${userName}, ${input.notes ?? null}, ${now})
        RETURNING id`,
      );

      const transferId = transfer[0]!.id;

      for (const item of input.items) {
        await ctx.db.$executeRaw(
          Prisma.sql`INSERT INTO pos.inventory_transfer_items
            (transfer_id, variation_id, product_name, variation_name, sku, allocated_qty, unit)
          VALUES
            (${transferId}, ${item.variationId}, ${item.productName}, ${item.variationName ?? null}, ${item.sku ?? null}, ${item.allocatedQty}, ${item.unit ?? null})`,
        );
      }

      return {
        id: transferId,
        transferNumber,
      };
    }),

  approve: procedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!isDealershipOperator(ctx) && !(await getUserPermissionSet(ctx)).has(PERMISSIONS.MANAGE_POS_INVENTORY)) throw new TRPCError({ code: "FORBIDDEN", message: "POS inventory management permission required." });
      const transfers = await ctx.db.$queryRaw<
        { id: number; status: string; direction: string; target_device_id: string | null; target_branch_id: number | null }[]
      >(
        Prisma.sql`SELECT id, status, direction, target_device_id, target_branch_id FROM pos.inventory_transfers WHERE id = ${input.id}`,
      );

      const transfer = transfers[0];
      if (!transfer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Transfer not found" });
      }
      if (transfer.status !== "PENDING") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot approve transfer with status ${transfer.status}` });
      }

      const user = ctx.session.user as any;
      const userId = user.id ? Number.parseInt(user.id, 10) : null;
      const userName = user.name ?? null;
      // Superusers and legacy users have independent ID spaces. Only a verified
      // legacy user may populate the stock log's foreign key to public.users.
      const actorType = user.userType ?? "legacyuser";
      const legacyActor = actorType === "legacyuser" && Number.isSafeInteger(userId)
        ? await ctx.db.legacyUser.findUnique({ where: { id: userId! }, select: { id: true } }) : null;
      const performedById = legacyActor?.id ?? null;
      const now = new Date();

      const items = await ctx.db.$queryRaw<
        { variation_id: number; allocated_qty: number }[]
      >(
        Prisma.sql`SELECT variation_id, allocated_qty FROM pos.inventory_transfer_items WHERE transfer_id = ${input.id}`,
      );

      function toGroupKeyLocal(vId: number, stockGroupId?: string | null) {
        if (stockGroupId && stockGroupId.trim().length > 0) return `group:${stockGroupId}`;
        return `var:${vId}`;
      }

      const targetDeviceId = (transfer as any).target_device_id ?? "";
      await ctx.db.$transaction(async (tx) => {
        if (!isDealershipOperator(ctx)) {
          const [locked] = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM pos.inventory_transfers WHERE id=${input.id} FOR UPDATE`;
          if (locked?.status === "APPROVED" || locked?.status === "IN_TRANSIT" || locked?.status === "RECEIVED") return;
          if (locked?.status !== "PENDING") throw new TRPCError({ code: "CONFLICT", message: "Transfer status changed. Refresh before retrying." });
        }
        if (transfer.direction === "INVENTORY_TO_POS") {
          for (const item of items) {
            const v = await (tx as any).productVariation.findUnique({
              where: { id: item.variation_id },
              select: { id: true, stock: true, stockGroupId: true, product_id: true },
            });
            if (!v) {
              throw new TRPCError({ code: "NOT_FOUND", message: `Variation ${item.variation_id} not found` });
            }
            const groupVariationIds: number[] = v.stockGroupId
              ? (await (tx as any).productVariation.findMany({
                  where: { product_id: v.product_id, stockGroupId: v.stockGroupId },
                  select: { id: true },
                })).map((x: { id: number }) => x.id)
              : [v.id];

            const groupKey = toGroupKeyLocal(v.id, v.stockGroupId);

            await tx.$queryRaw(Prisma.sql`SELECT id FROM public.product_variations WHERE id IN (${Prisma.join(groupVariationIds)}) ORDER BY id FOR UPDATE`);
            // Read current warehouse quantities while holding their transaction locks.
            const groupStocks: Array<{ stock: number | null }> =
              groupVariationIds.length > 1
                ? await (tx as any).productVariation.findMany({
                    where: { id: { in: groupVariationIds } },
                    select: { stock: true },
                  })
                : await tx.productVariation.findMany({ where: { id: v.id }, select: { stock: true } });

            const minStock = Math.min(...groupStocks.map((s) => s.stock ?? 0));
            if (minStock < item.allocated_qty) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Insufficient inventory stock for variation ${item.variation_id}. Available: ${minStock}, requested: ${item.allocated_qty}`,
              });
            }

            await (tx as any).productVariation.updateMany({
              where: { id: { in: groupVariationIds } },
              data: { stock: { decrement: item.allocated_qty } },
            });

            await tx.$executeRaw(
              Prisma.sql`INSERT INTO pos.pos_inventories ("groupKey", "stockGroupId", "variationId", "deviceId", qty, updated_at)
                VALUES (${groupKey}, ${v.stockGroupId ?? null}, ${v.id}, ${targetDeviceId}, ${item.allocated_qty}, ${now})
                ON CONFLICT ("groupKey", "deviceId") DO UPDATE SET qty = pos.pos_inventories.qty + ${item.allocated_qty}, "stockGroupId" = EXCLUDED."stockGroupId", "variationId" = EXCLUDED."variationId"`,
            );

            await tx.$executeRaw(
              Prisma.sql`INSERT INTO pos.pos_stock_transfer_logs (direction, "variationId", "groupKey", qty, "deviceId", "performedById", created_at)
                VALUES ('INVENTORY_TO_POS', ${v.id}, ${groupKey}, ${item.allocated_qty}, ${targetDeviceId}, ${performedById}, ${now})`,
            );
          }
        } else {
          for (const item of items) {
            const v = await (tx as any).productVariation.findUnique({
              where: { id: item.variation_id },
              select: { id: true, stockGroupId: true, product_id: true },
            });
            if (!v) {
              throw new TRPCError({ code: "NOT_FOUND", message: `Variation ${item.variation_id} not found` });
            }
            const groupKey = toGroupKeyLocal(v.id, v.stockGroupId);
            const groupVariationIds: number[] = v.stockGroupId
              ? (await (tx as any).productVariation.findMany({
                  where: { product_id: v.product_id, stockGroupId: v.stockGroupId },
                  select: { id: true },
                })).map((x: { id: number }) => x.id)
              : [v.id];

            const posRow = await (tx as any).posInventory.findUnique({
              where: { groupKey_deviceId: { groupKey, deviceId: targetDeviceId } },
              select: { id: true, qty: true },
            });
            const currentQty = posRow?.qty ?? 0;
            if (currentQty < item.allocated_qty) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Insufficient POS stock for variation ${item.variation_id} (${groupKey}) on device ${targetDeviceId || "general"}. Available: ${currentQty}, requested: ${item.allocated_qty}`,
              });
            }

            await (tx as any).posInventory.update({
              where: { id: posRow.id },
              data: { qty: { decrement: item.allocated_qty } },
            });

            await (tx as any).productVariation.updateMany({
              where: { id: { in: groupVariationIds } },
              data: { stock: { increment: item.allocated_qty } },
            });

            await tx.$executeRaw(
              Prisma.sql`INSERT INTO pos.pos_stock_transfer_logs (direction, "variationId", "groupKey", qty, "deviceId", "performedById", created_at)
                VALUES ('POS_TO_INVENTORY', ${v.id}, ${groupKey}, ${item.allocated_qty}, ${targetDeviceId}, ${performedById}, ${now})`,
            );
          }
        }

        await tx.$executeRaw(
          Prisma.sql`UPDATE pos.inventory_transfers
            SET status = 'APPROVED', approved_by_id = ${userId}, approved_by_name = ${userName}, approved_at = ${now}
            WHERE id = ${input.id}`,
        );
        await tx.posAuditLog.create({ data: {
          deviceId: targetDeviceId || null, action: "TRANSFER_APPROVED", entityType: "InventoryTransfer", entityId: String(input.id),
          details: { actorId: String(user.id), actorType, actorName: userName, direction: transfer.direction },
        } });
      });

      return { success: true };
    }),

  reject: procedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!isDealershipOperator(ctx)) {
        if (!(await getUserPermissionSet(ctx)).has(PERMISSIONS.MANAGE_POS_INVENTORY)) throw new TRPCError({ code: "FORBIDDEN" });
        const updated = await ctx.db.inventoryTransfer.updateMany({ where: { id: input.id, status: "PENDING" }, data: { status: "REJECTED" } });
        if (updated.count !== 1) throw new TRPCError({ code: "CONFLICT", message: "Transfer status changed; refresh before retrying." });
        return { success: true };
      }
      const transfers = await ctx.db.$queryRaw<{ id: number; status: string }[]>(
        Prisma.sql`SELECT id, status FROM pos.inventory_transfers WHERE id = ${input.id}`,
      );

      const transfer = transfers[0];
      if (!transfer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Transfer not found" });
      }
      if (transfer.status !== "PENDING") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot reject transfer with status ${transfer.status}` });
      }

      await ctx.db.$executeRaw(
        Prisma.sql`UPDATE pos.inventory_transfers SET status = 'REJECTED' WHERE id = ${input.id}`,
      );

      return { success: true };
    }),

  receive: procedure
    .input(z.object({ id: z.number(), deviceId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!isDealershipOperator(ctx)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Receive this transfer on its intended POS device using the receipt checklist." });
      const transfers = await ctx.db.$queryRaw<{ id: number; status: string }[]>(
        Prisma.sql`SELECT id, status FROM pos.inventory_transfers WHERE id = ${input.id}`,
      );

      const transfer = transfers[0];
      if (!transfer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Transfer not found" });
      }
      if (transfer.status !== "APPROVED" && transfer.status !== "IN_TRANSIT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot receive transfer with status ${transfer.status}`,
        });
      }

      const now = new Date();
      const receivedById = input.deviceId ?? null;

      await ctx.db.$executeRaw(
        Prisma.sql`UPDATE pos.inventory_transfers
          SET status = 'RECEIVED', received_by_id = ${receivedById}, received_at = ${now}
          WHERE id = ${input.id}`,
      );

      const updated = await ctx.db.$queryRaw<[{ transfer_number: string }[]]>(
        Prisma.sql`SELECT transfer_number FROM pos.inventory_transfers WHERE id = ${input.id}`,
      );

      return {
        success: true,
        transferNumber: updated[0]?.[0]?.transfer_number ?? "",
      };
    }),
}); }
export const posTransferRouter = createPosTransferRouter();


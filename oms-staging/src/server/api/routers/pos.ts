"use strict";

import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { PERMISSIONS } from "~/lib/permissions";
import { createSalesReportProcedure } from "~/server/pos/sales-report";

function toGroupKey(input: { variationId: number; stockGroupId?: string | null }) {
  if (input.stockGroupId && input.stockGroupId.trim().length > 0) {
    return `group:${input.stockGroupId}`;
  }
  return `var:${input.variationId}`;
}

type TxDb = { posInventory?: object; posSale?: object; posStockTransferLog?: object };

function requirePosDelegates(tx: unknown) {
  const db = (tx ?? {}) as TxDb;
  const posInventory = db.posInventory;
  const posSale = db.posSale;
  const posStockTransferLog = db.posStockTransferLog;

  if (!("upsert" in (posInventory ?? {}) && "findUnique" in (posInventory ?? {}) && "update" in (posInventory ?? {}))) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "POS tables are not initialized. Run: npx prisma db execute --file prisma/migrations/SAFE_add_pos_models.sql, then npx prisma generate, then restart the dev server.",
    });
  }

  if (!("create" in (posSale ?? {}))) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "POS tables are not initialized. Run: npx prisma db execute --file prisma/migrations/SAFE_add_pos_models.sql, then npx prisma generate, then restart the dev server.",
    });
  }

  if (!("create" in (posStockTransferLog ?? {}))) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "POS tables are not initialized. Run: npx prisma db execute --file prisma/migrations/SAFE_add_pos_models.sql, then npx prisma generate, then restart the dev server.",
    });
  }

  const client = tx as Prisma.TransactionClient;
  return {
    posInventory: client.posInventory,
    posSale: client.posSale,
    posStockTransferLog: client.posStockTransferLog,
  };
}

async function resolveLegacyActorId(input: {
  db: {
    legacyUser: {
      findUnique(args: { where: { id: number }; select: { id: true } }): Promise<{ id: number } | null>;
    };
  };
  sessionUser: {
    id?: string;
    userType?: string;
  };
}) {
  if (input.sessionUser.userType !== "legacyuser") {
    return null;
  }

  const parsedUserId = Number.parseInt(input.sessionUser.id ?? "", 10);
  if (!Number.isInteger(parsedUserId)) {
    return null;
  }

  const legacyUser = await input.db.legacyUser.findUnique({
    where: { id: parsedUserId },
    select: { id: true },
  });

  return legacyUser?.id ?? null;
}

async function hasPosPermission(input: {
  db: any;
  sessionUser: {
    id?: string;
    userType?: string;
    isAdmin?: boolean;
  };
  requiredPermissions: string[];
}) {
  if ((input.sessionUser as { posScope?: string }).posScope === "dealership") return true;
  if (input.sessionUser.userType === "superuser" || input.sessionUser.isAdmin) {
    return true;
  }

  const parsedUserId = Number.parseInt(input.sessionUser.id ?? "", 10);
  if (!Number.isInteger(parsedUserId)) {
    return false;
  }

  const legacyUser = await input.db.legacyUser.findUnique({
    where: { id: parsedUserId },
    include: {
      userPermissions: { include: { permission: true } },
      position: {
        include: {
          defaultPermissions: {
            include: { permission: true },
          },
        },
      },
    },
  });

  if (!legacyUser) {
    return false;
  }

  const permissionNames = new Set<string>();
  legacyUser.userPermissions?.forEach((up: { permission: { name: string } }) => {
    permissionNames.add(up.permission.name);
  });

  const departmentId = legacyUser.departmentId ? Number(legacyUser.departmentId) : null;
  legacyUser.position?.defaultPermissions?.forEach((dp: { permission: { name: string }; departmentId: bigint | null }) => {
    if (departmentId == null || dp.departmentId == null || Number(dp.departmentId) === departmentId) {
      permissionNames.add(dp.permission.name);
    }
  });

  return input.requiredPermissions.some((permission) => permissionNames.has(permission));
}

export function createPosRouter(procedure = protectedProcedure) { return createTRPCRouter({
  getSummaryReport: createSalesReportProcedure("pos"),
  searchVariations: procedure
    .input(
      z.object({
        search: z.string().trim().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const search = input.search?.trim();

      const variations = await ctx.db.productVariation.findMany({
        where: {
          deleted_at: null,
          ...(search
            ? {
                OR: [
                  { product_name: { contains: search, mode: "insensitive" } },
                  { product_variation_name: { contains: search, mode: "insensitive" } },
                  { product: { name: { contains: search, mode: "insensitive" } } },
                  ...(Number.isInteger(Number(search)) ? [{ id: Number(search) }] : []),
                ],
              }
              : {}),
        },
        take: input.limit,
        orderBy: [{ product_id: "asc" }, { id: "asc" }],
        include: {
          unit: true,
          product: {
            select: { id: true, name: true, image_url: true },
          },
        },
      });

      return variations.map((v) => {
        const groupKey = toGroupKey({ variationId: v.id, stockGroupId: v.stockGroupId });
        return {
          id: v.id,
          productId: v.product_id,
          productName: v.product?.name ?? v.product_name ?? "",
          variationName: v.product_variation_name ?? "",
          barcode: v.barcode ?? null,
          stockGroupId: v.stockGroupId ?? null,
          groupKey,
          stock: v.stock ?? 0,
          posPrice: Number(v.pos_price ?? 0),
          price: Number(v.price ?? 0),
          unit: v.unit?.name ?? null,
          weight: Number(v.weight ?? 0),
          imageUrl: v.product?.image_url ?? null,
        };
      });
    }),

  getInventory: procedure
    .input(
      z.object({
        search: z.string().trim().optional(),
        limit: z.number().int().min(1).max(500).default(100),
        deviceId: z.string().optional(),
        branchId: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const search = input.search?.trim();

      const whereBase: any = {};
      if (input.deviceId && input.deviceId !== "ALL") {
        whereBase.deviceId = input.deviceId;
      }

      const items = await ctx.db.posInventory.findMany({
        where: search
          ? {
              ...whereBase,
              OR: [
                { variation: { product: { name: { contains: search, mode: "insensitive" } } } },
                { variation: { product_name: { contains: search, mode: "insensitive" } } },
                { variation: { product_variation_name: { contains: search, mode: "insensitive" } } },
                { groupKey: { contains: search, mode: "insensitive" } },
              ],
            }
          : Object.keys(whereBase).length > 0 ? whereBase : undefined,
        take: input.limit,
        orderBy: [{ qty: "desc" }, { id: "asc" }],
        include: {
          variation: {
            include: {
              unit: true,
              area: { select: { id: true, name: true, color: true } },
              product: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  image_url: true,
                  category: { select: { name: true, color: true } },
                },
              },
            },
          },
        },
      });

      const deviceIds = [...new Set(items.map((i) => i.deviceId))];
      const devices = deviceIds.length > 0
        ? await ctx.db.posDevice.findMany({
            where: { id: { in: deviceIds } },
            select: { id: true, deviceName: true, deviceCode: true },
          })
        : [];
      const deviceMap = new Map(devices.map((d) => [d.id, d]));

      return items.map((row) => ({
        id: row.id,
        groupKey: row.groupKey,
        stockGroupId: row.stockGroupId ?? null,
        qty: row.qty,
        deviceId: row.deviceId,
        deviceName: deviceMap.get(row.deviceId)?.deviceName ?? (row.deviceId === "" ? "General Pool" : row.deviceId),
        variation: {
          id: row.variation.id,
          productId: row.variation.product_id,
          productName: row.variation.product?.name ?? row.variation.product_name ?? "",
          variationName: row.variation.product_variation_name ?? "",
          barcode: row.variation.barcode ?? null,
          unit: row.variation.unit?.name ?? null,
          weight: Number(row.variation.weight ?? 0),
          posPrice: Number(row.variation.pos_price ?? 0),
          price: Number(row.variation.price ?? 0),
          area: row.variation.area
            ? {
                id: row.variation.area.id,
                name: row.variation.area.name,
                color: row.variation.area.color ?? null,
              }
            : null,
          description: row.variation.product?.description ?? null,
          imageUrl: row.variation.product?.image_url ?? null,
          category: row.variation.product?.category
            ? {
                name: row.variation.product.category.name,
                color: row.variation.product.category.color ?? null,
              }
            : null,
        },
      }));
    }),

  getSalesSummary: procedure.query(async ({ ctx }) => {
    const [aggregate, count, latestSale] = await Promise.all([
      ctx.db.posSale.aggregate({
        _sum: { total_amount: true },
      }),
      ctx.db.posSale.count(),
      ctx.db.posSale.findFirst({
        orderBy: { created_at: "desc" },
        select: { created_at: true },
      }),
    ]);

    return {
      totalSalesAmount: Number(aggregate._sum.total_amount ?? 0),
      totalSalesCount: count,
      lastSaleAt: latestSale?.created_at ?? null,
    };
  }),

  updatePosItemPrice: procedure
    .input(
      z.object({
        variationId: z.number().int().positive(),
        posPrice: z.number().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const canEditPosPrices = await hasPosPermission({
        db: ctx.db,
        sessionUser: {
          id: ctx.session.user.id,
          userType: ctx.session.user.userType,
          isAdmin: (ctx.session.user as any).isAdmin,
        },
        requiredPermissions: [PERMISSIONS.EDIT_POS_PRICES, PERMISSIONS.EDIT_PRICING],
      });

      if (!canEditPosPrices) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to edit POS prices.",
        });
      }

      const existingVariation = await ctx.db.productVariation.findUnique({
        where: { id: input.variationId },
        select: {
          id: true,
          pos_price: true,
          product_variation_name: true,
          product_name: true,
          product: {
            select: { name: true },
          },
        },
      });

      if (!existingVariation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "POS item variation not found.",
        });
      }

      const updatedVariation = await ctx.db.productVariation.update({
        where: { id: input.variationId },
        data: { pos_price: new Prisma.Decimal(input.posPrice) },
        select: {
          id: true,
          pos_price: true,
        },
      });

      const itemLabel =
        existingVariation.product?.name ??
        existingVariation.product_name ??
        existingVariation.product_variation_name ??
        `Variation ${existingVariation.id}`;

      await ctx.db.systemAuditLog.create({
        data: {
          username: ctx.session.user.name || "Unknown",
          action: "Updated POS Item Price",
          details: `Updated POS price for ${itemLabel} from ${Number(existingVariation.pos_price ?? 0).toFixed(2)} to ${input.posPrice.toFixed(2)}`,
          module: "POS",
          page: "POS Sales",
          department: (ctx.session.user as any).department?.name || null,
          position: (ctx.session.user as any).position?.name || null,
        },
      });

      return {
        success: true,
        variationId: updatedVariation.id,
        posPrice: Number(updatedVariation.pos_price ?? 0),
      };
    }),

  transferStock: procedure
    .input(
      z.object({
        direction: z.enum(["INVENTORY_TO_POS", "POS_TO_INVENTORY"]),
        variationId: z.number().int().positive(),
        qty: z.number().int().positive(),
        deviceId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const canManagePosInventory = await hasPosPermission({
        db: ctx.db,
        sessionUser: {
          id: ctx.session.user.id,
          userType: ctx.session.user.userType,
          isAdmin: (ctx.session.user as any).isAdmin,
        },
        requiredPermissions: [PERMISSIONS.MANAGE_POS_INVENTORY],
      });

      if (!canManagePosInventory) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to transfer POS inventory.",
        });
      }

      if (input.deviceId) {
        const device = await ctx.db.posDevice.findUnique({
          where: { id: input.deviceId },
          select: { id: true, branchId: true },
        });
        if (!device) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Target POS device not found." });
        }
      }

      const performedById = await resolveLegacyActorId({
        db: ctx.db,
        sessionUser: {
          id: ctx.session.user.id,
          userType: ctx.session.user.userType,
        },
      });

      const variation = await ctx.db.productVariation.findUnique({
        where: { id: input.variationId },
        select: {
          id: true,
          product_id: true,
          stock: true,
          stockGroupId: true,
          product_variation_name: true,
          product_name: true,
          product: { select: { name: true } },
        },
      });

      if (!variation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Variation not found" });
      }

      const groupKey = toGroupKey({ variationId: variation.id, stockGroupId: variation.stockGroupId });

      const groupVariationIds =
        variation.stockGroupId && variation.stockGroupId.trim().length > 0
          ? (
              await ctx.db.productVariation.findMany({
                where: { product_id: variation.product_id, stockGroupId: variation.stockGroupId },
                select: { id: true, stock: true },
              })
            ).map((v) => v.id)
          : [variation.id];

      const targetDeviceId = input.deviceId || "";

      await ctx.db.$transaction(async (tx) => {
        const { posInventory, posStockTransferLog } = requirePosDelegates(tx);

        if (input.direction === "INVENTORY_TO_POS") {
          const groupStocks =
            groupVariationIds.length > 1
              ? await tx.productVariation.findMany({
                  where: { id: { in: groupVariationIds } },
                  select: { stock: true },
                })
              : [{ stock: variation.stock ?? 0 }];

          const minStock = Math.min(...groupStocks.map((s) => s.stock ?? 0));
          if (minStock < input.qty) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Insufficient inventory stock. Available: ${minStock}, Requested: ${input.qty}`,
            });
          }

          await tx.productVariation.updateMany({
            where: { id: { in: groupVariationIds } },
            data: { stock: { decrement: input.qty } },
          });

          await posInventory.upsert({
            where: { groupKey_deviceId: { groupKey, deviceId: targetDeviceId } },
            create: {
              groupKey,
              stockGroupId: variation.stockGroupId,
              variationId: variation.id,
              deviceId: targetDeviceId,
              qty: input.qty,
            },
            update: { qty: { increment: input.qty } },
          });
        } else {
          const existing = await posInventory.findUnique({
            where: { groupKey_deviceId: { groupKey, deviceId: targetDeviceId } },
            select: { id: true, qty: true },
          });

          if (!existing || existing.qty < input.qty) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Insufficient POS stock. Available: ${existing?.qty ?? 0}, Requested: ${input.qty}`,
            });
          }

          await posInventory.update({
            where: { id: existing.id },
            data: { qty: { decrement: input.qty } },
          });

          await tx.productVariation.updateMany({
            where: { id: { in: groupVariationIds } },
            data: { stock: { increment: input.qty } },
          });
        }

        await posStockTransferLog.create({
          data: {
            direction: input.direction,
            variationId: variation.id,
            groupKey,
            qty: input.qty,
            deviceId: targetDeviceId,
            performedById,
          },
        });
      });

      // Queue sync for the target device if specified
      if (targetDeviceId) {
        await ctx.db.deviceSyncQueue.create({
          data: {
            deviceId: targetDeviceId,
            action: "INVENTORY_SYNC",
            payload: {
              transfers: [{
                direction: input.direction,
                variationId: input.variationId,
                groupKey,
                qty: input.qty,
              }],
            },
          },
        });
      }

      const label = variation.product?.name ?? variation.product_name ?? variation.product_variation_name ?? "Item";
      await ctx.db.systemAuditLog.create({
        data: {
          username: ctx.session.user.name || "Unknown",
          action: input.direction === "INVENTORY_TO_POS" ? "Transferred Inventory to POS" : "Transferred POS to Inventory",
          details: `${label} • Qty ${input.qty} • Group ${groupKey}${targetDeviceId ? ` • Device: ${targetDeviceId}` : ""}`,
          module: "POS",
          page: "POS Inventory",
          department: (ctx.session.user as any).department?.name || null,
          position: (ctx.session.user as any).position?.name || null,
        },
      });

      return { success: true, groupKey, label, deviceId: targetDeviceId };
    }),

  createSale: procedure
    .input(
      z.object({
        items: z
          .array(
            z.object({
              variationId: z.number().int().positive(),
              qty: z.number().int().positive(),
            }),
          )
          .min(1),
        paymentMethod: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const cashierUserId = await resolveLegacyActorId({
        db: ctx.db,
        sessionUser: {
          id: ctx.session.user.id,
          userType: ctx.session.user.userType,
        },
      });

      const requestedVariationIds = [...new Set(input.items.map((i) => i.variationId))];
      const variations = await ctx.db.productVariation.findMany({
        where: { id: { in: requestedVariationIds } },
        select: {
          id: true,
          product_id: true,
          stockGroupId: true,
          pos_price: true,
          price: true,
          product_variation_name: true,
          product_name: true,
          product: { select: { name: true } },
        },
      });

      const variationById = new Map(variations.map((v) => [v.id, v]));

      const saleItems = input.items.map((i) => {
        const v = variationById.get(i.variationId);
        if (!v) {
          throw new TRPCError({ code: "NOT_FOUND", message: `Variation ${i.variationId} not found` });
        }

        const groupKey = toGroupKey({ variationId: v.id, stockGroupId: v.stockGroupId });
        const unitPrice = Number(v.pos_price ?? 0) > 0 ? Number(v.pos_price ?? 0) : Number(v.price ?? 0);
        const subtotal = unitPrice * i.qty;

        return {
          variationId: v.id,
          groupKey,
          qty: i.qty,
          unitPrice,
          subtotal,
          label: v.product?.name ?? v.product_name ?? v.product_variation_name ?? "Item",
        };
      });

      const requiredQtyByGroupKey = new Map<string, number>();
      for (const item of saleItems) {
        requiredQtyByGroupKey.set(item.groupKey, (requiredQtyByGroupKey.get(item.groupKey) ?? 0) + item.qty);
      }

      const groupKeys = Array.from(requiredQtyByGroupKey.keys());

      const result = await ctx.db.$transaction(async (tx) => {
        const { posInventory, posSale } = requirePosDelegates(tx);

        const inventoryRows = await posInventory.findMany({
          where: { groupKey: { in: groupKeys }, deviceId: "" },
          select: { groupKey: true, qty: true },
        });

        const qtyByGroupKey = new Map(inventoryRows.map((r) => [r.groupKey, r.qty]));

        for (const [gk, requiredQty] of requiredQtyByGroupKey.entries()) {
          const available = qtyByGroupKey.get(gk) ?? 0;
          if (available < requiredQty) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Insufficient POS stock for ${gk}. Available: ${available}, Requested: ${requiredQty}`,
            });
          }
        }

        for (const [gk, requiredQty] of requiredQtyByGroupKey.entries()) {
          await posInventory.update({
            where: { groupKey_deviceId: { groupKey: gk, deviceId: "" } },
            data: { qty: { decrement: requiredQty } },
          });
        }

        const totalAmount = saleItems.reduce((sum, i) => sum + i.subtotal, 0);

        const sale = await posSale.create({
          data: {
            cashierUserId,
            total_amount: new Prisma.Decimal(totalAmount),
            payment_method: input.paymentMethod || null,
            items: {
              create: saleItems.map((i) => ({
                variationId: i.variationId,
                groupKey: i.groupKey,
                qty: i.qty,
                unit_price: new Prisma.Decimal(i.unitPrice),
                subtotal: new Prisma.Decimal(i.subtotal),
              })),
            },
          },
          include: { items: true },
        });

        return sale;
      });

      return { success: true, saleId: result.id };
    }),

  getSales: procedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sales = await ctx.db.posSale.findMany({
        take: input.limit,
        orderBy: { created_at: "desc" },
        include: {
          cashier: { select: { id: true, username: true, first_name: true, last_name: true } },
          items: {
            include: {
              variation: {
                include: {
                  unit: true,
                  product: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      });

      return sales.map((s) => ({
        id: s.id,
        createdAt: s.created_at,
        totalAmount: Number(s.total_amount),
        paymentMethod: s.payment_method ?? null,
        cashier: s.cashier
          ? {
              id: s.cashier.id,
              name:
                s.cashier.first_name && s.cashier.last_name
                  ? `${s.cashier.first_name} ${s.cashier.last_name}`
                  : s.cashier.username,
            }
          : null,
        items: s.items.map((i) => ({
          id: i.id,
          variationId: i.variationId,
          groupKey: i.groupKey,
          qty: i.qty,
          unitPrice: Number(i.unit_price),
          subtotal: Number(i.subtotal),
          productName: i.variation.product?.name ?? i.variation.product_name ?? "",
          variationName: i.variation.product_variation_name ?? "",
          unit: i.variation.unit?.name ?? null,
          weight: Number(i.variation.weight ?? 0),
        })),
      }));
    }),

  listBranchProducts: procedure
    .input(z.object({ branchId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.posBranchProduct.findMany({
        where: { branchId: input.branchId },
        orderBy: [{ id: "asc" }],
        include: {
          variation: {
            include: {
              unit: true,
              product: { select: { id: true, name: true, image_url: true, category: { select: { name: true, color: true } } } },
            },
          },
        },
      });

      return items.map((row) => ({
        id: row.id,
        variationId: row.variationId,
        posPrice: Number(row.posPrice ?? 0),
        active: row.active,
        variation: {
          id: row.variation.id,
          productId: row.variation.product_id,
          productName: row.variation.product?.name ?? row.variation.product_name ?? "",
          variationName: row.variation.product_variation_name ?? "",
          barcode: row.variation.barcode ?? null,
          unit: row.variation.unit?.name ?? null,
          weight: Number(row.variation.weight ?? 0),
          price: Number(row.variation.price ?? 0),
          posPrice: Number(row.variation.pos_price ?? 0),
          imageUrl: row.variation.product?.image_url ?? null,
          category: row.variation.product?.category
            ? { name: row.variation.product.category.name, color: row.variation.product.category.color ?? null }
            : null,
        },
      }));
    }),

  addBranchProduct: procedure
    .input(z.object({
      branchId: z.number().int().positive(),
      variationId: z.number().int().positive(),
      posPrice: z.number().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.posBranchProduct.findUnique({
        where: { variationId_branchId: { variationId: input.variationId, branchId: input.branchId } },
      });

      if (existing) {
        await ctx.db.posBranchProduct.update({
          where: { id: existing.id },
          data: { active: true, posPrice: input.posPrice ?? undefined },
        });
        return { success: true, id: existing.id };
      }

      const created = await ctx.db.posBranchProduct.create({
        data: {
          variationId: input.variationId,
          branchId: input.branchId,
          posPrice: input.posPrice ?? null,
        },
      });

      return { success: true, id: created.id };
    }),

  removeBranchProduct: procedure
    .input(z.object({
      branchId: z.number().int().positive(),
      variationId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const bp = await ctx.db.posBranchProduct.findUnique({
        where: { variationId_branchId: { variationId: input.variationId, branchId: input.branchId } },
      });

      if (!bp) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Branch product not found" });
      }

      await ctx.db.posBranchProduct.delete({ where: { id: bp.id } });
      return { success: true };
    }),

  seedBranchProducts: procedure
    .input(z.object({ branchId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const existingCount = await ctx.db.posBranchProduct.count({ where: { branchId: input.branchId } });
      if (existingCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Branch already has ${existingCount} products. Remove them first or add individually.`,
        });
      }

      const variations = await ctx.db.productVariation.findMany({
        where: { deleted_at: null },
        select: { id: true, pos_price: true },
      });

      await ctx.db.posBranchProduct.createMany({
        data: variations.map((v) => ({
          variationId: v.id,
          branchId: input.branchId,
          posPrice: v.pos_price ?? null,
        })),
      });

      return { success: true, count: variations.length };
    }),
}); }
export const posRouter = createPosRouter();


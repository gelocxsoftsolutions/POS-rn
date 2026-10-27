import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "~/server/api/trpc";
import { getUserPermissionSet } from "~/server/lib/permissions";
import { PERMISSIONS } from "~/lib/permissions";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00+08:00`);
  return Number.isFinite(date.getTime()) && new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10) === value;
}, "Invalid calendar date");
const filters = z.object({
  dateFrom: day.optional(), dateTo: day.optional(),
  branchId: z.number().int().positive().optional(),
}).refine((input) => !input.dateFrom || !input.dateTo || input.dateFrom <= input.dateTo,
  "Start date must be before end date");

export function createSalesReportProcedure(module: "pos" | "finance") {
  return protectedProcedure.input(filters).query(async ({ ctx, input }) => {
    const permissions = await getUserPermissionSet(ctx);
    const allowed = module === "finance"
      ? permissions.has(PERMISSIONS.VIEW_FINANCE) && permissions.has(PERMISSIONS.VIEW_FINANCE_TAB_PROFIT_LOSS)
      : permissions.has(PERMISSIONS.VIEW_POS) && permissions.has(PERMISSIONS.VIEW_POS_SALES_HISTORY);
    if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot view POS sales reports." });

    const [schema] = await ctx.db.$queryRaw<Array<{ ready: boolean }>>`
      SELECT to_regclass('pos.sale_sync_receipts') IS NOT NULL AS ready`;
    const ready = schema?.ready === true;
    const source = ready ? Prisma.sql`
      FROM pos.pos_sales s LEFT JOIN pos.sale_sync_receipts r ON r.pos_sale_id = s.id`
      : Prisma.sql`FROM pos.pos_sales s`;
    const branch = ready ? Prisma.sql`r.branch_id` : Prisma.sql`NULL::bigint`;
    const where = Prisma.sql`WHERE true
      ${input.dateFrom ? Prisma.sql`AND s.created_at >= ${new Date(`${input.dateFrom}T00:00:00+08:00`)}::timestamp` : Prisma.empty}
      ${input.dateTo ? Prisma.sql`AND s.created_at < ${new Date(new Date(`${input.dateTo}T00:00:00+08:00`).getTime() + 86400000)}::timestamp` : Prisma.empty}
      ${input.branchId ? Prisma.sql`AND ${branch} = ${BigInt(input.branchId)}` : Prisma.empty}`;

    // Both views use the same read snapshot and aggregate every matching sale.
    return ctx.db.$transaction(async (tx) => {
      const groups = await tx.$queryRaw<Array<{ branchId: bigint | null; total: Prisma.Decimal; count: bigint }>>(Prisma.sql`
        SELECT ${branch} AS "branchId", COALESCE(SUM(s.total_amount), 0) AS total, COUNT(*) AS count
        ${source} ${where} GROUP BY ${branch}`);
      const recent = await tx.$queryRaw<Array<{
        id: number; createdAt: Date; total: Prisma.Decimal; paymentMethod: string | null;
        branchId: bigint | null; receiptNumber: string | null; cashierName: string | null;
      }>>(Prisma.sql`
        SELECT s.id, s.created_at AS "createdAt", s.total_amount AS total,
          s.payment_method AS "paymentMethod", ${branch} AS "branchId",
          ${ready ? Prisma.sql`r.receipt_number` : Prisma.sql`NULL::text`} AS "receiptNumber",
          ${ready ? Prisma.sql`r.cashier_name` : Prisma.sql`NULL::text`} AS "cashierName"
        ${source} ${where} ORDER BY s.created_at DESC, s.id DESC LIMIT 50`);
      const branches = await tx.branch.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
      const names = new Map(branches.map((b) => [String(b.id), b.name]));
      const branchName = (id: bigint | null) => id === null ? "Unattributed historical sales" : names.get(String(id)) ?? `Branch ${id}`;
      const total = groups.reduce((sum, group) => sum.plus(group.total), new Prisma.Decimal(0));
      const count = groups.reduce((sum, group) => sum + Number(group.count), 0);
      return {
        attributionReady: ready, total: Number(total), count,
        average: count ? Number(total.div(count).toFixed(2)) : 0,
        branches: branches.map((b) => ({ id: Number(b.id), name: b.name })),
        groups: groups.map((g) => ({ branchId: g.branchId === null ? null : Number(g.branchId), branchName: branchName(g.branchId), total: Number(g.total), count: Number(g.count) })),
        recent: recent.map((s) => ({ ...s, total: Number(s.total), branchId: s.branchId === null ? null : Number(s.branchId), branchName: branchName(s.branchId) })),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  });
}

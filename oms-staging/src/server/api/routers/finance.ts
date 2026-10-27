import { z } from "zod";
import { createSalesReportProcedure } from "~/server/pos/sales-report";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const dateFilterSchema = z.object({
  preset: z.enum(["today", "this_week", "this_month", "custom"]).default("today"),
  dateFrom: z.date().optional(),
  dateTo: z.date().optional(),
});

function getDateRange(preset: string, dateFrom?: Date | null, dateTo?: Date | null) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  if (preset === "today") {
    return { gte: startOfDay, lt: endOfDay };
  }
  if (preset === "this_week") {
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - ((dayOfWeek + 6) % 7));
    return { gte: startOfWeek, lt: endOfDay };
  }
  if (preset === "this_month") {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return { gte: startOfMonth, lt: endOfDay };
  }
  const dayEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return {
    gte: dateFrom ?? new Date("2000-01-01"),
    lte: dateTo ? dayEnd(dateTo) : new Date("2099-12-31"),
  };
}

async function getInventorySummary(ctx: any) {
  const batches = await ctx.db.inventoryBatch.findMany({
    where: { qty_remaining: { gt: 0 } },
    select: { product_id: true, qty_remaining: true, unit_cost: true },
  });
  const inventoryValue = batches.reduce((sum: number, b: any) => sum + Number(b.qty_remaining) * Number(b.unit_cost), 0);
  const totalRemainingUnits = batches.reduce((sum: number, b: any) => sum + Number(b.qty_remaining), 0);
  const distinct = new Set(batches.map((b: any) => b.product_id));
  return { inventoryValue, totalRemainingUnits, totalProducts: distinct.size };
}

export const financeRouter = createTRPCRouter({
  getPosSummaryReport: createSalesReportProcedure("finance"),
  getKPIs: publicProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      const todayFinances = await ctx.db.saleItemFinance.findMany({
        where: {
          created_at: { gte: startOfDay, lt: endOfDay },
        },
      });

      const todayRevenue = todayFinances.reduce((sum, f) => sum + Number(f.revenue), 0);
      const todayCOGS = todayFinances.reduce((sum, f) => sum + Number(f.cogs), 0);
      const todayGrossProfit = todayRevenue - todayCOGS;

      const inventoryAgg = await ctx.db.inventoryBatch.aggregate({
        _sum: { unit_cost: true, qty_remaining: true },
        where: { qty_remaining: { gt: 0 } },
      });

      const totalInventoryUnits = Number(inventoryAgg._sum.qty_remaining ?? 0);

      const batches = await ctx.db.inventoryBatch.findMany({
        where: { qty_remaining: { gt: 0 } },
        select: { qty_remaining: true, unit_cost: true },
      });
      const inventoryValue = batches.reduce((sum, b) => sum + Number(b.qty_remaining) * Number(b.unit_cost), 0);

      return {
        todayRevenue,
        todayCOGS,
        todayGrossProfit,
        inventoryValue,
        totalInventoryUnits,
      };
    }),

  getProfitLoss: publicProcedure
    .input(dateFilterSchema)
    .query(async ({ ctx, input }) => {
      const dateFilter = getDateRange(input.preset, input.dateFrom, input.dateTo);

      const finances = await ctx.db.saleItemFinance.findMany({
        where: { created_at: dateFilter },
        include: {
          saleItem: {
            include: {
              product: { select: { name: true } },
              variation: { select: { product_variation_name: true } },
            },
          },
        },
      });

      const revenue = finances.reduce((sum, f) => sum + Number(f.revenue), 0);
      const cogs = finances.reduce((sum, f) => sum + Number(f.cogs), 0);
      const grossProfit = revenue - cogs;

      const productMap = new Map<string, { revenue: number; cogs: number; profit: number; margin: number }>();
      for (const f of finances) {
        const key = `${f.saleItem.product.name} - ${f.saleItem.variation.product_variation_name ?? ""}`;
        const existing = productMap.get(key) ?? { revenue: 0, cogs: 0, profit: 0, margin: 0 };
        existing.revenue += Number(f.revenue);
        existing.cogs += Number(f.cogs);
        existing.profit += Number(f.profit);
        existing.margin = existing.revenue > 0 ? (existing.profit / existing.revenue) * 100 : 0;
        productMap.set(key, existing);
      }

      const sortedByProfit = [...productMap.entries()].sort((a, b) => b[1].profit - a[1].profit);
      const sortedByMargin = [...productMap.entries()].sort((a, b) => a[1].margin - b[1].margin);

      const batches = await ctx.db.inventoryBatch.findMany({
        where: { qty_remaining: { gt: 0 } },
        select: { qty_remaining: true, unit_cost: true },
      });
      const inventoryValue = batches.reduce((sum, b) => sum + Number(b.qty_remaining) * Number(b.unit_cost), 0);

      return {
        revenue,
        cogs,
        grossProfit,
        topProfitableProducts: sortedByProfit.slice(0, 5).map(([name, data]) => ({ name, ...data })),
        lowestMarginProducts: sortedByMargin.slice(0, 5).map(([name, data]) => ({ name, ...data })),
        inventoryValue,
      };
    }),

  getInventorySummary: publicProcedure
    .query(async ({ ctx }) => getInventorySummary(ctx)),

  getCOGS: publicProcedure
    .input(
      dateFilterSchema.extend({
        search: z.string().optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const dateFilter = getDateRange(input.preset, input.dateFrom, input.dateTo);
      const skip = (input.page - 1) * input.limit;

      const where: any = { created_at: dateFilter };
      if (input.search) {
        where.OR = [
          { product: { name: { contains: input.search, mode: "insensitive" } } },
          { variation: { product_variation_name: { contains: input.search, mode: "insensitive" } } },
        ];
      }

      const [consumptions, total] = await Promise.all([
        ctx.db.saleBatchConsumption.findMany({
          where,
          include: {
            product: { select: { name: true, image_url: true } },
            variation: { select: { product_variation_name: true, price: true, stockGroupId: true } },
            inventoryBatch: { select: { batch_no: true } },
            saleItem: {
              select: {
                price: true,
                qty: true,
                sale: { select: { invoice_id: true, customer_name: true, sale_date: true } },
              },
            },
          },
          orderBy: [{ product_id: "asc" }, { variation_id: "asc" }, { created_at: "desc" }],
          skip,
          take: input.limit,
        }),
        ctx.db.saleBatchConsumption.count({ where }),
      ]);

      // Fetch SaleItemFinance for profit data
      const saleItemIds = [...new Set(consumptions.map((c) => c.sale_item_id))];
      const finances = saleItemIds.length > 0
        ? await ctx.db.saleItemFinance.findMany({
            where: { sale_item_id: { in: saleItemIds } },
            select: { sale_item_id: true, profit: true, profit_margin: true },
          })
        : [];
      const financeBySaleItemId = new Map(finances.map((f) => [f.sale_item_id, f]));

      // Group by product → variation → batch consumptions
      const productMap = new Map<string, {
        productName: string;
        productImg: string | null;
        totalQty: number;
        totalCost: number;
        variations: Map<string, {
          variationName: string;
          price: number;
          stockGroupId: string;
          totalQty: number;
          totalCost: number;
          batchConsumptions: Array<{
            id: number;
            batchNo: string;
            qty: number;
            unitCost: number;
            totalCost: number;
            consumedAt: Date;
            price: number;
            invoiceId: string;
            customerName: string;
            saleDate: Date;
            revenue: number;
            profit: number;
            profitMargin: number;
          }>;
        }>;
      }>();

      for (const c of consumptions) {
        const pName = c.product.name;
        let pEntry = productMap.get(pName);
        if (!pEntry) {
          pEntry = {
            productName: pName,
            productImg: c.product.image_url,
            totalQty: 0,
            totalCost: 0,
            variations: new Map(),
          };
          productMap.set(pName, pEntry);
        }
        pEntry.totalQty += c.quantity;
        pEntry.totalCost += Number(c.total_cost);

        const vName = c.variation.product_variation_name ?? "";
        let vEntry = pEntry.variations.get(vName);
        if (!vEntry) {
          vEntry = {
            variationName: vName,
            price: Number(c.variation.price),
            stockGroupId: c.variation.stockGroupId ?? "",
            totalQty: 0,
            totalCost: 0,
            batchConsumptions: [],
          };
          pEntry.variations.set(vName, vEntry);
        }
        vEntry.totalQty += c.quantity;
        vEntry.totalCost += Number(c.total_cost);
        vEntry.batchConsumptions.push({
          id: Number(c.id),
          batchNo: c.inventoryBatch.batch_no,
          qty: c.quantity,
          unitCost: Number(c.unit_cost),
          totalCost: Number(c.total_cost),
          consumedAt: c.created_at,
          price: Number(c.saleItem.price),
          invoiceId: c.saleItem.sale.invoice_id,
          customerName: c.saleItem.sale.customer_name,
          saleDate: c.saleItem.sale.sale_date,
          revenue: Number(c.saleItem.price) * c.quantity,
          profit: financeBySaleItemId.has(c.sale_item_id)
            ? Number(financeBySaleItemId.get(c.sale_item_id)!.profit)
            : Number(c.saleItem.price) * c.quantity - Number(c.total_cost),
          profitMargin: financeBySaleItemId.has(c.sale_item_id)
            ? Number(financeBySaleItemId.get(c.sale_item_id)!.profit_margin)
            : 0,
        });
      }

      const items = [...productMap.values()].map((p) => ({
        productName: p.productName,
        productImg: p.productImg,
        totalQty: p.totalQty,
        totalCost: p.totalCost,
        variations: [...p.variations.values()],
      }));

      items.sort((a, b) => a.productName.localeCompare(b.productName));

      return {
        items,
        total,
        totalPages: Math.ceil(total / input.limit),
        currentPage: input.page,
      };
    }),

  getInventoryValuation: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      // Build search filter
      const batchFilter: any = { qty_remaining: { gt: 0 } };
      if (input.search) {
        batchFilter.OR = [
          { product: { name: { contains: input.search, mode: "insensitive" } } },
          { variation: { product_variation_name: { contains: input.search, mode: "insensitive" } } },
        ];
      }

      // First pass: get distinct product IDs that have inventoryBatches
      const distinctProductRows = await ctx.db.inventoryBatch.findMany({
        where: batchFilter,
        select: { product_id: true },
        distinct: ["product_id"],
        orderBy: { product_id: "asc" },
      });

      const allProductIds = distinctProductRows.map((r) => r.product_id);
      const total = allProductIds.length;
      const skip = (input.page - 1) * input.limit;
      const pageProductIds = allProductIds.slice(skip, skip + input.limit);

      if (pageProductIds.length === 0) {
        return { products: [], grandTotal: 0, grandTotalQty: 0, batchCount: 0, total: 0, totalPages: 0, currentPage: input.page };
      }

      // Second pass: get all batches for these products
      const productBatchFilter: any = { product_id: { in: pageProductIds }, qty_remaining: { gt: 0 } };
      if (input.search) {
        productBatchFilter.OR = batchFilter.OR;
      }

      // Also fetch all variations for these products (for price + stock info)
      const allVariations = await ctx.db.productVariation.findMany({
        where: { product_id: { in: pageProductIds } },
        select: { id: true, product_id: true, product_variation_name: true, stockGroupId: true, price: true, stock: true },
      });
      const variationsByProduct = new Map<number, typeof allVariations>();
      const variationsById = new Map<number, typeof allVariations[number]>();
      for (const v of allVariations) {
        const existing = variationsByProduct.get(v.product_id) ?? [];
        existing.push(v);
        variationsByProduct.set(v.product_id, existing);
        variationsById.set(Number(v.id), v);
      }

      const batches = await ctx.db.inventoryBatch.findMany({
        where: productBatchFilter,
        include: {
          product: { select: { name: true, image_url: true } },
          variation: { select: { product_variation_name: true, stockGroupId: true } },
        },
        orderBy: [{ product_id: "asc" }, { received_date: "desc" }],
      });

      // Map batches to a flat list with product_id
      const flatBatches = batches.map((b) => ({
        ...b,
        productId: b.product_id,
        variationId: b.variation_id,
        variationName: b.variation.product_variation_name ?? "",
        stockGroupId: b.variation.stockGroupId ?? "",
        batchValue: b.qty_remaining * Number(b.unit_cost),
      }));

      // Build a map of stockGroupId → batch records (for combined stock inheritance)
      const groupBatchesMap = new Map<string, typeof flatBatches>();
      for (const b of flatBatches) {
        if (b.stockGroupId && b.stockGroupId.trim().length > 0) {
          const existing = groupBatchesMap.get(b.stockGroupId) ?? [];
          existing.push(b);
          groupBatchesMap.set(b.stockGroupId, existing);
        }
      }

      // Build products array
      const products = [...pageProductIds].map((productId) => {
        const productVars = variationsByProduct.get(productId) ?? [];
        const productBatches = flatBatches.filter((b) => b.productId === productId);
        const productName = productBatches[0]?.product.name ?? "";
        const productImg = productBatches[0]?.product.image_url ?? null;

        // Build per-variation rows
        const variations = productVars.map((v) => {
          const varId = Number(v.id);
          const ownBatches = productBatches.filter((b) => b.variationId === varId);
          const isCombined = v.stockGroupId && v.stockGroupId.trim().length > 0;

          let effectiveBatches = ownBatches;
          if (isCombined && ownBatches.length === 0) {
            // Inherit batches from siblings in the same stock group
            const siblingBatches = groupBatchesMap.get(v.stockGroupId!) ?? [];
            effectiveBatches = siblingBatches;
          }

          const batchCount = effectiveBatches.length;
          const totalQty = batchCount > 0
            ? effectiveBatches.reduce((s, b) => s + b.qty_remaining, 0)
            : Number(v.stock);
          const totalValue = effectiveBatches.reduce((s, b) => s + (b.qty_remaining * Number(b.unit_cost)), 0);
          // For valuation, each variation values at its own price × its stock qty
          const valuationValue = Number(v.stock) * Number(v.price);
          const price = Number(v.price);

          return {
            variationName: v.product_variation_name ?? "",
            stockGroupId: v.stockGroupId ?? "",
            type: isCombined ? ("combined" as const) : ("single" as const),
            batchCount,
            totalQty,
            totalValue,
            valuationValue,
            price,
            stock: Number(v.stock),
            batches: effectiveBatches.map((b) => ({
              id: Number(b.id),
              batch_no: b.batch_no,
              qty_remaining: b.qty_remaining,
              unit_cost: Number(b.unit_cost),
              batchValue: b.batchValue,
              received_date: b.received_date,
            })),
          };
        });

        const productTotalQty = variations.reduce((s, v) => s + v.stock, 0);
        const productTotalValue = variations.reduce((s, v) => s + v.totalValue, 0);
        const productSellValue = variations.reduce((s, v) => s + v.valuationValue, 0);
        const productGrossProfit = productSellValue - productTotalValue;

        return { productName, productImg, variations, productTotalQty, productTotalValue, productSellValue, productGrossProfit };
      });

      const grandTotal = products.reduce((s, p) => s + p.productTotalValue, 0);
      const grandSellValue = products.reduce((s, p) => s + p.productSellValue, 0);
      const grandTotalQty = products.reduce((s, p) => s + p.productTotalQty, 0);
      const batchCount = batches.length;

      const grandGrossProfit = grandSellValue - grandTotal;

      return {
        products,
        grandTotal,
        grandSellValue,
        grandGrossProfit,
        grandTotalQty,
        batchCount,
        total,
        totalPages: Math.ceil(total / input.limit),
        currentPage: input.page,
      };
    }),

  getBatchLedger: publicProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Build the search filter for InventoryBatch
      const batchFilter: any = {};
      if (input.search) {
        batchFilter.OR = [
          { batch_no: { contains: input.search, mode: "insensitive" } },
          { supplier_name: { contains: input.search, mode: "insensitive" } },
          { product: { name: { contains: input.search, mode: "insensitive" } } },
        ];
      }

      // First pass: get distinct product IDs that match, paginated by product
      const distinctProductRows = await ctx.db.inventoryBatch.findMany({
        where: batchFilter,
        select: { product_id: true },
        distinct: ["product_id"],
        orderBy: { product_id: "asc" },
      });

      const allProductIds = distinctProductRows.map((r) => r.product_id);
      const total = allProductIds.length;

      const skip = (input.page - 1) * input.limit;
      const pageProductIds = allProductIds.slice(skip, skip + input.limit);

      if (pageProductIds.length === 0) {
        return { products: [], total: 0, totalPages: 0, currentPage: input.page };
      }

      // Second pass: fetch ALL batches for those product IDs
      const productBatchFilter: any = { product_id: { in: pageProductIds } };
      if (input.search) {
        productBatchFilter.OR = batchFilter.OR;
      }

      const batches = await ctx.db.inventoryBatch.findMany({
        where: productBatchFilter,
        include: {
          product: { select: { name: true, image_url: true } },
          variation: { select: { product_variation_name: true, stockGroupId: true } },
          supplier: { select: { name: true } },
        },
        orderBy: [{ product_id: "asc" }, { received_date: "desc" }],
      });

      // Also fetch all variations for these products (for price + stock info)
      const allVariations = await ctx.db.productVariation.findMany({
        where: { product_id: { in: pageProductIds } },
        select: { id: true, product_id: true, product_variation_name: true, stockGroupId: true, price: true, stock: true },
      });
      const variationsByProduct = new Map<number, typeof allVariations>();
      const variationsById = new Map<number, typeof allVariations[number]>();
      for (const v of allVariations) {
        const existing = variationsByProduct.get(v.product_id) ?? [];
        existing.push(v);
        variationsByProduct.set(v.product_id, existing);
        variationsById.set(Number(v.id), v);
      }

      // Map each batch to a flat item, grouped by product
      type FlatBatch = {
        id: number; batch_no: string; productId: number; productName: string; productImg: string | null;
        variationId: number; variationName: string; stockGroupId: string;
        supplierName: string; receivedDate: Date; qtyReceived: number; qtyRemaining: number;
        unitCost: number; batchValue: number; status: string;
      };

      const items: FlatBatch[] = batches.map((b) => {
        const status = b.qty_remaining === 0 ? "Fully Consumed"
          : b.qty_remaining < b.qty_received ? "Partially Consumed"
          : "Available";
        return {
          id: Number(b.id), batch_no: b.batch_no, productId: b.product_id, productName: b.product.name,
          productImg: b.product.image_url, variationId: b.variation_id,
          variationName: b.variation.product_variation_name ?? "",
          stockGroupId: b.variation.stockGroupId ?? "",
          supplierName: b.supplier?.name ?? b.supplier_name ?? "", receivedDate: b.received_date,
          qtyReceived: b.qty_received, qtyRemaining: b.qty_remaining, unitCost: Number(b.unit_cost),
          batchValue: b.qty_remaining * Number(b.unit_cost), status,
        };
      });

      // Group batches by product
      const batchesByProduct = new Map<number, FlatBatch[]>();
      for (const item of items) {
        const existing = batchesByProduct.get(item.productId) ?? [];
        existing.push(item);
        batchesByProduct.set(item.productId, existing);
      }

      // Build a map of stockGroupId → batch records (for combined stock inheritance)
      const groupBatchesMap = new Map<string, FlatBatch[]>();
      for (const b of items) {
        if (b.stockGroupId && b.stockGroupId.trim().length > 0) {
          const existing = groupBatchesMap.get(b.stockGroupId) ?? [];
          existing.push(b);
          groupBatchesMap.set(b.stockGroupId, existing);
        }
      }

      // Build products array
      const products = [...pageProductIds].map((productId) => {
        const productVars = variationsByProduct.get(productId) ?? [];
        const productBatches = batchesByProduct.get(productId) ?? [];
        const productName = productBatches[0]?.productName ?? "";
        const productImg = productBatches[0]?.productImg ?? null;

        // Group into: combined (by stockGroupId) and single (by variationId)
        type GroupEntry = {
          type: "combined" | "single";
          stockGroupId: string;
          variationName: string;
          variationNames: string[];
          variationPrices: number[];
          totalBatches: number;
          totalQtyReceived: number;
          totalQtyRemaining: number;
          totalValue: number;
          batches: FlatBatch[];
        };

        const groupMap = new Map<string, GroupEntry>();

        // First, collect batches into groups
        for (const b of productBatches) {
          const isCombined = b.stockGroupId && b.stockGroupId.trim().length > 0;
          const gKey = isCombined ? `combined:${b.stockGroupId}` : `single:${b.variationId}`;

          const existing = groupMap.get(gKey) ?? {
            type: isCombined ? ("combined" as const) : ("single" as const),
            stockGroupId: b.stockGroupId,
            variationName: b.variationName,
            variationNames: [] as string[],
            variationPrices: [] as number[],
            totalBatches: 0,
            totalQtyReceived: 0,
            totalQtyRemaining: 0,
            totalValue: 0,
            batches: [],
          };

          if (!existing.variationNames.includes(b.variationName)) {
            existing.variationNames.push(b.variationName);
            const varInfo = variationsById.get(b.variationId);
            if (varInfo) existing.variationPrices.push(Number(varInfo.price));
          }
          existing.totalBatches++;
          existing.totalQtyReceived += b.qtyReceived;
          existing.totalQtyRemaining += b.qtyRemaining;
          existing.totalValue += b.batchValue;
          existing.batches.push(b);
          groupMap.set(gKey, existing);
        }

        // Enrich combined groups with sibling variations that share the stockGroupId
        for (const [, g] of groupMap) {
          if (g.type === "combined" && g.stockGroupId) {
            for (const v of productVars) {
              if (v.stockGroupId === g.stockGroupId) {
                const vname = v.product_variation_name ?? "";
                if (!g.variationNames.includes(vname)) {
                  g.variationNames.push(vname);
                  g.variationPrices.push(Number(v.price));
                }
              }
            }
          }
        }

        // Ensure single variations without batch records still appear
        for (const v of productVars) {
          const isCombined = v.stockGroupId && v.stockGroupId.trim().length > 0;
          if (!isCombined) {
            const gKey = `single:${Number(v.id)}`;
            if (!groupMap.has(gKey)) {
              groupMap.set(gKey, {
                type: "single",
                stockGroupId: "",
                variationName: v.product_variation_name ?? "",
                variationNames: [v.product_variation_name ?? ""],
                variationPrices: [Number(v.price)],
                totalBatches: 0,
                totalQtyReceived: 0,
                totalQtyRemaining: Number(v.stock),
                totalValue: Number(v.stock) * Number(v.price),
                batches: [],
              });
            }
          }
        }

        const groups = [...groupMap.values()].map((g) => ({
          type: g.type,
          stockGroupId: g.stockGroupId,
          variationName: g.variationName,
          variationNames: g.variationNames,
          variationPrices: g.variationPrices,
          totalBatches: g.totalBatches,
          totalQtyReceived: g.totalQtyReceived,
          totalQtyRemaining: g.totalQtyRemaining,
          totalValue: g.totalValue,
          batches: g.batches.map((b) => ({
            id: b.id,
            batch_no: b.batch_no,
            variationName: b.variationName,
            supplierName: b.supplierName,
            receivedDate: b.receivedDate,
            qtyReceived: b.qtyReceived,
            qtyRemaining: b.qtyRemaining,
            unitCost: b.unitCost,
            batchValue: b.batchValue,
            status: b.status,
          })),
        }));

        groups.sort((a, b) => a.variationName.localeCompare(b.variationName));
        return { productName, productImg, groups };
      });

      products.sort((a, b) => a.productName.localeCompare(b.productName));

      return {
        products,
        total,
        totalPages: Math.ceil(total / input.limit),
        currentPage: input.page,
      };
    }),

  getProductProfitability: publicProcedure
    .input(
      dateFilterSchema.extend({
        search: z.string().optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const dateFilter = getDateRange(input.preset, input.dateFrom, input.dateTo);

      // Build where clause filtering by sale date (through SaleItem → Sale)
      const saleItemWhere: any = {};
      if (dateFilter) saleItemWhere.sale = { sale_date: dateFilter };
      if (input.search) {
        saleItemWhere.OR = [
          { product: { name: { contains: input.search, mode: "insensitive" } } },
          { variation: { product_variation_name: { contains: input.search, mode: "insensitive" } } },
        ];
      }
      const where = Object.keys(saleItemWhere).length > 0 ? { saleItem: saleItemWhere } : {};

      // Fetch all SaleItemFinance records (no DB pagination — we group & paginate in memory)
      const finances = await ctx.db.saleItemFinance.findMany({
        where,
        include: {
          saleItem: {
            include: {
              product: { select: { name: true, image_url: true } },
              variation: { select: { product_variation_name: true, price: true, stockGroupId: true } },
              sale: { select: { invoice_id: true, customer_name: true, sale_date: true } },
              batchConsumptions: {
                include: { inventoryBatch: { select: { batch_no: true } } },
                orderBy: { created_at: "desc" },
              },
            },
          },
        },
        orderBy: { profit: "desc" },
      });

      // Group by product → variation, collecting individual transactions for drill-down
      const productMap = new Map<string, {
        productName: string;
        productImg: string | null;
        totalUnitsSold: number;
        totalRevenue: number;
        totalCogs: number;
        totalProfit: number;
        totalMargin: number;
        variations: Map<string, {
          variationName: string;
          price: number;
          unitsSold: number;
          revenue: number;
          cogs: number;
          profit: number;
          margin: number;
          transactions: Array<{
            invoiceId: string;
            customerName: string;
            saleDate: Date;
            qty: number;
            unitPrice: number;
            revenue: number;
            cogs: number;
            profit: number;
            margin: number;
          }>;
          batchConsumptions: Array<{
            id: number;
            batchNo: string;
            qty: number;
            unitCost: number;
            totalCost: number;
            consumedAt: Date;
            itemQty: number;
            itemRevenue: number;
          }>;
        }>;
      }>();

      for (const f of finances) {
        const pName = f.saleItem.product.name;
        let pEntry = productMap.get(pName);
        if (!pEntry) {
          pEntry = {
            productName: pName,
            productImg: f.saleItem.product.image_url,
            totalUnitsSold: 0,
            totalRevenue: 0,
            totalCogs: 0,
            totalProfit: 0,
            totalMargin: 0,
            variations: new Map(),
          };
          productMap.set(pName, pEntry);
        }
        pEntry.totalUnitsSold += f.saleItem.qty;
        pEntry.totalRevenue += Number(f.revenue);
        pEntry.totalCogs += Number(f.cogs);
        pEntry.totalProfit += Number(f.profit);

        const vName = f.saleItem.variation.product_variation_name ?? "";
        let vEntry = pEntry.variations.get(vName);
        if (!vEntry) {
          vEntry = {
            variationName: vName,
            price: Number(f.saleItem.variation.price),
            unitsSold: 0,
            revenue: 0,
            cogs: 0,
            profit: 0,
            margin: 0,
            transactions: [],
            batchConsumptions: [],
          };
          pEntry.variations.set(vName, vEntry);
        }
        vEntry.unitsSold += f.saleItem.qty;
        vEntry.revenue += Number(f.revenue);
        vEntry.cogs += Number(f.cogs);
        vEntry.profit += Number(f.profit);
        vEntry.margin = vEntry.revenue > 0 ? (vEntry.profit / vEntry.revenue) * 100 : 0;
        vEntry.transactions.push({
          invoiceId: f.saleItem.sale.invoice_id,
          customerName: f.saleItem.sale.customer_name,
          saleDate: f.saleItem.sale.sale_date,
          qty: f.saleItem.qty,
          unitPrice: Number(f.saleItem.price),
          revenue: Number(f.revenue),
          cogs: Number(f.cogs),
          profit: Number(f.profit),
          margin: Number(f.profit_margin),
        });

        const itemRevenue = Number(f.revenue);
        const itemQty = f.saleItem.qty;
        for (const bc of f.saleItem.batchConsumptions) {
          vEntry.batchConsumptions.push({
            id: Number(bc.id),
            batchNo: bc.inventoryBatch.batch_no,
            qty: bc.quantity,
            unitCost: Number(bc.unit_cost),
            totalCost: Number(bc.total_cost),
            consumedAt: bc.created_at,
            itemQty,
            itemRevenue,
          });
        }
      }

      const allProducts = [...productMap.values()].map((p) => {
        const m = p.totalRevenue > 0 ? (p.totalProfit / p.totalRevenue) * 100 : 0;
        return {
          ...p,
          totalMargin: m,
          variations: [...p.variations.values()].sort((a, b) => b.profit - a.profit),
        };
      }).sort((a, b) => b.totalProfit - a.totalProfit);

      const total = allProducts.length;
      const skip = (input.page - 1) * input.limit;
      const items = allProducts.slice(skip, skip + input.limit);

      return {
        items,
        total,
        totalPages: Math.ceil(total / input.limit),
        currentPage: input.page,
      };
    }),
});

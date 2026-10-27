import { z } from "zod";

const money = z
  .number()
  .finite()
  .min(0)
  .max(99999999.99)
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001,
    "Use at most two decimal places",
  );
export const saleContract = z
  .object({
    clientSaleId: z.string().uuid(),
    receiptNumber: z.string().trim().min(1).max(100),
    deviceId: z.string().min(1),
    branchId: z.number().int().positive(),
    cashierId: z.string().min(1),
    cashierName: z.string().min(1).max(255),
    createdAt: z.string().datetime({ offset: true }),
    paymentMethod: z.string().trim().min(1).max(50),
    subtotal: money,
    discount: money,
    tax: money,
    total: money,
    items: z
      .array(
        z.object({
          variationId: z.number().int().positive(),
          qty: z.number().int().positive(),
          unitPrice: money,
        }),
      )
      .min(1)
      .max(1000),
  })
  .superRefine((sale, ctx) => {
    const subtotal = sale.items.reduce(
      (sum, line) => sum + Math.round(line.unitPrice * 100) * line.qty,
      0,
    );
    if (subtotal !== Math.round(sale.subtotal * 100))
      ctx.addIssue({
        code: "custom",
        message: "Item prices do not match subtotal",
        path: ["subtotal"],
      });
    const total = Math.max(
      0,
      subtotal - Math.round(sale.discount * 100) + Math.round(sale.tax * 100),
    );
    if (total !== Math.round(sale.total * 100))
      ctx.addIssue({
        code: "custom",
        message: "Sale total does not match receipt",
        path: ["total"],
      });
  });

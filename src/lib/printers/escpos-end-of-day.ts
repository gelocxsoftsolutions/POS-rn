import type {
  CashierPerformance,
  PaymentBreakdown,
  ProductPerformance,
  ReportSummary,
} from "@/lib/types/reports";

const COLUMNS = 32;

const clean = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const money = (value: number) => `PHP ${Number(value || 0).toFixed(2)}`;

function center(value: string) {
  const text = clean(value).slice(0, COLUMNS);
  return `${" ".repeat(Math.max(0, Math.floor((COLUMNS - text.length) / 2)))}${text}`;
}

function wrap(value: string, width = COLUMNS) {
  const words = clean(value).split(" ").filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) {
      line = word;
    } else if (`${line} ${word}`.length <= width) {
      line = `${line} ${word}`;
    } else {
      lines.push(line.slice(0, width));
      line = word;
    }
  }
  while (line.length > width) {
    lines.push(line.slice(0, width));
    line = line.slice(width);
  }
  if (line) lines.push(line);
  return lines;
}

function columns(left: string, right: string) {
  const rightText = clean(right).slice(0, COLUMNS);
  const leftWidth = Math.max(1, COLUMNS - rightText.length - 1);
  const leftText = clean(left).slice(0, leftWidth);
  return `${leftText}${" ".repeat(Math.max(1, COLUMNS - leftText.length - rightText.length))}${rightText}`;
}

function section(lines: string[], title: string) {
  lines.push("-".repeat(COLUMNS), center(title), "-".repeat(COLUMNS));
}

export function formatEscPosEndOfDayReport(input: {
  storeName?: string | null;
  address?: string | null;
  supportPhone?: string | null;
  period: string;
  generatedAt: Date;
  subtotal: number;
  summary: ReportSummary;
  payments: PaymentBreakdown[];
  itemSales: ProductPerformance[];
  cashiers: CashierPerformance[];
}) {
  const lines: string[] = [];
  lines.push(center(input.storeName || "NCT Seafoods"));
  if (input.address) wrap(input.address).forEach((line) => lines.push(center(line)));
  if (input.supportPhone) lines.push(center(input.supportPhone));
  lines.push("", center("END OF DAY REPORT"), center(input.period));
  lines.push(center(`Generated: ${input.generatedAt.toLocaleString("en-PH")}`));

  section(lines, "SALES SUMMARY");
  lines.push(columns("Transactions", String(input.summary.transactionCount)));
  lines.push(columns("Items sold", String(input.summary.itemsSold)));
  lines.push(columns("Subtotal", money(input.subtotal)));
  if (input.summary.discounts > 0) {
    lines.push(columns("Discounts", `-${money(input.summary.discounts)}`));
  }
  lines.push(columns("Tax", money(input.summary.tax)));
  lines.push("=".repeat(COLUMNS));
  lines.push(columns("TOTAL SALES", money(input.summary.revenue)));
  lines.push(columns("Average basket", money(input.summary.averageBasket)));

  section(lines, "PAYMENT SUMMARY");
  input.payments.forEach((payment) => {
    const label = payment.method === "DIGITAL" ? "GCash/QRPh" : payment.method;
    lines.push(columns(label, money(payment.amount)));
    lines.push(`${payment.transactions} transaction${payment.transactions === 1 ? "" : "s"}`);
  });

  section(lines, "ITEMS SOLD");
  input.itemSales.forEach((item) => {
    lines.push(...wrap(item.productName));
    if (item.sku) lines.push(...wrap(`SKU: ${item.sku}`));
    lines.push(columns(`Qty: ${item.quantity}`, money(item.revenue)));
  });

  section(lines, "CASHIER SUMMARY");
  input.cashiers.forEach((cashier) => {
    lines.push(...wrap(cashier.cashierName));
    lines.push(columns(`${cashier.transactions} transactions`, money(cashier.revenue)));
  });

  lines.push("-".repeat(COLUMNS), center("Local completed POS sales"));
  return `${lines.join("\n")}\n`;
}

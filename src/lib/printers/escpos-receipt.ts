export interface EscPosReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal?: number;
}

export interface EscPosReceiptData {
  receiptNumber: string;
  date: string;
  customerName?: string | null;
  cashierName: string;
  items: EscPosReceiptItem[];
  subtotal: number;
  discount?: number;
  tax: number;
  total: number;
  paidAmount: number;
  change: number;
  paymentMethod: string;
}

export interface EscPosReceiptSettings {
  storeName?: string | null;
  address?: string | null;
  supportPhone?: string | null;
  receiptFooter?: string | null;
  taxLabel?: string | null;
  headerMessage?: string | null;
  paperWidthMm?: 58 | 80;
  showCashier?: boolean;
  showCustomer?: boolean;
  showPaymentDetails?: boolean;
}

const clean = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const money = (value: number) => `PHP ${Number(value || 0).toFixed(2)}`;

function center(value: string, width: number) {
  const text = clean(value).slice(0, width);
  return `${" ".repeat(Math.max(0, Math.floor((width - text.length) / 2)))}${text}`;
}

function wrap(value: string, width: number) {
  const words = clean(value).split(" ").filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (word.length > width) {
      if (line) lines.push(line);
      for (let index = 0; index < word.length; index += width) {
        lines.push(word.slice(index, index + width));
      }
      line = "";
    } else if (!line) {
      line = word;
    } else if (`${line} ${word}`.length <= width) {
      line = `${line} ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function columns(left: string, right: string, width: number) {
  const rightText = clean(right).slice(0, width);
  const leftWidth = Math.max(1, width - rightText.length - 1);
  const leftText = clean(left).slice(0, leftWidth);
  return `${leftText}${" ".repeat(Math.max(1, width - leftText.length - rightText.length))}${rightText}`;
}

const paymentLabel = (method: string) => method === "DIGITAL" ? "GCash/QRPh" : method;

export function formatEscPosReceipt(
  receipt: EscPosReceiptData,
  settings: EscPosReceiptSettings | null
) {
  const receiptColumns = settings?.paperWidthMm === 80 ? 48 : 32;
  const lines: string[] = [];
  lines.push(center(settings?.storeName || "NCT Seafoods", receiptColumns));
  if (settings?.headerMessage) wrap(settings.headerMessage, receiptColumns).forEach((line) => lines.push(center(line, receiptColumns)));
  if (settings?.address) wrap(settings.address, receiptColumns).forEach((line) => lines.push(center(line, receiptColumns)));
  if (settings?.supportPhone) lines.push(center(settings.supportPhone, receiptColumns));
  lines.push("", center(receipt.receiptNumber, receiptColumns));
  lines.push(center(new Date(receipt.date).toLocaleString("en-PH"), receiptColumns));
  lines.push("-".repeat(receiptColumns));
  if (settings?.showCustomer !== false && receipt.customerName) lines.push(...wrap(`Customer: ${receipt.customerName}`, receiptColumns));
  if (settings?.showCashier !== false) lines.push(...wrap(`Cashier: ${receipt.cashierName}`, receiptColumns));
  lines.push("-".repeat(receiptColumns));

  receipt.items.forEach((item) => {
    lines.push(...wrap(item.name, receiptColumns));
    lines.push(columns(`${item.quantity} x ${money(item.unitPrice)}`, money(item.lineTotal ?? item.quantity * item.unitPrice), receiptColumns));
  });

  lines.push("-".repeat(receiptColumns));
  lines.push(columns("Subtotal", money(receipt.subtotal), receiptColumns));
  if ((receipt.discount ?? 0) > 0) lines.push(columns("Discount", `-${money(receipt.discount ?? 0)}`, receiptColumns));
  lines.push(columns(settings?.taxLabel || "Tax", money(receipt.tax), receiptColumns));
  lines.push("=".repeat(receiptColumns));
  lines.push(columns("TOTAL", money(receipt.total), receiptColumns));
  if (settings?.showPaymentDetails !== false) {
    lines.push(columns(`Paid (${paymentLabel(receipt.paymentMethod)})`, money(receipt.paidAmount), receiptColumns));
    lines.push(columns("Change", money(receipt.change), receiptColumns));
  }
  lines.push("=".repeat(receiptColumns), "");
  wrap(settings?.receiptFooter || "Thank you for your purchase!", receiptColumns).forEach((line) => lines.push(center(line, receiptColumns)));
  return `${lines.join("\n")}\n`;
}

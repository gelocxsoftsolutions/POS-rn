const RECEIPT_COLUMNS = 32;

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
}

const clean = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const money = (value: number) => `PHP ${Number(value || 0).toFixed(2)}`;

function center(value: string) {
  const text = clean(value).slice(0, RECEIPT_COLUMNS);
  return `${" ".repeat(Math.max(0, Math.floor((RECEIPT_COLUMNS - text.length) / 2)))}${text}`;
}

function wrap(value: string, width = RECEIPT_COLUMNS) {
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

function columns(left: string, right: string) {
  const rightText = clean(right).slice(0, RECEIPT_COLUMNS);
  const leftWidth = Math.max(1, RECEIPT_COLUMNS - rightText.length - 1);
  const leftText = clean(left).slice(0, leftWidth);
  return `${leftText}${" ".repeat(Math.max(1, RECEIPT_COLUMNS - leftText.length - rightText.length))}${rightText}`;
}

const paymentLabel = (method: string) => method === "DIGITAL" ? "GCash/QRPh" : method;

export function formatEscPosReceipt(
  receipt: EscPosReceiptData,
  settings: EscPosReceiptSettings | null
) {
  const lines: string[] = [];
  lines.push(center(settings?.storeName || "NCT Seafoods"));
  if (settings?.address) wrap(settings.address).forEach((line) => lines.push(center(line)));
  if (settings?.supportPhone) lines.push(center(settings.supportPhone));
  lines.push("", center(receipt.receiptNumber));
  lines.push(center(new Date(receipt.date).toLocaleString("en-PH")));
  lines.push("-".repeat(RECEIPT_COLUMNS));
  if (receipt.customerName) lines.push(...wrap(`Customer: ${receipt.customerName}`));
  lines.push(...wrap(`Cashier: ${receipt.cashierName}`));
  lines.push("-".repeat(RECEIPT_COLUMNS));

  receipt.items.forEach((item) => {
    lines.push(...wrap(item.name));
    lines.push(columns(`${item.quantity} x ${money(item.unitPrice)}`, money(item.lineTotal ?? item.quantity * item.unitPrice)));
  });

  lines.push("-".repeat(RECEIPT_COLUMNS));
  lines.push(columns("Subtotal", money(receipt.subtotal)));
  if ((receipt.discount ?? 0) > 0) lines.push(columns("Discount", `-${money(receipt.discount ?? 0)}`));
  lines.push(columns(settings?.taxLabel || "Tax", money(receipt.tax)));
  lines.push("=".repeat(RECEIPT_COLUMNS));
  lines.push(columns("TOTAL", money(receipt.total)));
  lines.push(columns(`Paid (${paymentLabel(receipt.paymentMethod)})`, money(receipt.paidAmount)));
  lines.push(columns("Change", money(receipt.change)));
  lines.push("=".repeat(RECEIPT_COLUMNS), "");
  wrap(settings?.receiptFooter || "Thank you for your purchase!").forEach((line) => lines.push(center(line)));
  return `${lines.join("\n")}\n`;
}

import { Alert, Platform } from "react-native";
import * as Print from "expo-print";
import QRCodeLib from "qrcode";
import type {
  ReceiptPreviewData,
  ReceiptPreviewSettings,
} from "@/components/ui/receipt-preview-modal";
import { getPrintableAssetDataUri, getPrintableFileDataUri } from "@/lib/printing/print-assets";
import { BluetoothPrinter } from "@/lib/printers/bluetooth-printer";
import { formatEscPosReceipt } from "@/lib/printers/escpos-receipt";
import { serializeReceiptQrMatrix } from "@/lib/printers/qr-matrix";
import { createCode128Svg } from "@/lib/barcodes/code128";

const RECEIPT_WIDTH_MM = 58;

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const paymentMethodLabel = (method: string) =>
  method === "DIGITAL" ? "GCash/QRPh" : method;

/**
 * Prints a receipt with the same output as the sales checkout flow:
 * Bluetooth ESC/POS on Android, system print HTML elsewhere.
 * Returns true when the print job was dispatched.
 */
export async function printReceiptPaper(input: {
  receipt: ReceiptPreviewData;
  settings?: ReceiptPreviewSettings | null;
  printerAddress?: string | null;
}): Promise<boolean> {
  const { receipt } = input;
  const settings = input.settings ?? null;

  try {
    const receiptWidthMm = settings?.paperWidthMm === 80 ? 80 : RECEIPT_WIDTH_MM;
    const receiptWidthPoints = Math.round((receiptWidthMm / 25.4) * 72);
    const configuredLogoUri = await getPrintableFileDataUri(settings?.logoUri);
    const logoUri = configuredLogoUri || await getPrintableAssetDataUri(
      require("../../assets/thermal-printer-logo.jpg"), "image/jpeg"
    );

    if (Platform.OS === "android") {
      if (!input.printerAddress) {
        Alert.alert("Print Receipt", "Select a Bluetooth thermal printer in Settings first.");
        return false;
      }
      const receiptText = formatEscPosReceipt(
        {
          receiptNumber: receipt.receiptNumber,
          date: receipt.date,
          customerName: receipt.customerName,
          cashierName: receipt.cashierName,
          items: receipt.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.quantity * item.unitPrice,
          })),
          subtotal: receipt.subtotal,
          discount: 0,
          tax: receipt.tax,
          total: receipt.total,
          paidAmount: receipt.paidAmount,
          change: receipt.change,
          paymentMethod: receipt.paymentMethod,
        },
        settings
      );
      await BluetoothPrinter.printReceipt(
        input.printerAddress,
        receiptText,
        logoUri,
        String(receipt.receiptNumber),
        serializeReceiptQrMatrix(String(receipt.receiptNumber)),
        true
      );
      return true;
    }

    let qrSvg = "";
    try {
      qrSvg = await QRCodeLib.toString(String(receipt.receiptNumber ?? receipt.date ?? "receipt"), { type: "svg", margin: 1, width: 200, errorCorrectionLevel: "L" });
      // Ensure svg scales to container
      qrSvg = qrSvg.replace('<svg ', '<svg style="width:42mm;height:42mm;display:block;margin:0 auto;" ');
    } catch {
      qrSvg = "";
    }
    const receiptBarcodeSvg = settings?.showReceiptBarcode === false ? "" : createCode128Svg(String(receipt.receiptNumber));
    if (settings?.showReceiptQr === false) qrSvg = "";

    const receiptHeightMm = Math.max(218, 206 + receipt.items.length * 11);
    const receiptHeightPoints = Math.round((receiptHeightMm / 25.4) * 72);
    const itemRows = receipt.items.map((item) => `
      <div class="item">
        <div class="item-copy">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${item.quantity} x &#8369;${item.unitPrice.toFixed(2)}</span>
        </div>
        <strong>&#8369;${(item.unitPrice * item.quantity).toFixed(2)}</strong>
      </div>
    `).join("");

    const html = `<!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            @page { size: ${receiptWidthMm}mm ${receiptHeightMm}mm; margin: 0; }
            * { box-sizing: border-box; }
            html, body { width: ${receiptWidthMm}mm; margin: 0; padding: 0; background: #fff; color: #000; }
            body { padding: 4mm 3mm; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; }
            .center { text-align: center; }
            .logo { width: 24mm; height: 24mm; object-fit: contain; margin: 0 auto 4mm; display: block; }
            h1 { font-size: 12pt; margin: 0 0 1mm; }
            .meta { font-size: 7.5pt; line-height: 1.35; margin: 0; }
            .receipt-number { margin-top: 2mm; font-weight: 700; }
            .rule { border-top: 0.25mm dashed #000; margin: 2.5mm 0; }
            .item, .total-row { display: flex; justify-content: space-between; gap: 2mm; margin-bottom: 1.5mm; }
            .item-copy { min-width: 0; flex: 1; }
            .item-copy strong, .item-copy span { display: block; overflow-wrap: anywhere; }
            .item-copy span { font-size: 7.5pt; margin-top: 0.5mm; }
            .total { font-size: 11pt; font-weight: 700; margin-top: 2mm; }
            .footer { margin-top: 3mm; text-align: center; font-size: 8pt; }
            .barcode { margin: 4mm auto 2mm; width: 46mm; text-align: center; }
            .barcode svg { width: 46mm; height: 14mm; display: block; }
            .qr { margin: 4mm 0 2mm; text-align: center; }
            .qr svg { width: 42mm; height: 42mm; }
          </style>
        </head>
        <body>
          ${logoUri ? `<img class="logo" src="${logoUri}" />` : ""}
          <div class="center">
            <h1>${escapeHtml(settings?.storeName || "NCT Seafoods")}</h1>
            ${settings?.headerMessage ? `<p class="meta">${escapeHtml(settings.headerMessage)}</p>` : ""}
            ${settings?.address ? `<p class="meta">${escapeHtml(settings.address)}</p>` : ""}
            ${settings?.supportPhone ? `<p class="meta">${escapeHtml(settings.supportPhone)}</p>` : ""}
            <p class="meta receipt-number">${escapeHtml(receipt.receiptNumber)}</p>
            <p class="meta">${escapeHtml(new Date(receipt.date).toLocaleString())}</p>
          </div>
          <div class="rule"></div>
          ${settings?.showCustomer !== false && receipt.customerName ? `<p class="meta">Customer: ${escapeHtml(receipt.customerName)}</p>` : ""}
          ${settings?.showCashier !== false ? `<p class="meta">Cashier: ${escapeHtml(receipt.cashierName)}</p>` : ""}
          <div class="rule"></div>
          ${itemRows}
          <div class="rule"></div>
          <div class="total-row"><span>Subtotal</span><strong>&#8369;${receipt.subtotal.toFixed(2)}</strong></div>
          <div class="total-row"><span>${escapeHtml(settings?.taxLabel || "Tax")}</span><strong>&#8369;${receipt.tax.toFixed(2)}</strong></div>
          <div class="total-row total"><span>Total</span><span>&#8369;${receipt.total.toFixed(2)}</span></div>
          ${settings?.showPaymentDetails !== false ? `<div class="total-row"><span>Paid (${escapeHtml(paymentMethodLabel(receipt.paymentMethod))})</span><span>&#8369;${receipt.paidAmount.toFixed(2)}</span></div><div class="total-row"><span>Change</span><span>&#8369;${receipt.change.toFixed(2)}</span></div>` : ""}
          <div class="rule"></div>
          <p class="footer">${escapeHtml(settings?.receiptFooter || "Thank you for your purchase!")}</p>
          ${receiptBarcodeSvg ? `<div class="barcode">${receiptBarcodeSvg}</div>` : ""}
          ${qrSvg ? `<div class="qr">${qrSvg}</div>` : ""}
        </body>
      </html>`;

    let printerUrl: string | undefined;
    if (Platform.OS === "ios") {
      const printer = await Print.selectPrinterAsync();
      printerUrl = printer.url;
    }

    await Print.printAsync({
      html,
      printerUrl,
      width: receiptWidthPoints,
      height: receiptHeightPoints,
      margins: Platform.OS === "ios" ? { top: 0, right: 0, bottom: 0, left: 0 } : undefined,
    });
    return true;
  } catch (error: any) {
    const message = error?.message?.toLowerCase().includes("cancel")
      ? "Printer selection was cancelled."
      : error?.message ?? "No thermal printer was selected or the print service is unavailable.";
    Alert.alert("Print Receipt", message);
    return false;
  }
}

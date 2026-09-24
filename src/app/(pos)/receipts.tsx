import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Share,
  Modal,
  ScrollView,
} from "react-native";
import * as Print from "expo-print";
import { File } from "expo-file-system";
import QRCodeLib from "qrcode";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SaleService } from "@/lib/services/sale.service";
import { ReceiptService } from "@/lib/services/receipt.service";
import { SettingsService } from "@/lib/services/settings.service";
import { useIsDarkTheme, useUiStore } from "@/lib/stores/ui-store";
import type { SaleDTO } from "@/lib/types/sales";
import type { StoreSettingsRow } from "@/lib/repositories/settings.repository";
import { ReceiptQrScannerModal } from "@/components/ui/receipt-qr-scanner-modal";
import { ReceiptPreviewModal } from "@/components/ui/receipt-preview-modal";
import { PaginationControls } from "@/components/ui/pagination-controls";

const paymentMethodLabel = (method: string) => method === "DIGITAL" ? "GCash/QRPh" : method;

const RECEIPT_WIDTH_MM = 58;
const RECEIPT_WIDTH_POINTS = Math.round((RECEIPT_WIDTH_MM / 25.4) * 72);

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export default function ReceiptsScreen() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SaleDTO | null>(null);
  const [receipts, setReceipts] = useState<SaleDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [printPreviewVisible, setPrintPreviewVisible] = useState(false);
  const [receiptSettings, setReceiptSettings] = useState<StoreSettingsRow | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [printing, setPrinting] = useState(false);
  const dark = useIsDarkTheme();
  const pageSize = useUiStore((state) => state.pageSizes?.receipts ?? 10);
  const setPageSize = useUiStore((state) => state.setPageSize);

  const loadReceipts = useCallback(async () => {
    try {
      const result = await SaleService.list({ page: 1, pageSize: 500 });
      setReceipts(result.items);
    } catch {
      // keep empty
    }
  }, []);

  const loadReceiptSettings = useCallback(async () => {
    const settings = await SettingsService.get();
    setReceiptSettings(settings);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadReceipts(), loadReceiptSettings()]);
      setLoading(false);
    })();
  }, [loadReceiptSettings, loadReceipts]);

  const filtered = receipts.filter(
    (r) =>
      r.receiptNumber.toLowerCase().includes(search.toLowerCase()) ||
      (r.paymentMethod ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const methodColor = (method: string) => {
    switch (method) {
      case "CASH": return "#28a745";
      case "CARD": return "#6f42c1";
      case "DIGITAL": return "#17a2b8";
      default: return "#6b7b8d";
    }
  };

  const handlePrintReceipt = useCallback(async () => {
    if (!selected || printing) return;
    setPrinting(true);
    try {
      const logoSource = Image.resolveAssetSource(require("../../../assets/thermal-printer-logo.jpg"));
      let logoUri = Platform.OS === "web" ? logoSource.uri : "";
      if (Platform.OS !== "web") {
        try {
          const logoBase64 = await new File(logoSource.uri).base64();
          logoUri = `data:image/jpeg;base64,${logoBase64}`;
        } catch {
          logoUri = "";
        }
      }

      let qrSvg = "";
      try {
        qrSvg = await QRCodeLib.toString(String(selected.receiptNumber), { type: "svg", margin: 1, width: 160 });
        qrSvg = qrSvg.replace('<svg ', '<svg style="width:28mm;height:28mm;display:block;margin:0 auto;" ');
      } catch {
        qrSvg = "";
      }

      const receiptHeightMm = Math.max(150, 138 + (selected.items?.length ?? 0) * 11);
      const receiptHeightPoints = Math.round((receiptHeightMm / 25.4) * 72);
      const itemRows = (selected.items ?? [])
        .map(
          (item) => `
        <div class="item">
          <div class="item-copy">
            <strong>${escapeHtml(item.productName)}</strong>
            <span>${item.quantity} x &#8369;${item.unitPrice.toFixed(2)}</span>
          </div>
          <strong>&#8369;${item.lineTotal.toFixed(2)}</strong>
        </div>
      `
        )
        .join("");

      const html = `<!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <style>
              @page { size: ${RECEIPT_WIDTH_MM}mm ${receiptHeightMm}mm; margin: 0; }
              * { box-sizing: border-box; }
              html, body { width: ${RECEIPT_WIDTH_MM}mm; margin: 0; padding: 0; background: #fff; color: #000; }
              body { padding: 4mm 3mm; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; }
              .center { text-align: center; }
              .logo { width: 24mm; height: 24mm; object-fit: contain; margin: 0 auto 1.5mm; display: block; }
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
              .qr { margin: 4mm 0 2mm; text-align: center; }
              .qr svg { width: 28mm; height: 28mm; }
              .qr-caption { font-size: 6.5pt; text-align: center; margin-top: 1mm; letter-spacing: 0.3pt; }
            </style>
          </head>
          <body>
            ${logoUri ? `<img class="logo" src="${logoUri}" />` : ""}
            <div class="center">
              <h1>${escapeHtml(receiptSettings?.storeName || "NCT Seafoods")}</h1>
              ${receiptSettings?.address ? `<p class="meta">${escapeHtml(receiptSettings.address)}</p>` : ""}
              ${receiptSettings?.supportPhone ? `<p class="meta">${escapeHtml(receiptSettings.supportPhone)}</p>` : ""}
              <p class="meta receipt-number">${escapeHtml(selected.receiptNumber)}</p>
              <p class="meta">${escapeHtml(new Date(selected.createdAt).toLocaleString())}</p>
            </div>
            <div class="rule"></div>
            ${selected.customerName ? `<p class="meta">Customer: ${escapeHtml(selected.customerName)}</p>` : ""}
            <p class="meta">Cashier: ${escapeHtml(selected.cashierName)}</p>
            <div class="rule"></div>
            ${itemRows}
            <div class="rule"></div>
            <div class="total-row"><span>Subtotal</span><strong>&#8369;${selected.subtotal.toFixed(2)}</strong></div>
            ${selected.discount > 0 ? `<div class="total-row"><span>Discount</span><strong>-&#8369;${selected.discount.toFixed(2)}</strong></div>` : ""}
            <div class="total-row"><span>Tax</span><strong>&#8369;${selected.tax.toFixed(2)}</strong></div>
            <div class="total-row total"><span>Total</span><span>&#8369;${selected.total.toFixed(2)}</span></div>
            <div class="total-row"><span>Paid (${escapeHtml(paymentMethodLabel(selected.paymentMethod))})</span><span>&#8369;${selected.paidAmount.toFixed(2)}</span></div>
            <div class="total-row"><span>Change</span><span>&#8369;${selected.changeAmount.toFixed(2)}</span></div>
            <div class="rule"></div>
            <p class="footer">${escapeHtml(receiptSettings?.receiptFooter || "Thank you for your purchase!")}</p>
            ${qrSvg ? `<div class="qr">${qrSvg}<div class="qr-caption">${escapeHtml(selected.receiptNumber)}</div></div>` : ""}
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
        width: RECEIPT_WIDTH_POINTS,
        height: receiptHeightPoints,
        margins: Platform.OS === "ios" ? { top: 0, right: 0, bottom: 0, left: 0 } : undefined,
      });
    } catch (error: any) {
      const message = error?.message?.toLowerCase().includes("cancel")
        ? "Printer selection was cancelled."
        : "No thermal printer was selected or the print service is unavailable.";
      Alert.alert("Print Receipt", message);
    } finally {
      setPrinting(false);
    }
  }, [selected, receiptSettings, printing]);

  const handleScanReceipt = useCallback(
    (barcode: string) => {
      const trimmed = barcode.trim();
      // Try exact match on receiptNumber, otherwise fallback to contains search
      const found =
        receipts.find((r) => r.receiptNumber === trimmed) ??
        receipts.find((r) => r.receiptNumber.toLowerCase().includes(trimmed.toLowerCase())) ??
        receipts.find((r) => r.id === trimmed);
      if (found) {
        setSelected(found);
        setPrintPreviewVisible(true);
      } else {
        Alert.alert("Not Found", `No receipt matched "${trimmed}".`);
      }
    },
    [receipts]
  );

  const openScanner = useCallback(() => setScannerVisible(true), []);
  const closeScanner = useCallback(() => setScannerVisible(false), []);
  const handleBarcodeScanned = useCallback(
    async (barcode: string) => {
      setScannerVisible(false);
      // slight delay to allow modal to close before showing result
      setTimeout(() => handleScanReceipt(barcode), 300);
    },
    [handleScanReceipt]
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedReceipts = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const renderReceipt = ({ item }: { item: SaleDTO }) => (
    <TouchableOpacity
      onPress={() => {
        setSelected(item);
        setPrintPreviewVisible(true);
      }}
      activeOpacity={0.7}
    >
      <Card style={[styles.receiptCard, { backgroundColor: dark ? "#141922" : "#ffffff", borderColor: dark ? "#28303d" : "#dde3ea" }]}>
        <View style={styles.receiptRow}>
          <View style={[styles.receiptIcon, { backgroundColor: dark ? "#1b2638" : "#eef3f8" }]}>
            <Ionicons name="receipt-outline" size={19} color={dark ? "#8fb4e8" : "#17386b"} />
          </View>
          <View style={styles.receiptInfo}>
            <Text style={[styles.receiptNumber, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{item.receiptNumber}</Text>
            <Text style={[styles.receiptDate, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>{formatDate(item.createdAt)}</Text>
            <Text style={styles.receiptItems}>{item.itemCount} items</Text>
          </View>
          <View style={styles.receiptRight}>
            <Text style={styles.receiptTotal}>₱{item.total.toFixed(2)}</Text>
            <Badge label={paymentMethodLabel(item.paymentMethod)} color={methodColor(item.paymentMethod)} size="sm" />
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#17386b" />
      </View>
    );
  }



  return (
    <View style={[styles.container, { backgroundColor: dark ? "#0b0f16" : "#f4f6f8" }]}>
      <View style={styles.pageHeading}>
        <View>
          <Text style={[styles.pageTitle, { color: dark ? "#f8fafc" : "#17202b" }]}>Receipts</Text>
          <Text style={[styles.pageSubtitle, { color: dark ? "#8f9baa" : "#667085" }]}>Completed sales and payment records</Text>
        </View>
        <Text style={[styles.receiptCount, { color: dark ? "#aab4c2" : "#475467" }]}>{filtered.length} records</Text>
      </View>
      <View style={styles.searchTools}>
        <View style={[styles.searchBar, { backgroundColor: dark ? "#141922" : "#ffffff", borderColor: dark ? "#28303d" : "#dde3ea" }]}>
          <Ionicons name="search" size={18} color="#8e99a4" />
          <TextInput
            style={[styles.searchInput, { color: dark ? "#e2e8f0" : "#1a202c" }]}
            placeholder="Search receipts..."
            placeholderTextColor={dark ? "#6b7b8d" : "#b0b8c1"}
            value={search}
            onChangeText={(value) => { setSearch(value); setPage(1); }}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => { setSearch(""); setPage(1); }}>
              <Ionicons name="close-circle" size={18} color="#8e99a4" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.scanBtn} onPress={openScanner} accessibilityLabel="Scan receipt QR">
          <Ionicons name="scan" size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>
      <FlatList
        style={styles.receiptList}
        data={pagedReceipts}
        renderItem={renderReceipt}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={48} color="#d1d9e6" />
            <Text style={styles.emptyText}>No receipts found</Text>
          </View>
        }
      />
      <PaginationControls
        page={page}
        totalPages={totalPages}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize("receipts", size);
          setPage(1);
        }}
        dark={dark}
      />
      <ReceiptPreviewModal
        visible={printPreviewVisible}
        onClose={() => {
          setPrintPreviewVisible(false);
          setSelected(null);
        }}
        receipt={
          selected
            ? {
                receiptNumber: selected.receiptNumber,
                date: selected.createdAt,
                customerName: selected.customerName ?? undefined,
                cashierName: selected.cashierName,
                items: (selected.items ?? []).map((i) => ({
                  name: i.productName,
                  quantity: i.quantity,
                  unitPrice: i.unitPrice,
                })),
                subtotal: selected.subtotal,
                tax: selected.tax,
                total: selected.total,
                paidAmount: selected.paidAmount,
                change: selected.changeAmount,
                paymentMethod: selected.paymentMethod,
              }
            : null
        }
        settings={
          receiptSettings
            ? {
                storeName: receiptSettings.storeName,
                address: receiptSettings.address ?? undefined,
                supportPhone: receiptSettings.supportPhone ?? undefined,
                receiptFooter: receiptSettings.receiptFooter ?? undefined,
                taxLabel: undefined,
              }
            : null
        }
        onPrint={handlePrintReceipt}
        printing={printing}
      />
      <ReceiptQrScannerModal
        visible={scannerVisible}
        dark={dark}
        onClose={closeScanner}
        onScan={handleBarcodeScanned}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fbff",
  },
  receiptList: {
    flex: 1,
  },
  pageHeading: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 2,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "800",
  },
  pageSubtitle: {
    fontSize: 12,
    marginTop: 3,
  },
  receiptCount: {
    fontSize: 12,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 14,
    color: "#6b7b8d",
    marginTop: 8,
  },
  searchTools: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  scanBtn: {
    width: 46,
    height: 46,
    backgroundColor: "#17386b",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: 14,
    color: "#1a202c",
  },
  list: {
    padding: 16,
    paddingTop: 8,
  },
  receiptCard: {
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 8,
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 0,
  },
  receiptRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  receiptInfo: {
    flex: 1,
  },
  receiptIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  receiptNumber: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a202c",
  },
  receiptDate: {
    fontSize: 12,
    color: "#6b7b8d",
    marginTop: 2,
  },
  receiptItems: {
    fontSize: 11,
    color: "#8e99a4",
    marginTop: 2,
  },
  receiptRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  receiptTotal: {
    fontSize: 16,
    fontWeight: "700",
    color: "#17386b",
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f0f4ff",
    alignItems: "center",
    justifyContent: "center",
  },
  detailTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#1a202c",
  },
  printBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#17386b",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  printBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  detailCard: {
    margin: 16,
    padding: 24,
    borderWidth: 1,
    borderRadius: 8,
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  detailStore: {
    fontSize: 20,
    fontWeight: "700",
    color: "#17386b",
    textAlign: "center",
  },
  detailDate: {
    fontSize: 12,
    color: "#6b7b8d",
    textAlign: "center",
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "#e8edf3",
    marginVertical: 16,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 13,
    color: "#6b7b8d",
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a202c",
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a202c",
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#17386b",
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  previewContainer: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "92%",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    overflow: "hidden",
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  previewCloseIcon: {
    padding: 4,
  },
  previewScroll: {
    padding: 18,
  },
  receiptPaper: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 24,
    paddingVertical: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  receiptLogo: {
    width: 112,
    height: 112,
    alignSelf: "center",
    marginBottom: 8,
  },
  paperStore: {
    fontSize: 20,
    fontWeight: "800",
    color: "#000000",
    textAlign: "center",
    marginBottom: 4,
  },
  paperReceiptNumber: {
    fontSize: 13,
    fontWeight: "700",
    color: "#000000",
    textAlign: "center",
  },
  paperMeta: {
    fontSize: 11,
    color: "#334155",
    textAlign: "center",
    marginTop: 2,
  },
  paperDivider: {
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: "#64748b",
    marginVertical: 14,
  },
  paperItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  paperItemInfo: {
    flex: 1,
    paddingRight: 12,
  },
  paperItemName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#000000",
  },
  paperItemQty: {
    fontSize: 10,
    color: "#475569",
    marginTop: 2,
  },
  paperItemPrice: {
    fontSize: 12,
    fontWeight: "600",
    color: "#000000",
  },
  paperTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 7,
  },
  paperLabel: {
    fontSize: 12,
    color: "#334155",
  },
  paperValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#000000",
  },
  paperGrandTotal: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000000",
    paddingVertical: 9,
    marginVertical: 6,
  },
  paperGrandTotalText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#000000",
  },
  paperFooter: {
    fontSize: 11,
    color: "#334155",
    textAlign: "center",
  },
  paperQR: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  paperQRCaption: {
    fontSize: 9,
    color: "#475569",
    marginTop: 8,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  previewActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  previewCancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  previewCancelText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "600",
  },
  previewPrintBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#17386b",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  previewPrintText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
});

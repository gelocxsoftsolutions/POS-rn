import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ToastAndroid,
  Platform,
  Share,
  Modal,
  ScrollView,
} from "react-native";
import * as Print from "expo-print";
import QRCodeLib from "qrcode";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SaleService } from "@/lib/services/sale.service";
import { SaleSyncService } from "@/lib/services/sale-sync.service";
import { ReceiptService } from "@/lib/services/receipt.service";
import { SettingsService, type ResolvedSettings } from "@/lib/services/settings.service";
import { useIsDarkTheme, usePosTheme, useUiStore } from "@/lib/stores/ui-store";
import type { SaleDTO } from "@/lib/types/sales";
import { ReceiptQrScannerModal } from "@/components/ui/receipt-qr-scanner-modal";
import { ReceiptPreviewModal } from "@/components/ui/receipt-preview-modal";
import { UsbBarcodeScannerInput } from "@/components/ui/usb-barcode-scanner-input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { getPrintableAssetDataUri, getPrintableFileDataUri } from "@/lib/printing/print-assets";
import { useAccessSettingsStore } from "@/lib/stores/access-settings-store";
import { usePrinterStore } from "@/lib/stores/printer-store";
import { BluetoothPrinter } from "@/lib/printers/bluetooth-printer";
import { formatEscPosReceipt } from "@/lib/printers/escpos-receipt";
import { serializeReceiptQrMatrix } from "@/lib/printers/qr-matrix";
import { createCode128Svg } from "@/lib/barcodes/code128";
import { canonicalScannedCode, normalizeScannedCode } from "@/lib/barcodes/normalize-scanned-code";
import { useBusinessConfigStore } from "@/lib/stores/business-config-store";

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
  const [receiptSettings, setReceiptSettings] = useState<ResolvedSettings | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const searchScanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchBurstRef = useRef({ startedAt: 0, lastAt: 0 });
  const dark = useIsDarkTheme();
  const theme = usePosTheme();
  const pageSize = useUiStore((state) => state.pageSizes?.receipts ?? 10);
  const setPageSize = useUiStore((state) => state.setPageSize);
  const salesGroupCashierIds = useAccessSettingsStore((state) => state.salesGroupCashierIds);
  const selectedPrinter = usePrinterStore((state) => state.selectedPrinter);
  const operatingMode = useBusinessConfigStore((state) => state.configuration.operatingMode);
  const showOmsSyncStatus = false; // Dealership sales are protected by database backups, not sale replay.

  const loadReceipts = useCallback(async () => {
    try {
      const result = await SaleService.list({ page: 1, pageSize: 500 });
      setReceipts(result.items);
    } catch {
      // keep empty
    }
  }, [salesGroupCashierIds]);

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

  const syncInfo = (item: SaleDTO): { label: string; color: string } | null => {
    switch (item.syncStatus) {
      case "SYNCED": return { label: "Synced", color: "#28a745" };
      case "FAILED": return { label: "Not synced", color: "#dc3545" };
      case "PENDING": return { label: "Pending sync", color: "#f0ad4e" };
      case "UNSYNCED": return { label: "Not synced", color: "#6b7b8d" };
      default: return null;
    }
  };

  const retrySale = useCallback(
    async (saleId: string) => {
      setRetryingId(saleId);
      try {
        const result = await SaleSyncService.retrySale(saleId);
        await loadReceipts();
        if (!result.success) {
          Alert.alert("Retry failed", result.error ?? "Could not record this sale in the OMS.");
        }
      } finally {
        setRetryingId(null);
      }
    },
    [loadReceipts]
  );

  const handlePrintReceipt = useCallback(async () => {
    if (!selected || printing) return;
    setPrinting(true);
    try {
      const historicalReceipt = await ReceiptService.getBySaleId(selected.id);
      let historicalSettings = receiptSettings;
      try {
        const snapshot = historicalReceipt?.templateSnapshot
          ? JSON.parse(historicalReceipt.templateSnapshot)
          : null;
        if (snapshot && receiptSettings) {
          historicalSettings = {
            ...receiptSettings,
            storeName: snapshot.businessName ?? historicalReceipt?.storeName,
            address: snapshot.address ?? historicalReceipt?.address,
            supportPhone: snapshot.supportPhone ?? historicalReceipt?.phone,
            logoUri: snapshot.receiptLogoUri || snapshot.businessLogoUri || receiptSettings?.logoUri,
            receiptFooter: snapshot.template?.footerMessage ?? historicalReceipt?.footer,
            ...snapshot.template,
          };
        }
      } catch {}
      const logoUri = await getPrintableFileDataUri(historicalSettings?.logoUri) || await getPrintableAssetDataUri(
        require("../../../assets/thermal-printer-logo.jpg"),
        "image/jpeg"
      );

      if (Platform.OS === "android") {
        if (!selectedPrinter) {
          Alert.alert("Print Receipt", "Select a Bluetooth thermal printer in Settings first.");
          return;
        }
        const receiptText = formatEscPosReceipt(
          {
            receiptNumber: selected.receiptNumber,
            date: selected.createdAt,
            customerName: selected.customerName,
            cashierName: selected.cashierName,
            items: (selected.items ?? []).map((item) => ({
              name: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
            })),
            subtotal: selected.subtotal,
            discount: selected.discount,
            tax: selected.tax,
            total: selected.total,
            paidAmount: selected.paidAmount,
            change: selected.changeAmount,
            paymentMethod: selected.paymentMethod,
          },
          historicalSettings
        );
        await BluetoothPrinter.printReceipt(
          selectedPrinter.address,
          receiptText,
          logoUri,
          selected.receiptNumber,
          serializeReceiptQrMatrix(selected.receiptNumber),
          false
        );
        return;
      }

      let qrSvg = "";
      try {
        qrSvg = await QRCodeLib.toString(String(selected.receiptNumber), { type: "svg", margin: 1, width: 200, errorCorrectionLevel: "L" });
        qrSvg = qrSvg.replace('<svg ', '<svg style="width:42mm;height:42mm;display:block;margin:0 auto;" ');
      } catch {
        qrSvg = "";
      }
      const receiptBarcodeSvg = createCode128Svg(selected.receiptNumber);

      const receiptHeightMm = Math.max(218, 206 + (selected.items?.length ?? 0) * 11);
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
              <h1>${escapeHtml(historicalSettings?.storeName || "NCT Seafoods")}</h1>
              ${historicalSettings?.address ? `<p class="meta">${escapeHtml(historicalSettings.address)}</p>` : ""}
              ${historicalSettings?.supportPhone ? `<p class="meta">${escapeHtml(historicalSettings.supportPhone)}</p>` : ""}
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
            <p class="footer">${escapeHtml(historicalSettings?.receiptFooter || "Thank you for your purchase!")}</p>
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
        width: RECEIPT_WIDTH_POINTS,
        height: receiptHeightPoints,
        margins: Platform.OS === "ios" ? { top: 0, right: 0, bottom: 0, left: 0 } : undefined,
      });
    } catch (error: any) {
      const message = error?.message?.toLowerCase().includes("cancel")
        ? "Printer selection was cancelled."
        : error?.message ?? "No thermal printer was selected or the print service is unavailable.";
      Alert.alert("Print Receipt", message);
    } finally {
      setPrinting(false);
    }
  }, [selected, receiptSettings, printing, selectedPrinter]);

  const handleScanReceipt = useCallback(
    async (barcode: string) => {
      const normalized = normalizeScannedCode(barcode);
      if (!normalized) return;
      const canonical = canonicalScannedCode(normalized);
      let found =
        receipts.find((r) => canonicalScannedCode(r.receiptNumber) === canonical) ??
        receipts.find((r) => canonicalScannedCode(r.id) === canonical);
      if (!found) found = await SaleService.getByReceiptNumber(normalized) ?? undefined;
      if (found) {
        setSelected(found);
        setPrintPreviewVisible(true);
      } else {
        const message = `No receipt matched barcode ${normalized}.`;
        if (Platform.OS === "android") ToastAndroid.show(message, ToastAndroid.LONG);
        else Alert.alert("Not Found", message);
      }
    },
    [receipts]
  );

  const openExactReceiptFromSearch = useCallback((candidate: string) => {
    const canonical = canonicalScannedCode(candidate);
    if (!canonical) return false;
    const exact = receipts.some((receipt) =>
      canonicalScannedCode(receipt.receiptNumber) === canonical || canonicalScannedCode(receipt.id) === canonical
    );
    if (!exact) return false;
    setSearch("");
    setPage(1);
    void handleScanReceipt(candidate);
    return true;
  }, [handleScanReceipt, receipts]);

  const handleSearchChange = useCallback((value: string) => {
    const now = Date.now();
    if (value.length <= 1 || now - searchBurstRef.current.lastAt > 140) searchBurstRef.current.startedAt = now;
    searchBurstRef.current.lastAt = now;
    setSearch(value);
    setPage(1);
    if (searchScanTimerRef.current) clearTimeout(searchScanTimerRef.current);
    const candidate = normalizeScannedCode(value);
    if (candidate.length >= 6) {
      searchScanTimerRef.current = setTimeout(() => {
        if (Date.now() - searchBurstRef.current.startedAt <= 1600) openExactReceiptFromSearch(candidate);
      }, 100);
    }
  }, [openExactReceiptFromSearch]);

  useEffect(() => () => {
    if (searchScanTimerRef.current) clearTimeout(searchScanTimerRef.current);
  }, []);

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
      <Card style={[styles.receiptCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.receiptRow}>
          <View style={[styles.receiptIcon, { backgroundColor: theme.surfaceAlt }]}>
            <Ionicons name="receipt-outline" size={19} color={theme.accent} />
          </View>
          <View style={styles.receiptInfo}>
            <Text
              style={[styles.receiptNumber, { color: theme.text }]}
              numberOfLines={1}
            >
              {item.receiptNumber}
            </Text>
            <Text style={[styles.receiptDate, { color: theme.muted }]}>{formatDate(item.createdAt)}</Text>
            <Text style={styles.receiptItems}>{item.itemCount} items</Text>
            {showOmsSyncStatus && item.syncStatus === "FAILED" && item.syncError ? (
              <Text style={styles.syncError} numberOfLines={2}>{item.syncError}</Text>
            ) : null}
          </View>
          <View style={styles.receiptRight}>
            <Text style={[styles.receiptTotal, { color: theme.primary }]}>₱{item.total.toFixed(2)}</Text>
            <Badge
              label={paymentMethodLabel(item.paymentMethod)}
              color={methodColor(item.paymentMethod)}
              size="sm"
              style={styles.receiptPaymentBadge}
            />
            {showOmsSyncStatus && (() => {
              const info = syncInfo(item);
              if (!info) return null;
              return (
                <Badge
                  label={info.label}
                  color={info.color}
                  size="sm"
                  style={styles.receiptPaymentBadge}
                />
              );
            })()}
            {showOmsSyncStatus && (item.syncStatus === "FAILED" || item.syncStatus === "UNSYNCED") && (
              <TouchableOpacity
                style={[styles.retryBtn, { borderColor: theme.accent, backgroundColor: theme.surfaceAlt }]}
                onPress={() => retrySale(item.id)}
                disabled={retryingId === item.id}
              >
                {retryingId === item.id ? (
                  <ActivityIndicator size="small" color={theme.accent} />
                ) : (
                  <Text style={[styles.retryBtnText, { color: theme.accent }]}>Retry</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }



  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.pageHeading}>
        <View>
          <Text style={[styles.pageTitle, { color: theme.text }]}>Receipts</Text>
          <Text style={[styles.pageSubtitle, { color: theme.muted }]}>Completed sales and payment records</Text>
        </View>
        <Text style={[styles.receiptCount, { color: theme.muted }]}>{filtered.length} records</Text>
      </View>
      <View style={styles.searchTools}>
        <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="search" size={18} color={theme.muted} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search receipts..."
            placeholderTextColor={theme.muted}
            value={search}
            onChangeText={handleSearchChange}
            onSubmitEditing={({ nativeEvent }) => { if (!openExactReceiptFromSearch(nativeEvent.text)) setPage(1); }}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => { setSearch(""); setPage(1); }}>
              <Ionicons name="close-circle" size={18} color={theme.muted} />
            </TouchableOpacity>
          )}
        </View>
        <UsbBarcodeScannerInput
          onScan={handleScanReceipt}
          dark={dark}
          disabled={scannerVisible || printPreviewVisible || printing}
        />
        <TouchableOpacity style={[styles.scanBtn, { backgroundColor: theme.primary }]} onPress={openScanner} accessibilityLabel="Scan receipt barcode or QR code">
          <Ionicons name="scan" size={20} color={theme.onPrimary} />
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
            <Ionicons name="receipt-outline" size={48} color={theme.muted} />
            <Text style={[styles.emptyText, { color: theme.muted }]}>No receipts found</Text>
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
    minWidth: 0,
    paddingRight: 12,
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
  syncError: {
    fontSize: 11,
    color: "#dc3545",
    marginTop: 2,
  },
  retryBtn: {
    marginTop: 2,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#17386b",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 64,
  },
  retryBtnText: {
    color: "#17386b",
    fontSize: 12,
    fontWeight: "700",
  },
  receiptRight: {
    width: 132,
    flexShrink: 0,
    alignItems: "flex-end",
    gap: 4,
  },
  receiptPaymentBadge: {
    alignSelf: "flex-end",
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

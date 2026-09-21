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
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SaleService } from "@/lib/services/sale.service";
import { ReceiptService } from "@/lib/services/receipt.service";
import { SettingsService } from "@/lib/services/settings.service";
import { useIsDarkTheme } from "@/lib/stores/ui-store";
import type { SaleDTO } from "@/lib/types/sales";
import type { StoreSettingsRow } from "@/lib/repositories/settings.repository";
import QRCode from "react-native-qrcode-svg";
import { ReceiptQrScannerModal } from "@/components/ui/receipt-qr-scanner-modal";

const paymentMethodLabel = (method: string) => method === "DIGITAL" ? "GCash/QRPh" : method;

export default function ReceiptsScreen() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SaleDTO | null>(null);
  const [receipts, setReceipts] = useState<SaleDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [printPreviewVisible, setPrintPreviewVisible] = useState(false);
  const [receiptSettings, setReceiptSettings] = useState<StoreSettingsRow | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const dark = useIsDarkTheme();

  const loadReceipts = useCallback(async () => {
    try {
      const result = await SaleService.list({ page: 1, pageSize: 50 });
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
    if (!selected) return;
    try {
      if (Platform.OS === "web") {
        window.print();
        return;
      }

      const settings = await SettingsService.get();
      const receiptText = ReceiptService.generateReceiptText(
        selected,
        selected.items ?? [],
        {
          storeName: settings.storeName || "NCT Seafoods",
          storeCode: settings.storeCode,
          address: settings.address,
          phone: settings.supportPhone,
          receiptFooter: settings.receiptFooter,
        }
      );
      await Share.share({
        title: `Receipt ${selected.receiptNumber}`,
        message: receiptText,
      });
    } catch {
      Alert.alert("Print Receipt", "Unable to open the print options for this receipt.");
    }
  }, [selected]);

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
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color="#8e99a4" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.scanBtn} onPress={openScanner} accessibilityLabel="Scan receipt QR">
          <Ionicons name="scan" size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>
      <FlatList
        data={filtered}
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
      {selected && (
        <Modal
          visible={printPreviewVisible}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setPrintPreviewVisible(false);
            setSelected(null);
          }}
        >
          <View style={styles.previewOverlay}>
            <View style={styles.previewContainer}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewTitle}>Receipt Preview</Text>
                <TouchableOpacity
                  style={styles.previewCloseIcon}
                  onPress={() => {
                    setPrintPreviewVisible(false);
                    setSelected(null);
                  }}
                  accessibilityLabel="Close receipt preview"
                >
                  <Ionicons name="close" size={22} color="#334155" />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.previewScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.receiptPaper}>
                  <Image
                    source={require("../../../assets/thermal-printer-logo.jpg")}
                    style={styles.receiptLogo}
                    resizeMode="contain"
                  />
                  <Text style={styles.paperStore}>{receiptSettings?.storeName || "NCT Seafoods"}</Text>
                  {receiptSettings?.address ? <Text style={styles.paperMeta}>{receiptSettings.address}</Text> : null}
                  {receiptSettings?.supportPhone ? <Text style={styles.paperMeta}>{receiptSettings.supportPhone}</Text> : null}
                  <Text style={styles.paperReceiptNumber}>{selected.receiptNumber}</Text>
                  <Text style={styles.paperMeta}>{formatDate(selected.createdAt)}</Text>
                  <Text style={styles.paperMeta}>Cashier: {selected.cashierName}</Text>
                  {selected.customerName ? <Text style={styles.paperMeta}>Customer: {selected.customerName}</Text> : null}

                  <View style={styles.paperDivider} />
                  {(selected.items ?? []).map((item) => (
                    <View key={item.id} style={styles.paperItemRow}>
                      <View style={styles.paperItemInfo}>
                        <Text style={styles.paperItemName}>{item.productName}</Text>
                        <Text style={styles.paperItemQty}>x{item.quantity} @ ₱{item.unitPrice.toFixed(2)}</Text>
                      </View>
                      <Text style={styles.paperItemPrice}>₱{item.lineTotal.toFixed(2)}</Text>
                    </View>
                  ))}

                  <View style={styles.paperDivider} />
                  <View style={styles.paperTotalRow}>
                    <Text style={styles.paperLabel}>Subtotal</Text>
                    <Text style={styles.paperValue}>₱{selected.subtotal.toFixed(2)}</Text>
                  </View>
                  {selected.discount > 0 && (
                    <View style={styles.paperTotalRow}>
                      <Text style={styles.paperLabel}>Discount</Text>
                      <Text style={styles.paperValue}>-₱{selected.discount.toFixed(2)}</Text>
                    </View>
                  )}
                  <View style={styles.paperTotalRow}>
                    <Text style={styles.paperLabel}>Tax</Text>
                    <Text style={styles.paperValue}>₱{selected.tax.toFixed(2)}</Text>
                  </View>
                  <View style={[styles.paperTotalRow, styles.paperGrandTotal]}>
                    <Text style={styles.paperGrandTotalText}>Total</Text>
                    <Text style={styles.paperGrandTotalText}>₱{selected.total.toFixed(2)}</Text>
                  </View>
                  <View style={styles.paperTotalRow}>
                    <Text style={styles.paperLabel}>Paid ({selected.paymentMethod})</Text>
                    <Text style={styles.paperValue}>₱{selected.paidAmount.toFixed(2)}</Text>
                  </View>
                  <View style={styles.paperTotalRow}>
                    <Text style={styles.paperLabel}>Change</Text>
                    <Text style={styles.paperValue}>₱{selected.changeAmount.toFixed(2)}</Text>
                  </View>
                  <View style={styles.paperDivider} />
                  <Text style={styles.paperFooter}>{receiptSettings?.receiptFooter || "Thank you for your purchase!"}</Text>
                  <View style={styles.paperQR}>
                    <QRCode value={String(selected.receiptNumber)} size={140} />
                    <Text style={styles.paperQRCaption}>{selected.receiptNumber}</Text>
                  </View>
                </View>
              </ScrollView>

              <View style={styles.previewActions}>
                <TouchableOpacity
                  style={styles.previewCancelBtn}
                  onPress={() => {
                    setPrintPreviewVisible(false);
                    setSelected(null);
                  }}
                >
                  <Text style={styles.previewCancelText}>Close</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.previewPrintBtn} onPress={handlePrintReceipt}>
                  <Ionicons name="print-outline" size={18} color="#ffffff" />
                  <Text style={styles.previewPrintText}>Print Receipt</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
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

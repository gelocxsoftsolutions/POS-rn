import React from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  Modal,
  StyleSheet,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Button } from "@/components/ui/button";

export type ReceiptPreviewItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  sku?: string;
  weight?: number | null;
  unitName?: string | null;
  description?: string | null;
};

export type ReceiptPreviewData = {
  receiptNumber: string;
  date: string;
  customerName?: string;
  cashierName: string;
  items: ReceiptPreviewItem[];
  subtotal: number;
  tax: number;
  total: number;
  paidAmount: number;
  change: number;
  paymentMethod: string;
};

export type ReceiptPreviewSettings = {
  storeName?: string;
  address?: string;
  supportPhone?: string;
  receiptFooter?: string;
  taxLabel?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  receipt: ReceiptPreviewData | null;
  settings: ReceiptPreviewSettings | null;
  onPrint?: () => void;
  printing?: boolean;
};

const paymentMethodLabel = (method: string) =>
  method === "DIGITAL" ? "GCash/QRPh" : method;

export function ReceiptPreviewModal({
  visible,
  onClose,
  receipt,
  settings,
  onPrint,
  printing = false,
}: Props) {
  if (!receipt) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.receiptOverlay}>
        <View style={styles.receiptContainer}>
          <ScrollView style={styles.receiptScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.receiptContent}>
              <Image
                source={require("../../../assets/thermal-printer-logo.jpg")}
                style={styles.receiptLogo}
                resizeMode="contain"
              />
              <Text style={styles.receiptStore}>{settings?.storeName || "Store"}</Text>
              {settings?.address ? <Text style={styles.receiptAddress}>{settings.address}</Text> : null}
              {settings?.supportPhone ? <Text style={styles.receiptPhone}>{settings.supportPhone}</Text> : null}
              <Text style={styles.receiptNumber}>{receipt.receiptNumber}</Text>
              <Text style={styles.receiptDate}>{new Date(receipt.date).toLocaleString()}</Text>
              {receipt.customerName ? (
                <Text style={styles.receiptCustomer}>Customer: {receipt.customerName}</Text>
              ) : null}
              <Text style={styles.receiptCashier}>Cashier: {receipt.cashierName}</Text>
              <View style={styles.receiptDivider} />
              {receipt.items.map((item, idx) => (
                <View key={idx} style={styles.receiptItem}>
                  <View style={styles.receiptItemLeft}>
                    <Text style={styles.receiptItemName}>{item.name}</Text>
                    {(item.sku || item.weight != null || item.unitName || item.description) && (
                      <Text style={styles.receiptItemVariation} numberOfLines={1}>
                        {item.sku ? item.sku : ""}
                        {item.weight != null ? ` • ${item.weight}${item.unitName ?? ""}` : item.unitName ? ` • ${item.unitName}` : ""}
                        {item.description ? ` • ${item.description}` : ""}
                      </Text>
                    )}
                    <Text style={styles.receiptItemQty}>×{item.quantity} @ ₱{item.unitPrice.toFixed(2)}</Text>
                  </View>
                  <Text style={styles.receiptItemPrice}>₱{(item.unitPrice * item.quantity).toFixed(2)}</Text>
                </View>
              ))}
              <View style={styles.receiptDivider} />
              <View style={styles.receiptItem}>
                <Text style={styles.receiptItemName}>Subtotal</Text>
                <Text style={styles.receiptItemPrice}>₱{receipt.subtotal.toFixed(2)}</Text>
              </View>
              <View style={styles.receiptItem}>
                <Text style={styles.receiptItemName}>{settings?.taxLabel || "Tax"}</Text>
                <Text style={styles.receiptItemPrice}>₱{receipt.tax.toFixed(2)}</Text>
              </View>
              <View style={[styles.receiptItem, { marginTop: 8 }]}>
                <Text style={styles.receiptTotal}>Total</Text>
                <Text style={styles.receiptTotal}>₱{receipt.total.toFixed(2)}</Text>
              </View>
              <View style={styles.receiptItem}>
                <Text style={styles.receiptItemName}>Paid ({paymentMethodLabel(receipt.paymentMethod)})</Text>
                <Text style={styles.receiptItemPrice}>₱{receipt.paidAmount.toFixed(2)}</Text>
              </View>
              <View style={styles.receiptItem}>
                <Text style={styles.receiptItemName}>Change</Text>
                <Text style={styles.receiptItemPrice}>₱{receipt.change.toFixed(2)}</Text>
              </View>
              <View style={styles.receiptDivider} />
              <Text style={styles.receiptFooter}>{settings?.receiptFooter || "Thank you for your purchase!"}</Text>
              <View style={styles.receiptQR}>
                <QRCode value={String(receipt.receiptNumber ?? receipt.date ?? "receipt")} size={140} />
                <Text style={styles.receiptQRCaption}>{receipt.receiptNumber}</Text>
              </View>
              <View style={styles.receiptActions}>
                {onPrint && (
                  <Button
                    title={printing ? "Finding Printer..." : "Print Receipt"}
                    onPress={onPrint}
                    icon="print-outline"
                    loading={printing}
                    style={styles.printReceiptButton}
                  />
                )}
                <Button title="Done" onPress={onClose} variant="secondary" style={styles.receiptDoneButton} />
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const RECEIPT_PREVIEW_WIDTH = Math.round((58 / 25.4) * 160);

const styles = StyleSheet.create({
  receiptOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  receiptContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    width: RECEIPT_PREVIEW_WIDTH,
    maxWidth: "100%",
    maxHeight: "88%",
    overflow: "hidden",
  },
  receiptScroll: {
    maxHeight: "100%",
  },
  receiptContent: {
    padding: 20,
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  receiptLogo: {
    width: 104,
    height: 104,
    marginBottom: 8,
  },
  receiptStore: {
    fontSize: 18,
    fontWeight: "700",
    color: "#17386b",
  },
  receiptAddress: {
    fontSize: 11,
    color: "#6b7b8d",
    marginTop: 2,
    textAlign: "center",
  },
  receiptPhone: {
    fontSize: 11,
    color: "#6b7b8d",
    marginTop: 2,
  },
  receiptNumber: {
    fontSize: 12,
    color: "#6b7b8d",
    marginTop: 8,
  },
  receiptDate: {
    fontSize: 11,
    color: "#6b7b8d",
    marginTop: 4,
  },
  receiptCustomer: {
    fontSize: 12,
    color: "#4a5568",
    marginTop: 4,
  },
  receiptCashier: {
    fontSize: 12,
    color: "#4a5568",
    marginTop: 2,
  },
  receiptDivider: {
    width: "100%",
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 12,
  },
  receiptItem: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  receiptItemLeft: {
    flex: 1,
  },
  receiptItemName: {
    fontSize: 13,
    color: "#4a5568",
  },
  receiptItemQty: {
    fontSize: 11,
    color: "#6b7b8d",
    marginTop: 2,
  },
  receiptItemVariation: {
    fontSize: 10,
    color: "#6b7b8d",
    marginTop: 1,
  },
  receiptItemPrice: {
    fontSize: 13,
    color: "#1a202c",
    fontWeight: "500",
  },
  receiptTotal: {
    fontSize: 15,
    fontWeight: "700",
    color: "#17386b",
  },
  receiptFooter: {
    fontSize: 12,
    color: "#6b7b8d",
    fontStyle: "italic",
    textAlign: "center",
  },
  receiptQR: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  receiptQRCaption: {
    fontSize: 9,
    color: "#475569",
    marginTop: 8,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  receiptActions: {
    width: "100%",
    marginTop: 18,
  },
  printReceiptButton: {
    width: "100%",
  },
  receiptDoneButton: {
    width: "100%",
    marginTop: 8,
  },
});

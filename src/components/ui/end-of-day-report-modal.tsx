import React from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/button";
import type { SalesReport } from "@/lib/types/reports";

type ReportSettings = {
  storeName?: string;
  address?: string | null;
  supportPhone?: string | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onPrint: () => void;
  printing: boolean;
  report: SalesReport;
  settings: ReportSettings | null;
  startDate: Date;
  endDate: Date;
};

const money = (value: number) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const paymentLabel = (method: string) =>
  method === "DIGITAL" ? "GCash/QRPh" : method;

export function EndOfDayReportModal({
  visible,
  onClose,
  onPrint,
  printing,
  report,
  settings,
  startDate,
  endDate,
}: Props) {
  const subtotal = report.sales.reduce((sum, sale) => sum + Number(sale.subtotal || 0), 0);
  const sameDate = startDate.toDateString() === endDate.toDateString();
  const period = sameDate
    ? startDate.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
    : `${startDate.toLocaleDateString("en-PH")} - ${endDate.toLocaleDateString("en-PH")}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.paper}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.content}>
              <Image
                source={require("../../../assets/thermal-printer-logo.jpg")}
                style={styles.logo}
                resizeMode="contain"
              />
              <Text style={styles.store}>{settings?.storeName || "NCT Seafoods"}</Text>
              {settings?.address ? <Text style={styles.meta}>{settings.address}</Text> : null}
              {settings?.supportPhone ? <Text style={styles.meta}>{settings.supportPhone}</Text> : null}
              <Text style={styles.heading}>END OF DAY REPORT</Text>
              <Text style={styles.meta}>{period}</Text>
              <Text style={styles.meta}>Generated: {new Date().toLocaleString("en-PH")}</Text>

              <View style={styles.rule} />
              <SummaryRow label="Transactions" value={String(report.summary.transactionCount)} />
              <SummaryRow label="Items sold" value={String(report.summary.itemsSold)} />
              <SummaryRow label="Subtotal" value={money(subtotal)} />
              {report.summary.discounts > 0 ? (
                <SummaryRow label="Discounts" value={`-${money(report.summary.discounts)}`} />
              ) : null}
              <SummaryRow label="Tax" value={money(report.summary.tax)} />
              <View style={styles.totalRow}>
                <Text style={styles.totalText}>TOTAL SALES</Text>
                <Text style={styles.totalText}>{money(report.summary.revenue)}</Text>
              </View>
              <SummaryRow label="Average basket" value={money(report.summary.averageBasket)} />

              <SectionTitle>PAYMENT SUMMARY</SectionTitle>
              {report.payments.map((payment) => (
                <View key={payment.method} style={styles.itemRow}>
                  <View style={styles.itemCopy}>
                    <Text style={styles.itemName}>{paymentLabel(payment.method)}</Text>
                    <Text style={styles.itemDetail}>{payment.transactions} transactions</Text>
                  </View>
                  <Text style={styles.itemValue}>{money(payment.amount)}</Text>
                </View>
              ))}

              <SectionTitle>ITEMS SOLD</SectionTitle>
              {report.itemSales.map((item, index) => (
                <View key={`${item.productId}-${item.sku}-${index}`} style={styles.itemRow}>
                  <View style={styles.itemCopy}>
                    <Text style={styles.itemName}>{item.productName}</Text>
                    {item.sku ? <Text style={styles.itemDetail}>SKU: {item.sku}</Text> : null}
                    <Text style={styles.itemDetail}>Qty: {item.quantity}</Text>
                  </View>
                  <Text style={styles.itemValue}>{money(item.revenue)}</Text>
                </View>
              ))}

              <SectionTitle>CASHIER SUMMARY</SectionTitle>
              {report.cashiers.map((cashier, index) => (
                <View key={`${cashier.cashierId}-${index}`} style={styles.itemRow}>
                  <View style={styles.itemCopy}>
                    <Text style={styles.itemName}>{cashier.cashierName}</Text>
                    <Text style={styles.itemDetail}>{cashier.transactions} transactions</Text>
                  </View>
                  <Text style={styles.itemValue}>{money(cashier.revenue)}</Text>
                </View>
              ))}

              <View style={styles.rule} />
              <Text style={styles.footer}>Local completed sales from this POS device</Text>
              <View style={styles.actions}>
                <Button
                  title={printing ? "Finding Printer..." : "Print EOD Report"}
                  onPress={onPrint}
                  icon="print-outline"
                  loading={printing}
                  style={styles.actionButton}
                />
                <Button title="Done" onPress={onClose} variant="secondary" style={styles.doneButton} />
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionTitleText}>{children}</Text>
    </View>
  );
}

const PREVIEW_WIDTH = Math.round((58 / 25.4) * 160);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.62)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  paper: {
    width: PREVIEW_WIDTH,
    maxWidth: "100%",
    maxHeight: "90%",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    overflow: "hidden",
  },
  content: { backgroundColor: "#ffffff", padding: 20, alignItems: "center" },
  logo: { width: 94, height: 94, marginBottom: 6 },
  store: { color: "#000000", fontSize: 17, fontWeight: "800", textAlign: "center" },
  heading: { color: "#000000", fontSize: 14, fontWeight: "900", marginTop: 12, textAlign: "center" },
  meta: { color: "#333333", fontSize: 10, lineHeight: 14, textAlign: "center" },
  rule: { width: "100%", borderTopWidth: 1, borderStyle: "dashed", borderColor: "#000000", marginVertical: 12 },
  summaryRow: { width: "100%", flexDirection: "row", justifyContent: "space-between", gap: 10, marginBottom: 5 },
  summaryLabel: { flex: 1, color: "#222222", fontSize: 11 },
  summaryValue: { color: "#000000", fontSize: 11, fontWeight: "700" },
  totalRow: { width: "100%", flexDirection: "row", justifyContent: "space-between", gap: 8, marginVertical: 5 },
  totalText: { color: "#000000", fontSize: 14, fontWeight: "900" },
  sectionTitle: { width: "100%", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#000000", paddingVertical: 5, marginTop: 10, marginBottom: 8 },
  sectionTitleText: { color: "#000000", fontSize: 11, fontWeight: "900", textAlign: "center" },
  itemRow: { width: "100%", flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 7 },
  itemCopy: { flex: 1, minWidth: 0 },
  itemName: { color: "#000000", fontSize: 10.5, fontWeight: "700" },
  itemDetail: { color: "#444444", fontSize: 9, marginTop: 1 },
  itemValue: { color: "#000000", fontSize: 10.5, fontWeight: "700" },
  footer: { color: "#444444", fontSize: 9, fontStyle: "italic", textAlign: "center" },
  actions: { width: "100%", marginTop: 18 },
  actionButton: { width: "100%" },
  doneButton: { width: "100%", marginTop: 8 },
});

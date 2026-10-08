import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import * as Print from "expo-print";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import dayjs from "dayjs";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";
import { useIsDarkTheme } from "@/lib/stores/ui-store";
import { ReportService } from "@/lib/services/report.service";
import { SaleSyncService } from "@/lib/services/sale-sync.service";
import { SettingsService } from "@/lib/services/settings.service";
import type { ReportSaleRow, SalesReport, SalesTrendPoint } from "@/lib/types/reports";
import type { StoreSettingsRow } from "@/lib/repositories/settings.repository";
import { EndOfDayReportModal } from "@/components/ui/end-of-day-report-modal";
import { getPrintableAssetDataUri } from "@/lib/printing/print-assets";
import { useAccessSettingsStore } from "@/lib/stores/access-settings-store";

type Preset = "today" | "7days" | "30days" | "custom";
type DateTarget = "start" | "end" | null;

const emptyReport: SalesReport = {
  summary: { revenue: 0, transactionCount: 0, averageBasket: 0, itemsSold: 0, tax: 0, discounts: 0 },
  trend: [], payments: [], topProducts: [], itemSales: [], cashiers: [], sales: [],
};

const currency = (value: number) => `\u20B1${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const RECEIPT_WIDTH_MM = 58;
const RECEIPT_WIDTH_POINTS = Math.round((RECEIPT_WIDTH_MM / 25.4) * 72);
const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
const paymentLabel = (method: string) => method === "DIGITAL" ? "GCash/QRPh" : method;

function TrendChart({ points, dark }: { points: SalesTrendPoint[]; dark: boolean }) {
  const width = 760;
  const height = 210;
  const padX = 48;
  const padY = 28;
  const chartWidth = width - padX * 2;
  const chartHeight = height - padY * 2;
  const max = Math.max(...points.map((point) => Number(point.revenue)), 1);
  const coordinates = points.map((point, index) => ({
    x: padX + (points.length === 1 ? chartWidth / 2 : (index / (points.length - 1)) * chartWidth),
    y: padY + chartHeight - (Number(point.revenue) / max) * chartHeight,
    point,
  }));
  const stroke = dark ? "#60a5fa" : "#1d4ed8";
  const muted = dark ? "#64748b" : "#94a3b8";

  return (
    <View style={styles.chartWrap}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {[0, 0.5, 1].map((ratio) => {
          const y = padY + chartHeight * ratio;
          return <Line key={ratio} x1={padX} y1={y} x2={width - padX} y2={y} stroke={muted} strokeOpacity={0.24} />;
        })}
        <Polyline points={coordinates.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke={stroke} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        {coordinates.map(({ x, y, point }, index) => (
          <React.Fragment key={`${point.date}-${index}`}>
            <Circle cx={x} cy={y} r={5} fill={stroke} />
            <SvgText x={x} y={height - 5} fontSize={11} textAnchor="middle" fill={muted}>{dayjs(point.date).format("MMM D")}</SvgText>
          </React.Fragment>
        ))}
      </Svg>
    </View>
  );
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function ReportsScreen() {
  const dark = useIsDarkTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [preset, setPreset] = useState<Preset>("today");
  const [startDate, setStartDate] = useState(dayjs().startOf("day").toDate());
  const [endDate, setEndDate] = useState(dayjs().endOf("day").toDate());
  const [dateTarget, setDateTarget] = useState<DateTarget>(null);
  const [report, setReport] = useState<SalesReport>(emptyReport);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [eodVisible, setEodVisible] = useState(false);
  const [printingEod, setPrintingEod] = useState(false);
  const [settings, setSettings] = useState<StoreSettingsRow | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const salesGroupCashierIds = useAccessSettingsStore((state) => state.salesGroupCashierIds);

  const colors = useMemo(() => ({
    background: dark ? "#0b0f16" : "#f4f6f8",
    panel: dark ? "#141922" : "#ffffff",
    panelAlt: dark ? "#101722" : "#f8fafc",
    border: dark ? "#293241" : "#dfe5ec",
    text: dark ? "#f4f7fb" : "#172033",
    muted: dark ? "#93a0b2" : "#667085",
  }), [dark]);

  const applyPreset = useCallback((next: Preset) => {
    const now = dayjs();
    setPreset(next);
    if (next === "today") {
      setStartDate(now.startOf("day").toDate());
      setEndDate(now.endOf("day").toDate());
    } else if (next === "7days") {
      setStartDate(now.subtract(6, "day").startOf("day").toDate());
      setEndDate(now.endOf("day").toDate());
    } else if (next === "30days") {
      setStartDate(now.subtract(29, "day").startOf("day").toDate());
      setEndDate(now.endOf("day").toDate());
    }
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    const result = await ReportService.getSalesReport({
      startDate: dayjs(startDate).startOf("day").toISOString(),
      endDate: dayjs(endDate).endOf("day").toISOString(),
    });
    setReport(result);
    setLoading(false);
  }, [startDate, endDate, salesGroupCashierIds]);

  useEffect(() => { loadReport(); }, [loadReport]);

  useEffect(() => {
    SettingsService.get().then(setSettings).catch(() => setSettings(null));
  }, []);

  const chooseDate = (event: DateTimePickerEvent, selected?: Date) => {
    const target = dateTarget;
    setDateTarget(null);
    if (event.type !== "set" || !selected || !target) return;
    setPreset("custom");
    if (target === "start") {
      setStartDate(dayjs(selected).startOf("day").toDate());
      if (selected > endDate) setEndDate(dayjs(selected).endOf("day").toDate());
    } else {
      setEndDate(dayjs(selected).endOf("day").toDate());
      if (selected < startDate) setStartDate(dayjs(selected).startOf("day").toDate());
    }
  };

  const syncStatusInfo = (sale: ReportSaleRow) => {
    const status = sale.syncStatus ?? (sale.synced ? "SYNCED" : "UNSYNCED");
    switch (status) {
      case "SYNCED": return { label: "Synced", color: "#16a34a" };
      case "FAILED": return { label: "Not synced", color: "#dc2626" };
      case "PENDING": return { label: "Pending", color: "#d97706" };
      default: return { label: "Not synced", color: "#64748b" };
    }
  };

  const retrySale = useCallback(
    async (saleId: string) => {
      setRetryingId(saleId);
      try {
        await SaleSyncService.retrySale(saleId);
        await loadReport();
      } finally {
        setRetryingId(null);
      }
    },
    [loadReport]
  );

  const retryFailedSales = useCallback(async () => {
    const failed = report.sales.filter((sale) => sale.syncStatus === "FAILED" || sale.syncStatus === "UNSYNCED");
    if (!failed.length) return;
    setRetryingId("all");
    try {
      for (const sale of failed) {
        await SaleSyncService.retrySale(sale.id);
      }
      await loadReport();
    } finally {
      setRetryingId(null);
    }
  }, [report.sales, loadReport]);

  const exportCsv = async () => {
    if (!report.sales.length || exporting) return;
    setExporting(true);
    try {
      const headers = ["Receipt Number", "Timestamp", "Cashier", "Customer", "Payment Method", "Item Count", "Subtotal", "Discount", "Tax", "Total", "Sync Status"];
      const rows = report.sales.map((sale) => [
        sale.receiptNumber, sale.createdAt, sale.cashierName, sale.customerName ?? "", sale.paymentMethod,
        sale.itemCount, sale.subtotal, sale.discount, sale.tax, sale.total,
        sale.syncStatus ?? (sale.synced ? "SYNCED" : "UNSYNCED"),
        sale.syncError ?? "",
      ]);
      headers.push("Sync Error");
      const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
      const file = new File(Paths.cache, `sales-report-${dayjs(startDate).format("YYYYMMDD")}-${dayjs(endDate).format("YYYYMMDD")}.csv`);
      file.create({ overwrite: true, intermediates: true });
      file.write(csv);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: "Export sales report", UTI: "public.comma-separated-values-text" });
      } else {
        Alert.alert("Report Saved", `CSV export saved to ${file.uri}`);
      }
    } catch {
      Alert.alert("Export Failed", "The sales report could not be exported.");
    } finally {
      setExporting(false);
    }
  };

  const printEndOfDay = async () => {
    if (!report.sales.length || printingEod) return;
    setPrintingEod(true);
    try {
      const logoUri = await getPrintableAssetDataUri(
        require("../../../assets/thermal-printer-logo.jpg"),
        "image/jpeg"
      );

      const subtotal = report.sales.reduce((sum, sale) => sum + Number(sale.subtotal || 0), 0);
      const sameDate = dayjs(startDate).isSame(endDate, "day");
      const period = sameDate
        ? dayjs(startDate).format("MMM D, YYYY")
        : `${dayjs(startDate).format("MMM D, YYYY")} - ${dayjs(endDate).format("MMM D, YYYY")}`;
      const paymentRows = report.payments.map((payment) => `
        <div class="item"><div><strong>${escapeHtml(paymentLabel(payment.method))}</strong><small>${payment.transactions} transactions</small></div><strong>${currency(payment.amount)}</strong></div>
      `).join("");
      const itemRows = report.itemSales.map((item) => `
        <div class="item"><div class="copy"><strong>${escapeHtml(item.productName)}</strong>${item.sku ? `<small>SKU: ${escapeHtml(item.sku)}</small>` : ""}<small>Qty: ${item.quantity}</small></div><strong>${currency(item.revenue)}</strong></div>
      `).join("");
      const cashierRows = report.cashiers.map((cashier) => `
        <div class="item"><div class="copy"><strong>${escapeHtml(cashier.cashierName)}</strong><small>${cashier.transactions} transactions</small></div><strong>${currency(cashier.revenue)}</strong></div>
      `).join("");
      const rowCount = report.itemSales.length + report.payments.length + report.cashiers.length;
      const reportHeightMm = Math.max(180, 160 + rowCount * 11);
      const reportHeightPoints = Math.round((reportHeightMm / 25.4) * 72);
      const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" /><style>
        @page { size: ${RECEIPT_WIDTH_MM}mm ${reportHeightMm}mm; margin: 0; }
        * { box-sizing: border-box; } html, body { width: ${RECEIPT_WIDTH_MM}mm; margin: 0; padding: 0; background: #fff; color: #000; }
        body { padding: 4mm 3mm; font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; }
        .center { text-align: center; } .logo { width: 23mm; height: 23mm; object-fit: contain; display: block; margin: 0 auto 1mm; }
        h1 { font-size: 12pt; margin: 0 0 1mm; } h2 { font-size: 10pt; margin: 3mm 0 1mm; }
        .meta { font-size: 7.2pt; line-height: 1.35; margin: 0; } .rule { border-top: .25mm dashed #000; margin: 2.5mm 0; }
        .row, .item { display: flex; justify-content: space-between; align-items: flex-start; gap: 2mm; margin-bottom: 1.4mm; }
        .copy { min-width: 0; flex: 1; } .item strong, .item small { display: block; overflow-wrap: anywhere; }
        .item small { font-size: 7pt; margin-top: .3mm; } .total { font-size: 11pt; font-weight: 800; margin: 2mm 0; }
        .section { border-top: .25mm solid #000; border-bottom: .25mm solid #000; padding: 1mm 0; margin: 3mm 0 2mm; text-align: center; font-size: 8pt; font-weight: 800; }
        .footer { margin-top: 3mm; text-align: center; font-size: 7pt; font-style: italic; }
      </style></head><body>
        ${logoUri ? `<img class="logo" src="${logoUri}" />` : ""}
        <div class="center"><h1>${escapeHtml(settings?.storeName || "NCT Seafoods")}</h1>
        ${settings?.address ? `<p class="meta">${escapeHtml(settings.address)}</p>` : ""}
        ${settings?.supportPhone ? `<p class="meta">${escapeHtml(settings.supportPhone)}</p>` : ""}
        <h2>END OF DAY REPORT</h2><p class="meta">${escapeHtml(period)}</p><p class="meta">Generated: ${escapeHtml(new Date().toLocaleString("en-PH"))}</p></div>
        <div class="rule"></div>
        <div class="row"><span>Transactions</span><strong>${report.summary.transactionCount}</strong></div>
        <div class="row"><span>Items sold</span><strong>${report.summary.itemsSold}</strong></div>
        <div class="row"><span>Subtotal</span><strong>${currency(subtotal)}</strong></div>
        ${report.summary.discounts > 0 ? `<div class="row"><span>Discounts</span><strong>-${currency(report.summary.discounts)}</strong></div>` : ""}
        <div class="row"><span>Tax</span><strong>${currency(report.summary.tax)}</strong></div>
        <div class="row total"><span>TOTAL SALES</span><span>${currency(report.summary.revenue)}</span></div>
        <div class="row"><span>Average basket</span><strong>${currency(report.summary.averageBasket)}</strong></div>
        <div class="section">PAYMENT SUMMARY</div>${paymentRows}
        <div class="section">ITEMS SOLD</div>${itemRows}
        <div class="section">CASHIER SUMMARY</div>${cashierRows}
        <div class="rule"></div><p class="footer">Local completed sales from this POS device</p>
      </body></html>`;

      let printerUrl: string | undefined;
      if (Platform.OS === "ios") {
        const printer = await Print.selectPrinterAsync();
        printerUrl = printer.url;
      }
      await Print.printAsync({
        html,
        printerUrl,
        width: RECEIPT_WIDTH_POINTS,
        height: reportHeightPoints,
        margins: Platform.OS === "ios" ? { top: 0, right: 0, bottom: 0, left: 0 } : undefined,
      });
    } catch (error: any) {
      const cancelled = error?.message?.toLowerCase().includes("cancel");
      Alert.alert("Print EOD Report", cancelled ? "Printer selection was cancelled." : "No thermal printer was selected or the print service is unavailable.");
    } finally {
      setPrintingEod(false);
    }
  };

  const summaryCards = [
    { label: "Revenue", value: currency(report.summary.revenue), icon: "cash-outline", color: "#2563eb" },
    { label: "Transactions", value: report.summary.transactionCount.toLocaleString(), icon: "receipt-outline", color: "#16a34a" },
    { label: "Average Basket", value: currency(report.summary.averageBasket), icon: "basket-outline", color: "#7c3aed" },
    { label: "Items Sold", value: report.summary.itemsSold.toLocaleString(), icon: "cube-outline", color: "#0891b2" },
    { label: "Tax", value: currency(report.summary.tax), icon: "calculator-outline", color: "#d97706" },
    { label: "Discounts", value: currency(report.summary.discounts), icon: "pricetag-outline", color: "#dc2626" },
  ];
  const paymentMax = Math.max(...report.payments.map((payment) => Number(payment.amount)), 1);

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.page}>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>Sales Reports</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Performance from completed sales stored on this device</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[
              styles.printButton,
              { backgroundColor: colors.panel, borderColor: dark ? "#8abaff" : "#17386b" },
              !report.sales.length && styles.disabled,
            ]}
            onPress={() => setEodVisible(true)}
            disabled={!report.sales.length || loading}
          >
            <Ionicons name="print-outline" size={18} color={dark ? "#8abaff" : "#17386b"} />
            <Text style={[styles.printButtonText, { color: dark ? "#8abaff" : "#17386b" }]}>End of Day</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.exportButton, !report.sales.length && styles.disabled]} onPress={exportCsv} disabled={!report.sales.length || exporting}>
            {exporting ? <ActivityIndicator color="#ffffff" /> : <Ionicons name="download-outline" size={18} color="#ffffff" />}
            <Text style={styles.exportText}>Export CSV</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.rangeRow}>
        <View style={styles.presets}>
          {([['today', 'Today'], ['7days', '7 Days'], ['30days', '30 Days']] as const).map(([key, label]) => (
            <TouchableOpacity key={key} style={[styles.presetButton, { borderColor: colors.border, backgroundColor: colors.panel }, preset === key && styles.presetActive]} onPress={() => applyPreset(key)}>
              <Text style={[styles.presetText, { color: colors.muted }, preset === key && styles.presetTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.customDates}>
          <TouchableOpacity style={[styles.dateButton, { borderColor: colors.border, backgroundColor: colors.panel }]} onPress={() => setDateTarget("start")}>
            <Ionicons name="calendar-outline" size={16} color={colors.muted} />
            <Text style={[styles.dateText, { color: colors.text }]}>{dayjs(startDate).format("MMM D, YYYY")}</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.muted }}>to</Text>
          <TouchableOpacity style={[styles.dateButton, { borderColor: colors.border, backgroundColor: colors.panel }]} onPress={() => setDateTarget("end")}>
            <Ionicons name="calendar-outline" size={16} color={colors.muted} />
            <Text style={[styles.dateText, { color: colors.text }]}>{dayjs(endDate).format("MMM D, YYYY")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {dateTarget && <DateTimePicker value={dateTarget === "start" ? startDate : endDate} mode="date" onChange={chooseDate} />}

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : report.summary.transactionCount === 0 ? (
        <View style={[styles.empty, { backgroundColor: colors.panel, borderColor: colors.border }]}>
          <Ionicons name="bar-chart-outline" size={46} color={colors.muted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No completed sales in this period</Text>
          <Text style={[styles.emptyText, { color: colors.muted }]}>Choose another date range to view sales performance.</Text>
        </View>
      ) : (
        <>
          <View style={styles.metricGrid}>
            {summaryCards.map((card) => (
              <View key={card.label} style={[styles.metricCard, { width: wide ? "31.8%" : "48.5%", backgroundColor: colors.panel, borderColor: colors.border }]}>
                <View style={[styles.metricIcon, { backgroundColor: `${card.color}18` }]}><Ionicons name={card.icon as any} size={20} color={card.color} /></View>
                <Text style={[styles.metricValue, { color: colors.text }]}>{card.value}</Text>
                <Text style={[styles.metricLabel, { color: colors.muted }]}>{card.label}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.panel, { backgroundColor: colors.panel, borderColor: colors.border }]}>
            <Text style={[styles.panelTitle, { color: colors.text }]}>Sales Trend</Text>
            <Text style={[styles.panelCaption, { color: colors.muted }]}>Revenue by day</Text>
            <TrendChart points={report.trend} dark={dark} />
          </View>

          <View style={[styles.twoColumn, !wide && styles.stacked]}>
            <View style={[styles.panel, styles.columnPanel, { backgroundColor: colors.panel, borderColor: colors.border }]}>
              <Text style={[styles.panelTitle, { color: colors.text }]}>Payment Methods</Text>
              {report.payments.map((payment) => (
                <View key={payment.method} style={styles.paymentRow}>
                  <View style={styles.rowBetween}><Text style={[styles.rowName, { color: colors.text }]}>{payment.method}</Text><Text style={[styles.rowValue, { color: colors.text }]}>{currency(payment.amount)}</Text></View>
                  <View style={[styles.progressTrack, { backgroundColor: colors.panelAlt }]}><View style={[styles.progressFill, { width: `${Math.max(3, (payment.amount / paymentMax) * 100)}%` }]} /></View>
                  <Text style={[styles.smallText, { color: colors.muted }]}>{payment.transactions} transactions</Text>
                </View>
              ))}
            </View>

            <View style={[styles.panel, styles.columnPanel, { backgroundColor: colors.panel, borderColor: colors.border }]}>
              <Text style={[styles.panelTitle, { color: colors.text }]}>Top Products</Text>
              {report.topProducts.map((product, index) => (
                <View key={`${product.productId}-${product.sku}-${index}`} style={[styles.tableRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.rank, { color: colors.muted }]}>{index + 1}</Text>
                  <View style={styles.flex}><Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{product.productName}</Text><Text style={[styles.smallText, { color: colors.muted }]}>{product.quantity} sold</Text></View>
                  <Text style={[styles.rowValue, { color: colors.text }]}>{currency(product.revenue)}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.panel, { backgroundColor: colors.panel, borderColor: colors.border }]}>
            <Text style={[styles.panelTitle, { color: colors.text }]}>Cashier Performance</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.cashierTable}>
                <View style={[styles.cashierRow, { backgroundColor: colors.panelAlt }]}>
                  {['Cashier', 'Transactions', 'Revenue', 'Average Basket'].map((label) => <Text key={label} style={[styles.cashierCell, styles.cashierHeader, { color: colors.muted }]}>{label}</Text>)}
                </View>
                {report.cashiers.map((cashier) => (
                  <View key={`${cashier.cashierId}-${cashier.cashierName}`} style={[styles.cashierRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.cashierCell, { color: colors.text }]}>{cashier.cashierName}</Text>
                    <Text style={[styles.cashierCell, { color: colors.text }]}>{cashier.transactions}</Text>
                    <Text style={[styles.cashierCell, { color: colors.text }]}>{currency(cashier.revenue)}</Text>
                    <Text style={[styles.cashierCell, { color: colors.text }]}>{currency(cashier.averageBasket)}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>

          <View style={[styles.panel, { backgroundColor: colors.panel, borderColor: colors.border }]}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <Text style={[styles.panelTitle, { color: colors.text }]}>Sales &amp; Sync Status</Text>
                <Text style={[styles.panelCaption, { color: colors.muted }]}>Every recorded sale and whether it reached the OMS</Text>
              </View>
              {report.sales.some((sale) => sale.syncStatus === "FAILED" || sale.syncStatus === "UNSYNCED") && (
                <TouchableOpacity
                  style={[styles.retryAllButton, { borderColor: colors.border }]}
                  onPress={retryFailedSales}
                  disabled={retryingId !== null}
                >
                  {retryingId === "all" ? (
                    <ActivityIndicator size="small" color="#17386b" />
                  ) : (
                    <Ionicons name="refresh" size={15} color="#17386b" />
                  )}
                  <Text style={styles.retryAllText}>Retry failed</Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.salesTable}>
                <View style={[styles.salesRow, { backgroundColor: colors.panelAlt }]}>
                  {["Receipt", "Date", "Cashier", "Total", "Status", "Reason", ""].map((label, index) => (
                    <Text key={`${label}-${index}`} style={[styles.salesCell, styles.salesHeader, { color: colors.muted }]}>{label}</Text>
                  ))}
                </View>
                {report.sales.map((sale) => {
                  const info = syncStatusInfo(sale);
                  const canRetry = sale.syncStatus === "FAILED" || sale.syncStatus === "UNSYNCED";
                  return (
                    <View key={sale.id} style={[styles.salesRow, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.salesCell, { color: colors.text }]} numberOfLines={1}>{sale.receiptNumber}</Text>
                      <Text style={[styles.salesCell, { color: colors.text }]} numberOfLines={1}>{dayjs(sale.createdAt).format("MMM D, HH:mm")}</Text>
                      <Text style={[styles.salesCell, { color: colors.text }]} numberOfLines={1}>{sale.cashierName}</Text>
                      <Text style={[styles.salesCell, { color: colors.text }]}>{currency(sale.total)}</Text>
                      <Text style={[styles.salesCell, { color: info.color, fontWeight: "700" }]} numberOfLines={1}>{info.label}</Text>
                      <Text style={[styles.salesReasonCell, { color: colors.muted }]} numberOfLines={2}>{sale.syncError ?? ""}</Text>
                      <View style={styles.salesCell}>
                        {canRetry && (
                          <TouchableOpacity
                            style={styles.retryRowButton}
                            onPress={() => retrySale(sale.id)}
                            disabled={retryingId !== null}
                          >
                            {retryingId === sale.id ? (
                              <ActivityIndicator size="small" color="#17386b" />
                            ) : (
                              <Text style={styles.retryRowText}>Retry</Text>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </>
      )}
      <EndOfDayReportModal
        visible={eodVisible}
        onClose={() => setEodVisible(false)}
        onPrint={printEndOfDay}
        printing={printingEod}
        report={report}
        settings={settings}
        startDate={startDate}
        endDate={endDate}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 40, gap: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 },
  headerActions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  title: { fontSize: 26, fontWeight: "800" },
  subtitle: { fontSize: 13, marginTop: 3 },
  exportButton: { height: 42, paddingHorizontal: 16, borderRadius: 7, backgroundColor: "#17386b", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  exportText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  printButton: { height: 42, paddingHorizontal: 16, borderRadius: 7, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#17386b", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  printButtonText: { color: "#17386b", fontSize: 13, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  rangeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 },
  presets: { flexDirection: "row", gap: 7 },
  presetButton: { minHeight: 36, paddingHorizontal: 14, borderWidth: 1, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  presetActive: { backgroundColor: "#17386b", borderColor: "#17386b" },
  presetText: { fontSize: 12, fontWeight: "700" },
  presetTextActive: { color: "#ffffff" },
  customDates: { flexDirection: "row", alignItems: "center", gap: 8 },
  dateButton: { minHeight: 36, paddingHorizontal: 11, borderWidth: 1, borderRadius: 7, flexDirection: "row", alignItems: "center", gap: 7 },
  dateText: { fontSize: 12, fontWeight: "600" },
  loading: { height: 320, alignItems: "center", justifyContent: "center" },
  empty: { minHeight: 330, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center", padding: 30 },
  emptyTitle: { fontSize: 18, fontWeight: "800", marginTop: 14 },
  emptyText: { fontSize: 13, marginTop: 5, textAlign: "center" },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metricCard: { minWidth: 200, borderWidth: 1, borderRadius: 8, padding: 16 },
  metricIcon: { width: 36, height: 36, borderRadius: 7, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  metricValue: { fontSize: 22, fontWeight: "800" },
  metricLabel: { fontSize: 12, marginTop: 3 },
  panel: { borderWidth: 1, borderRadius: 8, padding: 16 },
  panelTitle: { fontSize: 16, fontWeight: "800" },
  panelCaption: { fontSize: 11, marginTop: 2 },
  chartWrap: { width: "100%", minHeight: 210, marginTop: 8 },
  twoColumn: { flexDirection: "row", gap: 14, alignItems: "stretch" },
  stacked: { flexDirection: "column" },
  columnPanel: { flex: 1, minWidth: 0 },
  paymentRow: { marginTop: 14 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  rowName: { fontSize: 13, fontWeight: "700", flexShrink: 1 },
  rowValue: { fontSize: 13, fontWeight: "800" },
  progressTrack: { height: 7, borderRadius: 4, overflow: "hidden", marginTop: 7 },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: "#2563eb" },
  smallText: { fontSize: 10, marginTop: 4 },
  tableRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rank: { width: 20, fontSize: 12, fontWeight: "800" },
  flex: { flex: 1 },
  cashierTable: { minWidth: 720, marginTop: 12 },
  cashierRow: { minHeight: 44, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  cashierCell: { width: 180, paddingHorizontal: 10, fontSize: 12 },
  cashierHeader: { fontWeight: "800", textTransform: "uppercase", fontSize: 10 },
  retryAllButton: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 8 },
  retryAllText: { color: "#17386b", fontSize: 12, fontWeight: "700" },
  salesTable: { minWidth: 880, marginTop: 12 },
  salesRow: { minHeight: 46, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  salesCell: { width: 130, paddingHorizontal: 10, fontSize: 12 },
  salesReasonCell: { width: 240, paddingHorizontal: 10, fontSize: 11 },
  salesHeader: { fontWeight: "800", textTransform: "uppercase", fontSize: 10 },
  retryRowButton: { borderWidth: 1, borderColor: "#17386b", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 5, alignItems: "center", justifyContent: "center", minWidth: 60 },
  retryRowText: { color: "#17386b", fontSize: 12, fontWeight: "700" },
});

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import * as Print from "expo-print";
import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import dayjs, { type Dayjs } from "dayjs";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";
import { useIsDarkTheme, usePosTheme } from "@/lib/stores/ui-store";
import { ReportService } from "@/lib/services/report.service";
import { SaleSyncService } from "@/lib/services/sale-sync.service";
import { SettingsService, type ResolvedSettings } from "@/lib/services/settings.service";
import type { ReportSaleRow, SalesReport, SalesTrendPoint } from "@/lib/types/reports";
import { EndOfDayReportModal } from "@/components/ui/end-of-day-report-modal";
import { getPrintableAssetDataUri, getPrintableFileDataUri } from "@/lib/printing/print-assets";
import { useAccessSettingsStore } from "@/lib/stores/access-settings-store";
import { BluetoothPrinter } from "@/lib/printers/bluetooth-printer";
import { formatEscPosEndOfDayReport } from "@/lib/printers/escpos-end-of-day";
import { usePrinterStore } from "@/lib/stores/printer-store";
import { EndOfDayService } from "@/lib/backup/end-of-day.service";
import { useBusinessConfigStore } from "@/lib/stores/business-config-store";

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
const withAlpha = (color: string, alpha: number) => {
  const hex = color.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(hex);
  const long = /^#([0-9a-f]{6})$/i.exec(hex);
  if (short) {
    const [r, g, b] = short[1].split("").map((c) => parseInt(c + c, 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (long) {
    const value = parseInt(long[1], 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  }
  return color;
};

function TrendChart({ points, dark }: { points: SalesTrendPoint[]; dark: boolean }) {
  const theme = usePosTheme();
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
  const stroke = theme.accent;
  const muted = theme.muted;

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

function DateRangeCalendar({
  visible,
  startDate,
  endDate,
  initialTarget,
  onClose,
  onApply,
}: {
  visible: boolean;
  startDate: Date;
  endDate: Date;
  initialTarget: DateTarget;
  onClose: () => void;
  onApply: (start: Date, end: Date) => void;
}) {
  const theme = usePosTheme();
  const [month, setMonth] = useState(dayjs(startDate).startOf("month"));
  const [draftStart, setDraftStart] = useState(dayjs(startDate).startOf("day"));
  const [draftEnd, setDraftEnd] = useState(dayjs(endDate).startOf("day"));
  const [selecting, setSelecting] = useState<"start" | "end">("start");

  useEffect(() => {
    if (!visible) return;
    const target = initialTarget === "end" ? dayjs(endDate) : dayjs(startDate);
    setMonth(target.startOf("month"));
    setDraftStart(dayjs(startDate).startOf("day"));
    setDraftEnd(dayjs(endDate).startOf("day"));
    setSelecting(initialTarget === "end" ? "end" : "start");
  }, [endDate, initialTarget, startDate, visible]);

  const today = dayjs().startOf("day");
  const leading = month.day();
  const daysInMonth = month.daysInMonth();
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: totalCells }, (_, index) => {
    const dayNumber = index - leading + 1;
    return dayNumber > 0 && dayNumber <= daysInMonth ? month.date(dayNumber) : null;
  });
  const rangeSpan = draftEnd.diff(draftStart, "day") + 1;
  const isSameDay = draftStart.valueOf() === draftEnd.valueOf();
  const rangeAlpha = withAlpha(theme.primary, theme.dark ? 0.32 : 0.15);

  const choose = (day: Dayjs) => {
    const selected = day.startOf("day");
    if (selecting === "start") {
      setDraftStart(selected);
      if (selected.valueOf() > draftEnd.valueOf()) setDraftEnd(selected);
      setSelecting("end");
      return;
    }
    if (selected.valueOf() < draftStart.valueOf()) {
      setDraftStart(selected);
      setDraftEnd(selected);
      setSelecting("end");
    } else {
      setDraftEnd(selected);
    }
  };

  const applyQuick = (start: Dayjs, end: Dayjs) => {
    setDraftStart(start);
    setDraftEnd(end);
    setMonth(start.startOf("month"));
    setSelecting("end");
  };

  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <View style={styles.calendarBackdrop}>
      <View style={[styles.calendarModal, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.calendarTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.calendarTitle, { color: theme.text }]}>Select report range</Text>
            <Text style={[styles.calendarSubtitle, { color: theme.muted }]}>Choose a start date, then an end date</Text>
          </View>
          <TouchableOpacity style={[styles.calendarClose, { backgroundColor: theme.surfaceAlt }]} onPress={onClose} accessibilityLabel="Close calendar"><Ionicons name="close" size={20} color={theme.text} /></TouchableOpacity>
        </View>
        <View style={styles.rangeSummaryRow}>
          <TouchableOpacity style={[styles.rangeSummary, { borderColor: selecting === "start" ? theme.primary : theme.border, backgroundColor: selecting === "start" ? withAlpha(theme.primary, theme.dark ? 0.24 : 0.08) : theme.surfaceAlt }]} onPress={() => setSelecting("start")}>
            <Text style={[styles.rangeSummaryLabel, { color: theme.muted }]}>FROM</Text>
            <Text style={[styles.rangeSummaryValue, { color: theme.text }]}>{draftStart.format("MMM D, YYYY")}</Text>
          </TouchableOpacity>
          <View style={styles.rangeSummaryDivider}>
            <Ionicons name="arrow-forward" size={16} color={theme.muted} />
            <Text style={[styles.rangeSummarySpan, { color: theme.accent }]}>{isSameDay ? "1 day" : `${rangeSpan} days`}</Text>
          </View>
          <TouchableOpacity style={[styles.rangeSummary, { borderColor: selecting === "end" ? theme.primary : theme.border, backgroundColor: selecting === "end" ? withAlpha(theme.primary, theme.dark ? 0.24 : 0.08) : theme.surfaceAlt }]} onPress={() => setSelecting("end")}>
            <Text style={[styles.rangeSummaryLabel, { color: theme.muted }]}>TO</Text>
            <Text style={[styles.rangeSummaryValue, { color: theme.text }]}>{draftEnd.format("MMM D, YYYY")}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.calendarMonthRow}>
          <TouchableOpacity style={[styles.calendarNav, { borderColor: theme.border }]} onPress={() => setMonth((current) => current.subtract(1, "month"))} accessibilityLabel="Previous month"><Ionicons name="chevron-back" size={20} color={theme.accent} /></TouchableOpacity>
          <Text style={[styles.calendarMonth, { color: theme.text }]}>{month.format("MMMM YYYY")}</Text>
          <TouchableOpacity style={[styles.calendarNav, { borderColor: theme.border }]} onPress={() => setMonth((current) => current.add(1, "month"))} accessibilityLabel="Next month"><Ionicons name="chevron-forward" size={20} color={theme.accent} /></TouchableOpacity>
        </View>
        <View style={styles.calendarWeek}>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, index) => <Text key={label} style={[styles.calendarWeekday, { color: index === 0 || index === 6 ? theme.accent : theme.muted }]}>{label}</Text>)}</View>
        <View style={styles.calendarGrid}>{cells.map((day, index) => {
          if (!day) return <View key={`blank-${index}`} style={styles.calendarDayWrap} />;
          const value = day.valueOf();
          const isStart = value === draftStart.valueOf();
          const isEnd = value === draftEnd.valueOf();
          const inRange = value > draftStart.valueOf() && value < draftEnd.valueOf();
          const isToday = value === today.valueOf();
          const selected = isStart || isEnd;
          const showRange = !isSameDay && (inRange || isStart || isEnd);
          const rangeEdges = {
            borderTopLeftRadius: (isStart || (isSameDay && selected)) ? 999 : 0,
            borderBottomLeftRadius: (isStart || (isSameDay && selected)) ? 999 : 0,
            borderTopRightRadius: (isEnd || (isSameDay && selected)) ? 999 : 0,
            borderBottomRightRadius: (isEnd || (isSameDay && selected)) ? 999 : 0,
          } as const;
          return <TouchableOpacity key={day.format("YYYY-MM-DD")} style={styles.calendarDayWrap} activeOpacity={0.7} onPress={() => choose(day)} accessibilityLabel={day.format("MMMM D, YYYY")}>
            <View style={[styles.calendarDayTrack, showRange && { backgroundColor: rangeAlpha, ...rangeEdges }]}>
              <View style={[styles.calendarDayDot, selected && { backgroundColor: theme.primary }, !selected && isToday && { borderWidth: 1.5, borderColor: theme.accent }]}>
                <Text style={[styles.calendarDayText, { color: selected ? theme.onPrimary : isToday ? theme.accent : theme.text }]}>{day.date()}</Text>
              </View>
            </View>
          </TouchableOpacity>;
        })}</View>
        <View style={styles.calendarLegend}>
          <View style={styles.calendarLegendItem}><View style={[styles.calendarLegendDot, { backgroundColor: theme.primary }]} /><Text style={[styles.calendarLegendText, { color: theme.muted }]}>Selected</Text></View>
          <View style={styles.calendarLegendItem}><View style={[styles.calendarLegendDot, { borderWidth: 1.5, borderColor: theme.accent }]} /><Text style={[styles.calendarLegendText, { color: theme.muted }]}>Today</Text></View>
        </View>
        <View style={styles.calendarQuickRow}>
          <TouchableOpacity style={[styles.calendarQuick, { borderColor: theme.border }]} onPress={() => applyQuick(today, today)}><Text style={{ color: theme.text, fontWeight: "800", fontSize: 11 }}>Today</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.calendarQuick, { borderColor: theme.border }]} onPress={() => applyQuick(today.subtract(6, "day"), today)}><Text style={{ color: theme.text, fontWeight: "800", fontSize: 11 }}>Last 7 days</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.calendarQuick, { borderColor: theme.border }]} onPress={() => applyQuick(today.subtract(29, "day"), today)}><Text style={{ color: theme.text, fontWeight: "800", fontSize: 11 }}>Last 30 days</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.calendarQuick, { borderColor: theme.border }]} onPress={() => applyQuick(today.startOf("month"), today.endOf("month").startOf("day"))}><Text style={{ color: theme.text, fontWeight: "800", fontSize: 11 }}>This month</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.calendarApply, { backgroundColor: theme.primary }]} onPress={() => onApply(draftStart.toDate(), draftEnd.toDate())}><Ionicons name="checkmark" size={16} color={theme.onPrimary} /><Text style={{ color: theme.onPrimary, fontWeight: "900", fontSize: 12 }}>Apply range</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>;
}

export default function ReportsScreen() {
  const dark = useIsDarkTheme();
  const theme = usePosTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [preset, setPreset] = useState<Preset>("today");
  const [startDate, setStartDate] = useState(dayjs().startOf("day").toDate());
  const [endDate, setEndDate] = useState(dayjs().endOf("day").toDate());
  const [dateTarget, setDateTarget] = useState<DateTarget>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [report, setReport] = useState<SalesReport>(emptyReport);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [eodVisible, setEodVisible] = useState(false);
  const [printingEod, setPrintingEod] = useState(false);
  const [settings, setSettings] = useState<ResolvedSettings | null>(null);
  const [queueingEod, setQueueingEod] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const salesGroupCashierIds = useAccessSettingsStore((state) => state.salesGroupCashierIds);
  const selectedPrinter = usePrinterStore((state) => state.selectedPrinter);
  const operatingMode = useBusinessConfigStore((state) => state.configuration.operatingMode);
  const showOmsSyncStatus = operatingMode === "NCT_DEPENDENT";

  const colors = useMemo(() => ({
    background: theme.background, panel: theme.surface, panelAlt: theme.surfaceAlt,
    border: theme.border, text: theme.text, muted: theme.muted,
  }), [theme.background, theme.surface, theme.surfaceAlt, theme.border, theme.text, theme.muted]);

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

  const openCalendar = (target: Exclude<DateTarget, null>) => {
    setDateTarget(target);
    setCalendarVisible(true);
  };

  const applyCustomRange = (selectedStart: Date, selectedEnd: Date) => {
    setPreset("custom");
    setStartDate(dayjs(selectedStart).startOf("day").toDate());
    setEndDate(dayjs(selectedEnd).endOf("day").toDate());
    setCalendarVisible(false);
    setDateTarget(null);
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
      const headers = ["Receipt Number", "Timestamp", "Cashier", "Customer", "Payment Method", "Item Count", "Subtotal", "Discount", "Tax", "Total"];
      const rows = report.sales.map((sale) => [
        sale.receiptNumber, sale.createdAt, sale.cashierName, sale.customerName ?? "", sale.paymentMethod,
        sale.itemCount, sale.subtotal, sale.discount, sale.tax, sale.total,
        ...(showOmsSyncStatus ? [sale.syncStatus ?? (sale.synced ? "SYNCED" : "UNSYNCED"), sale.syncError ?? ""] : []),
      ]);
      if (showOmsSyncStatus) headers.push("Sync Status", "Sync Error");
      const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
      const file = new File(Paths.cache, `sales-report-${dayjs(startDate).format("YYYYMMDD")}-${dayjs(endDate).format("YYYYMMDD")}.csv`);
      file.create({ overwrite: true, intermediates: true });
      file.writeSync(csv);
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
      const logoUri = await getPrintableFileDataUri(settings?.logoUri) || await getPrintableAssetDataUri(
        require("../../../assets/thermal-printer-logo.jpg"),
        "image/jpeg"
      );

      const subtotal = report.sales.reduce((sum, sale) => sum + Number(sale.subtotal || 0), 0);
      const sameDate = dayjs(startDate).isSame(endDate, "day");
      const period = sameDate
        ? dayjs(startDate).format("MMM D, YYYY")
        : `${dayjs(startDate).format("MMM D, YYYY")} - ${dayjs(endDate).format("MMM D, YYYY")}`;

      if (Platform.OS === "android") {
        if (!selectedPrinter) {
          Alert.alert(
            "Print EOD Report",
            "Select a Bluetooth thermal printer in Settings first."
          );
          return;
        }
        const reportText = formatEscPosEndOfDayReport({
          storeName: settings?.storeName,
          address: settings?.address,
          supportPhone: settings?.supportPhone,
          period,
          generatedAt: new Date(),
          subtotal,
          summary: report.summary,
          payments: report.payments,
          itemSales: report.itemSales,
          cashiers: report.cashiers,
        });
        await BluetoothPrinter.printReceipt(
          selectedPrinter.address,
          reportText,
          logoUri,
          null,
          null,
          false
        );
        return;
      }

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
      Alert.alert(
        "Print EOD Report",
        cancelled
          ? "Printer selection was cancelled."
          : error?.message ??
              "No thermal printer was selected or the print service is unavailable."
      );
    } finally {
      setPrintingEod(false);
    }
  };

  const queueEndOfDay = async () => {
    if (queueingEod) return;
    if (!dayjs(startDate).isSame(endDate, "day")) {
      Alert.alert("End of day", "Choose a single business date before closing an end-of-day report.");
      return;
    }
    setQueueingEod(true);
    try {
      const result = await EndOfDayService.closeLocally({
        businessDate: dayjs(startDate).format("YYYY-MM-DD"),
      });
      Alert.alert("End of day saved", `A recoverable backup is stored on this device. Sales continue syncing to NCT OMS.\n\nBackup: ${result.backup.fileUri}`);
      setEodVisible(false);
    } catch (error: any) {
      Alert.alert("End of day", error?.message ?? "Unable to create the recoverable EOD package.");
    } finally { setQueueingEod(false); }
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
              { backgroundColor: colors.panel, borderColor: theme.primary },
              !report.sales.length && styles.disabled,
            ]}
            onPress={() => setEodVisible(true)}
            disabled={!report.sales.length || loading}
          >
            <Ionicons name="print-outline" size={18} color={theme.primary} />
            <Text style={[styles.printButtonText, { color: theme.primary }]}>End of Day</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.exportButton, { backgroundColor: theme.primary }, !report.sales.length && styles.disabled]} onPress={exportCsv} disabled={!report.sales.length || exporting}>
            {exporting ? <ActivityIndicator color={theme.onPrimary} /> : <Ionicons name="download-outline" size={18} color={theme.onPrimary} />}
            <Text style={[styles.exportText, { color: theme.onPrimary }]}>Export CSV</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.rangeRow}>
        <View style={styles.presets}>
          {([['today', 'Today'], ['7days', '7 Days'], ['30days', '30 Days']] as const).map(([key, label]) => (
            <TouchableOpacity key={key} style={[styles.presetButton, { borderColor: preset === key ? theme.primary : colors.border, backgroundColor: preset === key ? theme.primary : colors.panel }]} onPress={() => applyPreset(key)}>
              <Text style={[styles.presetText, { color: preset === key ? theme.onPrimary : colors.muted }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.customDates}>
          <TouchableOpacity style={[styles.dateButton, { borderColor: colors.border, backgroundColor: colors.panel }]} onPress={() => openCalendar("start")}>
            <Ionicons name="calendar-outline" size={16} color={colors.muted} />
            <Text style={[styles.dateText, { color: colors.text }]}>{dayjs(startDate).format("MMM D, YYYY")}</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.muted }}>to</Text>
          <TouchableOpacity style={[styles.dateButton, { borderColor: colors.border, backgroundColor: colors.panel }]} onPress={() => openCalendar("end")}>
            <Ionicons name="calendar-outline" size={16} color={colors.muted} />
            <Text style={[styles.dateText, { color: colors.text }]}>{dayjs(endDate).format("MMM D, YYYY")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <DateRangeCalendar visible={calendarVisible} startDate={startDate} endDate={endDate} initialTarget={dateTarget} onClose={() => { setCalendarVisible(false); setDateTarget(null); }} onApply={applyCustomRange} />

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={theme.accent} /></View>
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
                  <View style={[styles.progressTrack, { backgroundColor: colors.panelAlt }]}><View style={[styles.progressFill, { width: `${Math.max(3, (payment.amount / paymentMax) * 100)}%`, backgroundColor: theme.accent }]} /></View>
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
                <Text style={[styles.panelTitle, { color: colors.text }]}>{showOmsSyncStatus ? "Sales & Sync Status" : "Sales Records"}</Text>
                <Text style={[styles.panelCaption, { color: colors.muted }]}>Every recorded sale and whether it reached the OMS</Text>
              </View>
              {showOmsSyncStatus && report.sales.some((sale) => sale.syncStatus === "FAILED" || sale.syncStatus === "UNSYNCED") && (
                <TouchableOpacity
                  style={[styles.retryAllButton, { borderColor: theme.accent, backgroundColor: theme.surfaceAlt }]}
                  onPress={retryFailedSales}
                  disabled={retryingId !== null}
                >
                  {retryingId === "all" ? (
                    <ActivityIndicator size="small" color={theme.accent} />
                  ) : (
                    <Ionicons name="refresh" size={15} color={theme.accent} />
                  )}
                  <Text style={[styles.retryAllText, { color: theme.accent }]}>Retry failed</Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={[styles.salesTable, !showOmsSyncStatus && styles.salesTableLocal]}>
                <View style={[styles.salesRow, { backgroundColor: colors.panelAlt }]}>
                  {(showOmsSyncStatus ? ["Receipt", "Date", "Cashier", "Total", "Status", "Reason", ""] : ["Receipt", "Date", "Cashier", "Total"]).map((label, index) => (
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
                      {showOmsSyncStatus ? <><Text style={[styles.salesCell, { color: info.color, fontWeight: "700" }]} numberOfLines={1}>{info.label}</Text>
                      <Text style={[styles.salesReasonCell, { color: colors.muted }]} numberOfLines={2}>{sale.syncError ?? ""}</Text>
                      <View style={styles.salesCell}>
                        {canRetry && (
                          <TouchableOpacity
                            style={[styles.retryRowButton, { borderColor: theme.accent, backgroundColor: theme.surfaceAlt }]}
                            onPress={() => retrySale(sale.id)}
                            disabled={retryingId !== null}
                          >
                            {retryingId === sale.id ? (
                              <ActivityIndicator size="small" color={theme.accent} />
                            ) : (
                              <Text style={[styles.retryRowText, { color: theme.accent }]}>Retry</Text>
                            )}
                          </TouchableOpacity>
                        )}
                      </View></> : null}
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
        onSaveBackup={() => void queueEndOfDay()}
        savingBackup={queueingEod}
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
  salesTableLocal: { minWidth: 520 },
  calendarBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.58)", alignItems: "center", justifyContent: "center", padding: 20 },
  calendarModal: { width: "100%", maxWidth: 560, borderWidth: 1, borderRadius: 18, padding: 18, elevation: 12 },
  calendarTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  calendarTitle: { fontSize: 20, fontWeight: "900" },
  calendarSubtitle: { fontSize: 11, marginTop: 3 },
  calendarClose: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  rangeSummaryRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16 },
  rangeSummary: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  rangeSummaryLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  rangeSummaryValue: { fontSize: 13, fontWeight: "800", marginTop: 2 },
  rangeSummaryDivider: { alignItems: "center", gap: 2, paddingHorizontal: 2 },
  rangeSummarySpan: { fontSize: 9, fontWeight: "900" },
  calendarMonthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, marginBottom: 8 },
  calendarMonth: { fontSize: 16, fontWeight: "900" },
  calendarNav: { width: 38, height: 38, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  calendarWeek: { flexDirection: "row", marginBottom: 2 },
  calendarWeekday: { width: "14.2857%", textAlign: "center", fontSize: 10, fontWeight: "900", paddingVertical: 7, textTransform: "uppercase" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  calendarDayWrap: { width: "14.2857%", aspectRatio: 1, padding: 1.5 },
  calendarDayTrack: { flex: 1, alignItems: "center", justifyContent: "center" },
  calendarDayDot: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  calendarDayText: { fontSize: 12.5, fontWeight: "800" },
  calendarLegend: { flexDirection: "row", gap: 16, marginTop: 8, marginBottom: 2 },
  calendarLegendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  calendarLegendDot: { width: 12, height: 12, borderRadius: 6 },
  calendarLegendText: { fontSize: 10, fontWeight: "700" },
  calendarQuickRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 14 },
  calendarQuick: { minHeight: 38, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  calendarApply: { minHeight: 40, borderRadius: 9, paddingHorizontal: 18, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", marginLeft: "auto" },
});

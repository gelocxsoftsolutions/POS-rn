import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Card } from "@/components/ui/card";
import { InventoryService } from "@/lib/services/inventory.service";
import { SaleService } from "@/lib/services/sale.service";
import { SettingsService } from "@/lib/services/settings.service";
import { TransferService } from "@/lib/services/transfer.service";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useOmsConnectionStore } from "@/lib/stores/oms-connection-store";
import { useSyncStore } from "@/lib/stores/sync-store";
import { useIsDarkTheme } from "@/lib/stores/ui-store";
import { useAccessSettingsStore } from "@/lib/stores/access-settings-store";

interface DashboardData {
  todaysSales: number;
  transactionCount: number;
  lowStockCount: number;
  incomingTransfers: number;
}

const initialData: DashboardData = {
  todaysSales: 0,
  transactionCount: 0,
  lowStockCount: 0,
  incomingTransfers: 0,
};

const currency = (value: number) =>
  `\u20B1${value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function Dashboard() {
  const router = useRouter();
  const dark = useIsDarkTheme();
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [data, setData] = useState<DashboardData>(initialData);
  const [storeName, setStoreName] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const device = useDeviceStore((state) => state.device);
  const session = useCashierStore((state) => state.session);
  const connectionStatus = useOmsConnectionStore((state) => state.status);
  const pendingSync = useSyncStore((state) => state.pendingCount);
  const refreshPendingCount = useSyncStore((state) => state.refreshPendingCount);
  const salesGroupCashierIds = useAccessSettingsStore((state) => state.salesGroupCashierIds);

  const colors = useMemo(
    () => ({
      background: dark ? "#0b0f16" : "#f4f6f8",
      panel: dark ? "#141922" : "#ffffff",
      border: dark ? "#293241" : "#dfe5ec",
      text: dark ? "#f4f7fb" : "#172033",
      muted: dark ? "#93a0b2" : "#667085",
      subtle: dark ? "#1b2432" : "#edf2f7",
    }),
    [dark]
  );

  const loadData = useCallback(async () => {
    try {
      const [summary, lowStock, transfers, settings] = await Promise.all([
        SaleService.summary(),
        InventoryService.getLowStock(),
        TransferService.list({ status: "IN_TRANSIT", page: 1, pageSize: 1 }),
        SettingsService.get(),
        refreshPendingCount(),
      ]);

      setData({
        todaysSales: summary.totalSales,
        transactionCount: summary.transactionCount,
        lowStockCount: lowStock.length,
        incomingTransfers: transfers.total,
      });
      setStoreName(settings.storeName || device.branchName || "NCT Seafoods");
    } catch {
      setStoreName(device.branchName || "NCT Seafoods");
    }
  }, [device.branchName, refreshPendingCount, salesGroupCashierIds]);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const navigate = useCallback((href: string) => router.push(href as never), [router]);

  const quickActions = [
    { label: "New Sale", detail: "Open checkout", icon: "cart-outline" as const, href: "/(pos)/sales", primary: true },
    { label: "Find Receipt", detail: "Review or reprint", icon: "receipt-outline" as const, href: "/(pos)/receipts" },
    { label: "Products", detail: "Prices and stock", icon: "cube-outline" as const, href: "/(pos)/products" },
    { label: "Receive Stock", detail: "Open transfers", icon: "swap-horizontal-outline" as const, href: "/(pos)/transfers" },
  ];

  const attentionItems = [
    { label: "Low-stock products", value: data.lowStockCount, icon: "alert-circle-outline" as const, color: data.lowStockCount > 0 ? "#d97706" : "#16a34a", href: "/(pos)/products" },
    { label: "Incoming transfers", value: data.incomingTransfers, icon: "archive-outline" as const, color: data.incomingTransfers > 0 ? "#2563eb" : "#16a34a", href: "/(pos)/transfers" },
    { label: "Waiting to sync", value: pendingSync, icon: "cloud-upload-outline" as const, color: pendingSync > 0 ? "#dc2626" : "#16a34a", href: "/(pos)/settings" },
  ];

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#1f477f" />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1f477f" />}
    >
      <View style={[styles.pageHeader, compact && styles.pageHeaderCompact]}>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: colors.muted }]}>HOME</Text>
          <Text style={[styles.greeting, { color: colors.text }]}>Good day, {session?.cashierName?.split(" ")[0] || "Cashier"}</Text>
          <Text style={[styles.pageSubtitle, { color: colors.muted }]} numberOfLines={1}>{storeName}</Text>
        </View>
        <View style={[styles.datePill, { backgroundColor: colors.panel, borderColor: colors.border }]}>
          <Ionicons name="calendar-outline" size={16} color={colors.muted} />
          <Text style={[styles.dateText, { color: colors.text }]}>
            {new Date().toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })}
          </Text>
        </View>
      </View>

      <View style={[styles.hero, compact && styles.heroCompact, { backgroundColor: dark ? "#142d50" : "#173f73" }]}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroLabel}>TODAY'S TAKINGS</Text>
          <Text style={styles.heroValue}>{currency(data.todaysSales)}</Text>
          <Text style={styles.heroMeta}>{data.transactionCount} {data.transactionCount === 1 ? "completed sale" : "completed sales"}</Text>
        </View>
        <TouchableOpacity style={styles.reportButton} onPress={() => navigate("/(pos)/reports")} activeOpacity={0.8}>
          <Ionicons name="bar-chart-outline" size={18} color="#ffffff" />
          <Text style={styles.reportButtonText}>View reports</Text>
          <Ionicons name="chevron-forward" size={16} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick actions</Text>
      <View style={styles.actionGrid}>
        {quickActions.map((action) => (
          <TouchableOpacity
            key={action.label}
            style={[styles.actionCard, { width: compact ? "48.5%" : "23.8%", backgroundColor: action.primary ? "#1f477f" : colors.panel, borderColor: action.primary ? "#1f477f" : colors.border }]}
            onPress={() => navigate(action.href)}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIcon, { backgroundColor: action.primary ? "rgba(255,255,255,0.14)" : colors.subtle }]}>
              <Ionicons name={action.icon} size={23} color={action.primary ? "#ffffff" : dark ? "#8db7ed" : "#1f477f"} />
            </View>
            <Text style={[styles.actionLabel, { color: action.primary ? "#ffffff" : colors.text }]}>{action.label}</Text>
            <Text style={[styles.actionDetail, { color: action.primary ? "#c8d9ef" : colors.muted }]}>{action.detail}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.lowerGrid, compact && styles.lowerGridCompact]}>
        <Card style={[styles.attentionCard, { backgroundColor: colors.panel, borderColor: colors.border }]}>
          <View style={styles.cardHeadingRow}>
            <View>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Needs attention</Text>
              <Text style={[styles.cardSubtitle, { color: colors.muted }]}>What may need action before the next sale</Text>
            </View>
          </View>
          <View style={[styles.attentionList, { borderTopColor: colors.border }]}>
            {attentionItems.map((item) => (
              <TouchableOpacity key={item.label} style={styles.attentionRow} onPress={() => navigate(item.href)} activeOpacity={0.7}>
                <View style={[styles.attentionIcon, { backgroundColor: `${item.color}18` }]}>
                  <Ionicons name={item.icon} size={19} color={item.color} />
                </View>
                <Text style={[styles.attentionLabel, { color: colors.text }]}>{item.label}</Text>
                <View style={[styles.countBadge, { backgroundColor: `${item.color}18` }]}>
                  <Text style={[styles.countText, { color: item.color }]}>{item.value}</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.muted} />
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card style={[styles.sessionCard, { backgroundColor: colors.panel, borderColor: colors.border }]}>
          <View style={styles.cardHeadingRow}>
            <View>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Current session</Text>
              <Text style={[styles.cardSubtitle, { color: colors.muted }]}>This terminal and cashier</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: connectionStatus === "connected" ? "#dcfce7" : "#fee2e2" }]}>
              <View style={[styles.statusDot, { backgroundColor: connectionStatus === "connected" ? "#16a34a" : "#dc2626" }]} />
              <Text style={[styles.statusText, { color: connectionStatus === "connected" ? "#166534" : "#991b1b" }]}>{connectionStatus === "connected" ? "Online" : "Offline"}</Text>
            </View>
          </View>
          <View style={[styles.sessionRows, { borderTopColor: colors.border }]}>
            <SessionRow label="Cashier" value={session?.cashierName || "Not signed in"} colors={colors} />
            <SessionRow label="Terminal" value={device.deviceCode || device.deviceName || "Not assigned"} colors={colors} />
            <SessionRow label="Branch" value={device.branchName || storeName} colors={colors} />
          </View>
        </Card>
      </View>
    </ScrollView>
  );
}

function SessionRow({ label, value, colors }: { label: string; value: string; colors: { text: string; muted: string } }) {
  return (
    <View style={styles.sessionRow}>
      <Text style={[styles.sessionLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.sessionValue, { color: colors.text }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingBottom: 40 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  pageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  pageHeaderCompact: { alignItems: "flex-start" },
  headerCopy: { flex: 1, minWidth: 0, paddingRight: 16 },
  eyebrow: { fontSize: 11, fontWeight: "800", marginBottom: 4 },
  greeting: { fontSize: 26, fontWeight: "800" },
  pageSubtitle: { fontSize: 13, marginTop: 4 },
  datePill: { minHeight: 38, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 7 },
  dateText: { fontSize: 12, fontWeight: "700" },
  hero: { minHeight: 132, borderRadius: 8, padding: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  heroCompact: { flexDirection: "column", alignItems: "flex-start", gap: 16 },
  heroCopy: { flex: 1, minWidth: 0 },
  heroLabel: { color: "#b9cce5", fontSize: 11, fontWeight: "800" },
  heroValue: { color: "#ffffff", fontSize: 31, fontWeight: "900", marginTop: 7 },
  heroMeta: { color: "#d8e4f2", fontSize: 12, marginTop: 5 },
  reportButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 7, borderWidth: 1, borderColor: "rgba(255,255,255,0.34)", flexDirection: "row", alignItems: "center", gap: 8 },
  reportButtonText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
  sectionTitle: { fontSize: 16, fontWeight: "800", marginBottom: 12 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10, marginBottom: 24 },
  actionCard: { minHeight: 126, padding: 15, borderRadius: 8, borderWidth: 1 },
  actionIcon: { width: 40, height: 40, borderRadius: 7, alignItems: "center", justifyContent: "center", marginBottom: 13 },
  actionLabel: { fontSize: 14, fontWeight: "800" },
  actionDetail: { fontSize: 11, marginTop: 4 },
  lowerGrid: { flexDirection: "row", alignItems: "stretch", gap: 14 },
  lowerGridCompact: { flexDirection: "column" },
  attentionCard: { flex: 1.15, padding: 18, borderRadius: 8, shadowOpacity: 0.03 },
  sessionCard: { flex: 0.85, padding: 18, borderRadius: 8, shadowOpacity: 0.03 },
  cardHeadingRow: { minHeight: 43, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  cardTitle: { fontSize: 15, fontWeight: "800" },
  cardSubtitle: { fontSize: 11, marginTop: 4 },
  attentionList: { borderTopWidth: 1, marginTop: 13, paddingTop: 4 },
  attentionRow: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 10 },
  attentionIcon: { width: 32, height: 32, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  attentionLabel: { flex: 1, fontSize: 12, fontWeight: "600" },
  countBadge: { minWidth: 30, height: 25, paddingHorizontal: 8, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  countText: { fontSize: 12, fontWeight: "800" },
  statusBadge: { height: 27, borderRadius: 14, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: "800" },
  sessionRows: { borderTopWidth: 1, marginTop: 13, paddingTop: 8 },
  sessionRow: { minHeight: 43, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sessionLabel: { fontSize: 12 },
  sessionValue: { flex: 1, textAlign: "right", fontSize: 12, fontWeight: "700" },
});

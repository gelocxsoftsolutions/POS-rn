import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { SaleService } from "@/lib/services/sale.service";
import { InventoryService } from "@/lib/services/inventory.service";
import { SettingsService } from "@/lib/services/settings.service";
import { useUiStore } from "@/lib/stores/ui-store";

const { width } = Dimensions.get("window");

interface DashboardStats {
  todaysSales: number;
  transactionCount: number;
  averageBasket: number;
  lowStockCount: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    todaysSales: 0,
    transactionCount: 0,
    averageBasket: 0,
    lowStockCount: 0,
  });
  const [storeName, setStoreName] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const device = useDeviceStore((s) => s.device);
  const session = useCashierStore((s) => s.session);
  const dark = useUiStore((s) => s.themeMode) === "dark";

  const loadData = useCallback(async () => {
    try {
      const [summary, lowStock, settings] = await Promise.all([
        SaleService.summary(),
        InventoryService.getLowStock(),
        SettingsService.get(),
      ]);
      setStats({
        todaysSales: summary.totalSales,
        transactionCount: summary.transactionCount,
        averageBasket: summary.averageBasket,
        lowStockCount: lowStock.length,
      });
      setStoreName(settings.storeName || device.branchName || "");
    } catch {
      // keep defaults
    }
  }, [device.branchName]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadData();
      setLoading(false);
    })();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const statCards = [
    {
      title: "Sales Today",
      value: `₱${stats.todaysSales.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
      icon: "cash-outline" as const,
      color: "#17386b",
      bg: "#f0f4ff",
    },
    {
      title: "Transactions",
      value: stats.transactionCount.toString(),
      icon: "receipt-outline" as const,
      color: "#28a745",
      bg: "#f0fff4",
    },
    {
      title: "Avg Basket",
      value: `₱${stats.averageBasket.toFixed(2)}`,
      icon: "basket-outline" as const,
      color: "#6f42c1",
      bg: "#f8f0ff",
    },
    {
      title: "Low Stock",
      value: stats.lowStockCount.toString(),
      icon: "warning-outline" as const,
      color: stats.lowStockCount > 0 ? "#dc3545" : "#28a745",
      bg: stats.lowStockCount > 0 ? "#fff5f5" : "#f0fff4",
    },
  ];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#17386b" />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: dark ? "#050a14" : "#f8fbff" }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={[styles.greeting, { color: dark ? "#e2e8f0" : "#1a202c" }]}>Dashboard</Text>

      <View style={styles.statsGrid}>
        {statCards.map((stat) => (
          <Card key={stat.title} style={[styles.statCard, { width: (width - 64) / 2, backgroundColor: dark ? "#0f1729" : "#ffffff" }]}>
            <View style={[styles.statIcon, { backgroundColor: stat.bg }]}>
              <Ionicons name={stat.icon} size={22} color={stat.color} />
            </View>
            <Text style={[styles.statValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{stat.value}</Text>
            <Text style={[styles.statTitle, { color: dark ? "#9ca3af" : "#6b7b8d" }]}>{stat.title}</Text>
          </Card>
        ))}
      </View>

      <Card style={[styles.sessionCard, { backgroundColor: dark ? "#0f1729" : "#ffffff" }]}>
        <View style={styles.sessionHeader}>
          <Ionicons name="storefront-outline" size={20} color="#17386b" />
          <Text style={[styles.sessionTitle, { color: dark ? "#e2e8f0" : "#1a202c" }]}>Current Session</Text>
        </View>
        <View style={styles.sessionInfo}>
          <View style={styles.sessionRow}>
            <Text style={[styles.sessionLabel, { color: dark ? "#9ca3af" : "#6b7b8d" }]}>Store</Text>
            <Text style={[styles.sessionValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{storeName || "N/A"}</Text>
          </View>
          <View style={styles.sessionRow}>
            <Text style={[styles.sessionLabel, { color: dark ? "#9ca3af" : "#6b7b8d" }]}>Cashier</Text>
            <Text style={[styles.sessionValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{session?.cashierName ?? "N/A"}</Text>
          </View>
          <View style={styles.sessionRow}>
            <Text style={[styles.sessionLabel, { color: dark ? "#9ca3af" : "#6b7b8d" }]}>Status</Text>
            <Badge label="Active" color="#28a745" />
          </View>
          <View style={styles.sessionRow}>
            <Text style={[styles.sessionLabel, { color: dark ? "#9ca3af" : "#6b7b8d" }]}>Device</Text>
            <Text style={[styles.sessionValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{device.deviceCode ?? "N/A"}</Text>
          </View>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  greeting: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a202c",
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    padding: 16,
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1a202c",
  },
  statTitle: {
    fontSize: 12,
    color: "#6b7b8d",
    marginTop: 4,
  },
  sessionCard: {
    padding: 20,
  },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  sessionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a202c",
    marginLeft: 8,
  },
  sessionInfo: {
    gap: 12,
  },
  sessionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sessionLabel: {
    fontSize: 13,
    color: "#6b7b8d",
  },
  sessionValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a202c",
  },
});

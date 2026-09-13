import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Dimensions, ActivityIndicator } from "react-native";
import { usePathname, Slot, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUiStore } from "@/lib/stores/ui-store";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useDeviceStore } from "@/lib/stores/device-store";
import { SessionIndicator } from "@/components/layout/session-indicator";
import { Sidebar } from "@/components/layout/sidebar";
import { LockScreen } from "@/components/auth/lock-screen";
import { getDatabase } from "@/lib/db/connection";
import { SeedService } from "@/lib/services/seed.service";

const { width } = Dimensions.get("window");
const WIDE_BREAKPOINT = 768;

const tabScreens = [
  { name: "index", title: "Home", icon: "home-outline" as const },
  { name: "sales", title: "Sales", icon: "cart-outline" as const },
  { name: "receipts", title: "Receipts", icon: "receipt-outline" as const },
  { name: "products", title: "Products", icon: "cube-outline" as const },
  { name: "stock", title: "Stock", icon: "archive-outline" as const },
  { name: "transfers", title: "Transfers", icon: "swap-horizontal-outline" as const },
  { name: "settings", title: "Settings", icon: "settings-outline" as const },
];

function POSHeader() {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <View style={styles.transferBadge}>
          <Ionicons name="swap-horizontal" size={14} color="#17386b" />
          <Text style={styles.transferBadgeText}>0</Text>
        </View>
      </View>
      <Text style={styles.headerTitle}>NCT Seafoods POS System</Text>
      <View style={styles.headerRight}>
        <SessionIndicator />
      </View>
    </View>
  );
}

export default function POSLayout() {
  const pathname = usePathname();
  const navigationMode = useUiStore((s) => s.navigationMode);
  const session = useCashierStore((s) => s.session);
  const device = useDeviceStore((s) => s.device);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await getDatabase();
        await SeedService.run();
      } catch {
        // silent fail
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const isWide =
    navigationMode === "sidebar" ||
    (navigationMode === "auto" && width >= WIDE_BREAKPOINT);

  if (!ready) {
    return (
      <View style={styles.container}>
        <POSHeader />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#17386b" />
        </View>
      </View>
    );
  }

  if (device.registrationState === "unregistered") {
    return (
      <View style={styles.container}>
        <POSHeader />
        <View style={styles.centered}>
          <Text style={styles.centeredText}>Device not registered</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {session?.locked && <LockScreen />}
      <POSHeader />
      <View style={styles.body}>
        {isWide && <Sidebar currentPath={pathname} />}
        <View style={styles.main}>
          <Slot />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fbff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#17386b",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 48,
  },
  headerLeft: {
    width: 120,
    alignItems: "flex-start",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    textAlign: "center",
  },
  headerRight: {
    width: 120,
    alignItems: "flex-end",
  },
  transferBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  transferBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
  },
  body: {
    flex: 1,
    flexDirection: "row",
  },
  main: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  centeredText: {
    fontSize: 16,
    color: "#6b7b8d",
  },
});

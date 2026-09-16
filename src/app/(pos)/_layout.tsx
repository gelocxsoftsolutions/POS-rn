import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  Animated,
} from "react-native";
import { usePathname, useRouter, Slot } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUiStore } from "@/lib/stores/ui-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useDeviceStore } from "@/lib/stores/device-store";
import { PermissionService } from "@/lib/services/permission.service";
import { TransferService } from "@/lib/services/transfer.service";
import { DeviceRepository } from "@/lib/repositories/device.repository";
import { SessionIndicator } from "@/components/layout/session-indicator";
import { LockScreen } from "@/components/auth/lock-screen";
import { BottomSheet } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { useNetworkStore } from "@/lib/services/network.service";
import { useSyncStore } from "@/lib/stores/sync-store";
import type { InventoryTransferDTO } from "@/lib/types/inventory";

const { width } = Dimensions.get("window");
const WIDE_BREAKPOINT = 768;

const navItems = [
  {
    name: "index",
    label: "Home",
    icon: "home-outline" as const,
    activeIcon: "home" as const,
    href: "/(pos)",
    requiredPermission: "DASHBOARD",
  },
  {
    name: "sales",
    label: "Sales",
    icon: "cart-outline" as const,
    activeIcon: "cart" as const,
    href: "/(pos)/sales",
    requiredPermission: "POS_SALES",
  },
  {
    name: "receipts",
    label: "Receipts",
    icon: "receipt-outline" as const,
    activeIcon: "receipt" as const,
    href: "/(pos)/receipts",
    requiredPermission: "POS_RECEIPTS",
  },
  {
    name: "products",
    label: "Products",
    icon: "cube-outline" as const,
    activeIcon: "cube" as const,
    href: "/(pos)/products",
    requiredPermission: "POS_PRODUCTS",
  },
  {
    name: "stock",
    label: "Stock",
    icon: "archive-outline" as const,
    activeIcon: "archive" as const,
    href: "/(pos)/stock",
    requiredPermission: "POS_INVENTORY",
  },
  {
    name: "transfers",
    label: "Transfers",
    icon: "swap-horizontal-outline" as const,
    activeIcon: "swap-horizontal" as const,
    href: "/(pos)/transfers",
    requiredPermission: "POS_TRANSFERS",
  },
  {
    name: "settings",
    label: "Settings",
    icon: "settings-outline" as const,
    activeIcon: "settings" as const,
    href: "/(pos)/settings",
    requiredPermission: "POS_SETTINGS",
  },
];

function TransferBadge({
  count,
  onPress,
  dark,
}: {
  count: number;
  onPress: () => void;
  dark: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.transferBadgeBtn}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons
        name="car"
        size={18}
        color={count > 0 ? "#3b82f6" : dark ? "#9ca3af" : "#6b7280"}
      />
      {count > 0 && (
        <View style={styles.transferBadgeCount}>
          <Text style={styles.transferBadgeText}>
            {count > 9 ? "9+" : count}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function TransferDialog({
  visible,
  onClose,
  transfers,
}: {
  visible: boolean;
  onClose: () => void;
  transfers: InventoryTransferDTO[];
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.dialogTitle}>Pending Transfers</Text>
      {transfers.length === 0 ? (
        <Text style={styles.dialogEmpty}>No pending transfers</Text>
      ) : (
        <ScrollView style={styles.dialogScroll} bounces={false}>
          {transfers.map((t) => (
            <View key={t.id} style={styles.dialogItem}>
              <View style={styles.dialogItemContent}>
                <Text style={styles.dialogItemLabel} numberOfLines={1}>
                  {t.transferNumber}
                </Text>
                <Text style={styles.dialogItemMeta}>
                  {t.items?.length ?? 0} item
                  {(t.items?.length ?? 0) !== 1 ? "s" : ""} ·{" "}
                  {new Date(t.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <Badge
                label={t.status}
                color={t.status === "IN_TRANSIT" ? "#3b82f6" : "#6b7280"}
                textColor="#ffffff"
              />
            </View>
          ))}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

function POSHeader({
  transferCount,
  transfers,
  onTransferPress,
  dark,
}: {
  transferCount: number;
  transfers: InventoryTransferDTO[];
  onTransferPress: () => void;
  dark: boolean;
}) {
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const isOnline = useNetworkStore((s) => s.isOnline);
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const isSyncing = useSyncStore((s) => s.isSyncing);

  const handleBadgePress = () => {
    setTransferDialogOpen(true);
    onTransferPress();
  };

  return (
    <>
      <View
        style={[
          styles.header,
          dark ? styles.headerDark : styles.headerLight,
        ]}
      >
        <View style={styles.headerLeft}>
          <TransferBadge
            count={transferCount}
            onPress={handleBadgePress}
            dark={dark}
          />
        </View>
        <Text
          style={[
            styles.headerTitle,
            dark ? styles.headerTitleDark : styles.headerTitleLight,
          ]}
        >
          NCT Seafoods POS System
        </Text>
        <View style={styles.headerRight}>
          <View style={styles.syncIndicator}>
            <View style={[styles.syncDot, { backgroundColor: isOnline ? "#28a745" : "#dc3545" }]} />
            <Text style={[styles.syncText, dark ? styles.syncTextDark : styles.syncTextLight]}>
              {isSyncing ? "Syncing..." : isOnline ? "Online" : "Offline"}
            </Text>
            {pendingCount > 0 && (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>{pendingCount}</Text>
              </View>
            )}
          </View>
          <SessionIndicator />
        </View>
      </View>
      <TransferDialog
        visible={transferDialogOpen}
        onClose={() => setTransferDialogOpen(false)}
        transfers={transfers}
      />
    </>
  );
}

function BottomNavigation({
  visibleNavItems,
  pathname,
  expanded,
  onToggleExpand,
  onNavigate,
}: {
  visibleNavItems: typeof navItems;
  pathname: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onNavigate: (href: string) => void;
}) {
  return (
    <View style={styles.bottomNavContainer}>
      {expanded && (
        <View style={styles.bottomNavExpanded}>
          <View style={styles.bottomNavBar}>
            {visibleNavItems.map((item) => {
              const active = pathname === item.href;
              return (
                <TouchableOpacity
                  key={item.name}
                  style={[styles.bottomNavItem, active && styles.bottomNavItemActive]}
                  onPress={() => onNavigate(item.href)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={active ? item.activeIcon : item.icon}
                    size={20}
                    color={active ? "#17386b" : "#ffffff"}
                  />
                  <Text
                    style={[
                      styles.bottomNavLabel,
                      active && styles.bottomNavLabelActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={styles.bottomNavCollapseBtn}
            onPress={onToggleExpand}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-down" size={20} color="#17386b" />
          </TouchableOpacity>
        </View>
      )}
      {!expanded && (
        <TouchableOpacity
          style={styles.bottomNavExpandBtn}
          onPress={onToggleExpand}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-up" size={22} color="#ffffff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function POSLayout() {
  const pathname = usePathname();
  const router = useRouter();

  const cashier = useAuthStore((s) => s.cashier);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const signOut = useAuthStore((s) => s.signOut);
  const navigationMode = useUiStore((s) => s.navigationMode);
  const themeMode = useUiStore((s) => s.themeMode);
  const uiHydrated = useUiStore((s) => s.hydrated);
  const session = useCashierStore((s) => s.session);
  const cashierHydrated = useCashierStore((s) => s.hydrated);
  const device = useDeviceStore((s) => s.device);
  const deviceHydrated = useDeviceStore((s) => s.hydrated);
  const clearDevice = useDeviceStore((s) => s.clearDevice);

  const [grantedPermissions, setGrantedPermissions] = useState<string[]>([]);
  const [transferCount, setTransferCount] = useState(0);
  const [transfers, setTransfers] = useState<InventoryTransferDTO[]>([]);
  const [bottomNavExpanded, setBottomNavExpanded] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sidebarAnim = useRef(new Animated.Value(1)).current;

  const toggleSidebar = () => {
    const toValue = sidebarOpen ? 0 : 1;
    Animated.spring(sidebarAnim, {
      toValue,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
    setSidebarOpen(!sidebarOpen);
  };

  const dark = themeMode === "dark";

  // Refresh pending sync count on mount
  useEffect(() => {
    useSyncStore.getState().refreshPendingCount();
  }, []);

  const isWide =
    navigationMode === "sidebar" ||
    (navigationMode === "auto" && width >= WIDE_BREAKPOINT);

  // 1. Hydration safety — force hydrated after 3s
  useEffect(() => {
    if (authHydrated && uiHydrated && cashierHydrated) return;
    const t = setTimeout(() => {
      if (!authHydrated) useAuthStore.getState().setHydrated(true);
      if (!uiHydrated) useUiStore.getState().setHydrated(true);
      if (!cashierHydrated) useCashierStore.getState().setHydrated(true);
    }, 3000);
    return () => clearTimeout(t);
  }, [authHydrated, uiHydrated, cashierHydrated]);

  // 2. Permission-gated navigation
  useEffect(() => {
    if (!session?.roleId) return;
    PermissionService.getRolePermissions(session.roleId)
      .then(setGrantedPermissions)
      .catch(() => {});
  }, [session?.roleId]);

  const visibleNavItems = navItems.filter(
    (item) =>
      grantedPermissions.length === 0 ||
      grantedPermissions.includes(item.requiredPermission)
  );

  // 3. Auth redirect guard
  useEffect(() => {
    if (deviceHydrated && device.registrationState !== "registered" && device.registrationState !== "provisioned") {
      router.replace("/(auth)/register");
      return;
    }
    if (authHydrated && !cashier) {
      router.replace("/(auth)");
    }
  }, [cashier, authHydrated, deviceHydrated, device.registrationState, router]);

  // 4. Device revocation check
  useEffect(() => {
    if (!deviceHydrated || !device.deviceId) return;
    if (device.registrationState !== "registered" && device.registrationState !== "provisioned") return;

    let cancelled = false;
    (async () => {
      try {
        const row = await DeviceRepository.find();
        if (!cancelled && row && row.status === "DISABLED") {
          clearDevice();
          router.replace("/(auth)/register");
        }
      } catch {
        // silent fail
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceHydrated, device.deviceId, device.registrationState, clearDevice, router]);

  // 5. Transfer badge polling — every 30 seconds
  useEffect(() => {
    let cancelled = false;

    const checkPendingTransfers = async () => {
      try {
        const result = await TransferService.list({
          status: "IN_TRANSIT",
          page: 1,
          pageSize: 50,
        });
        if (!cancelled) {
          setTransfers(result.items);
          setTransferCount(result.total);
        }
      } catch {
        // ignore
      }
    };

    checkPendingTransfers();
    const interval = setInterval(checkPendingTransfers, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Reset badge when on transfers screen
  useEffect(() => {
    if (pathname === "/(pos)/transfers") {
      setTransferCount(0);
    }
  }, [pathname]);

  // Permission gate — redirect if current route is forbidden
  useEffect(() => {
    if (grantedPermissions.length === 0) return;
    const currentItem = navItems.find((item) => {
      const itemPath = item.href.replace("(pos)", "").replace("//", "/") || "/";
      return pathname === item.href || pathname === itemPath;
    });
    if (currentItem && !grantedPermissions.includes(currentItem.requiredPermission)) {
      router.replace("/(pos)");
    }
  }, [pathname, grantedPermissions, router]);

  // Loading state
  if (!authHydrated || !uiHydrated || !cashierHydrated || !deviceHydrated) {
    return (
      <View style={styles.container}>
        <POSHeader
          transferCount={0}
          transfers={[]}
          onTransferPress={() => {}}
          dark={dark}
        />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#17386b" />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        dark ? styles.bgDark : styles.bgLight,
      ]}
    >
      {session?.locked && (
        <View style={styles.lockOverlay}>
          <LockScreen />
        </View>
      )}

      <POSHeader
        transferCount={transferCount}
        transfers={transfers}
        onTransferPress={() => {}}
        dark={dark}
      />

      <View style={styles.body}>
        {isWide && (
          <>
            <Animated.View
              style={[
                styles.sidebar,
                dark ? styles.sidebarDark : styles.sidebarLight,
                {
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  zIndex: 50,
                  transform: [{
                    translateX: sidebarAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-220, 0],
                    }),
                  }],
                },
              ]}
            >
              <View style={styles.sidebarLogoSection}>
                <View style={styles.sidebarLogoIcon}>
                  <Ionicons name="fish" size={22} color="#17386b" />
                </View>
                <Text style={styles.sidebarLogoText}>NCT POS</Text>
              </View>

              <View style={styles.sidebarNavItems}>
                {visibleNavItems.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <TouchableOpacity
                      key={item.name}
                      style={[
                        styles.sidebarNavItem,
                        active && styles.sidebarNavItemActive,
                      ]}
                      onPress={() => router.push(item.href as any)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={active ? item.activeIcon : item.icon}
                        size={20}
                        color={active ? "#17386b" : "#8e99a4"}
                      />
                      <Text
                        style={[
                          styles.sidebarNavLabel,
                          active && styles.sidebarNavLabelActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                      {item.name === "transfers" && transferCount > 0 && (
                        <View style={styles.sidebarBadge}>
                          <Text style={styles.sidebarBadgeText}>
                            {transferCount > 9 ? "9+" : transferCount}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.sidebarFooter}>
                <SessionIndicator />
              </View>
            </Animated.View>

            <TouchableOpacity
              style={styles.sidebarToggle}
              onPress={toggleSidebar}
              activeOpacity={0.7}
            >
              <Ionicons
                name={sidebarOpen ? "chevron-back" : "chevron-forward"}
                size={16}
                color="#17386b"
              />
            </TouchableOpacity>
          </>
        )}

        <View style={[styles.main, isWide && { marginLeft: sidebarOpen ? 220 : 0 }]}>
          <Slot />
        </View>
      </View>

      {!isWide && (
        <BottomNavigation
          visibleNavItems={visibleNavItems}
          pathname={pathname}
          expanded={bottomNavExpanded}
          onToggleExpand={() => setBottomNavExpanded((p) => !p)}
          onNavigate={(href) => {
            router.push(href as any);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  bgLight: {
    backgroundColor: "#f8fbff",
  },
  bgDark: {
    backgroundColor: "#050a14",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    paddingTop: 48,
    borderBottomWidth: 1,
    zIndex: 30,
  },
  headerLight: {
    backgroundColor: "rgba(255,255,255,0.85)",
    borderBottomColor: "rgba(255,255,255,0.4)",
  },
  headerDark: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerLeft: {
    width: 100,
    alignItems: "flex-start",
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  headerTitleLight: {
    color: "#4169E1",
  },
  headerTitleDark: {
    color: "#ffffff",
  },
  headerRight: {
    width: 100,
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },

  // Sync indicator
  syncIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  syncText: {
    fontSize: 10,
    fontWeight: "600",
  },
  syncTextLight: {
    color: "#4b5563",
  },
  syncTextDark: {
    color: "#9ca3af",
  },
  pendingBadge: {
    backgroundColor: "#f59e0b",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  pendingBadgeText: {
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "700",
  },

  // Transfer badge
  transferBadgeBtn: {
    position: "relative",
    padding: 6,
    borderRadius: 20,
  },
  transferBadgeCount: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: "#ef4444",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  transferBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "700",
  },

  // Transfer dialog
  dialogTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#17386b",
    marginBottom: 12,
  },
  dialogEmpty: {
    fontSize: 14,
    color: "#6b7b8d",
    textAlign: "center",
    paddingVertical: 20,
  },
  dialogScroll: {
    maxHeight: 300,
  },
  dialogItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#e8edf3",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  dialogItemContent: {
    flex: 1,
    marginRight: 10,
  },
  dialogItemLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#17386b",
  },
  dialogItemMeta: {
    fontSize: 12,
    color: "#6b7b8d",
    marginTop: 2,
  },

  // Body
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

  // Sidebar
  sidebar: {
    width: 220,
    paddingTop: 20,
    paddingBottom: 16,
    borderRightWidth: 1,
  },
  sidebarLight: {
    backgroundColor: "#ffffff",
    borderRightColor: "#e8edf3",
  },
  sidebarDark: {
    backgroundColor: "#091227",
    borderRightColor: "rgba(255,255,255,0.1)",
  },
  sidebarLogoSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sidebarLogoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#f0f4ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  sidebarLogoText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#17386b",
  },
  sidebarNavItems: {
    flex: 1,
  },
  sidebarNavItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginHorizontal: 12,
    borderRadius: 8,
  },
  sidebarNavItemActive: {
    backgroundColor: "#f0f4ff",
  },
  sidebarNavLabel: {
    fontSize: 14,
    color: "#8e99a4",
    marginLeft: 12,
    fontWeight: "500",
    flex: 1,
  },
  sidebarNavLabelActive: {
    color: "#17386b",
    fontWeight: "600",
  },
  sidebarBadge: {
    backgroundColor: "#ef4444",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  sidebarBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
  },
  sidebarFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e8edf3",
  },
  sidebarToggle: {
    position: "absolute",
    top: 60,
    left: 4,
    zIndex: 51,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },

  // Bottom navigation
  bottomNavContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 40,
    paddingBottom: 8,
  },
  bottomNavExpanded: {
    alignItems: "center",
    width: "100%",
  },
  bottomNavBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#17386b",
    marginHorizontal: 10,
    borderRadius: 28,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: "#1f497f",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  bottomNavItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    minWidth: 56,
  },
  bottomNavItemActive: {
    backgroundColor: "#ffffff",
  },
  bottomNavLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: "#ffffff",
    marginTop: 2,
  },
  bottomNavLabelActive: {
    color: "#17386b",
    fontWeight: "600",
  },
  bottomNavCollapseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    marginTop: -18,
    marginBottom: 4,
  },
  bottomNavExpandBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#17386b",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    shadowColor: "#1f497f",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
});

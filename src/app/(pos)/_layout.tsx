import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
  ScrollView,
  Animated,
  Image,
  PanResponder,
  AppState,
  Modal,
  Alert,
} from "react-native";
import { usePathname, useRouter, Slot } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useIsDarkTheme, useUiStore } from "@/lib/stores/ui-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useDeviceStore } from "@/lib/stores/device-store";
import { PermissionService } from "@/lib/services/permission.service";
import { TransferService } from "@/lib/services/transfer.service";
import { CashierService } from "@/lib/services/cashier.service";
import { DeviceRepository } from "@/lib/repositories/device.repository";
import { SessionIndicator } from "@/components/layout/session-indicator";
import { BottomSheet } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { useSyncStore } from "@/lib/stores/sync-store";
import { useOmsConnectionStore } from "@/lib/stores/oms-connection-store";
import { useAccessSettingsStore } from "@/lib/stores/access-settings-store";
import type { InventoryTransferDTO } from "@/lib/types/inventory";

const WIDE_BREAKPOINT = 768;
const AUTO_LOCK_WARNING_SECONDS = 5;

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
    requiredPermissions: ["POS_PRODUCTS", "POS_INVENTORY"],
  },
  {
    name: "reports",
    label: "Reports",
    icon: "bar-chart-outline" as const,
    activeIcon: "bar-chart" as const,
    href: "/(pos)/reports",
    requiredPermission: "DASHBOARD",
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
    name: "customers",
    label: "Customers",
    icon: "people-outline" as const,
    activeIcon: "people" as const,
    href: "/(pos)/customers",
    requiredPermission: "DASHBOARD",
  },
];

function hasAnyRequiredPermission(item: (typeof navItems)[number], grantedPermissions: string[]) {
  const required = "requiredPermissions" in item && item.requiredPermissions
    ? item.requiredPermissions
    : "requiredPermission" in item && item.requiredPermission
      ? [item.requiredPermission]
      : [];
  return required.some((permission) => grantedPermissions.includes(permission));
}

function normalizePosPath(path: string) {
  const normalized = path.replace(/^\/\(pos\)/, "") || "/";
  return normalized.length > 1 ? normalized.replace(/\/$/, "") : normalized;
}

function isNavItemActive(pathname: string, href: string) {
  const current = normalizePosPath(pathname);
  const target = normalizePosPath(href);
  return target === "/" ? current === "/" : current === target || current.startsWith(`${target}/`);
}

function SidebarClock({ dark }: { dark: boolean }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const day = now.toLocaleDateString("en-US", { weekday: "long" });
  const date = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <View style={[styles.sidebarClock, dark ? styles.sidebarClockDark : styles.sidebarClockLight]}>
      <Text style={[styles.sidebarClockTime, dark ? styles.sidebarClockTimeDark : styles.sidebarClockTimeLight]}>{time}</Text>
      <Text style={[styles.sidebarClockDay, dark ? styles.sidebarClockDayDark : styles.sidebarClockDayLight]}>{day}</Text>
      <Text style={[styles.sidebarClockDate, dark ? styles.sidebarClockDateDark : styles.sidebarClockDateLight]}>{date}</Text>
    </View>
  );
}

function HeaderDateTime({ dark }: { dark: boolean }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const day = now.toLocaleDateString("en-US", { weekday: "short" });
  const date = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <View style={[styles.headerDateTime, dark ? styles.headerDateTimeDark : styles.headerDateTimeLight]}>
      <Ionicons name="time-outline" size={14} color={dark ? "#94a3b8" : "#64748b"} />
      <Text
        style={[styles.headerDateTimeText, dark ? styles.headerDateTimeTextDark : styles.headerDateTimeTextLight]}
        numberOfLines={1}
      >
        {day}, {date} • {time}
      </Text>
    </View>
  );
}

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
        name="bus"
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
  dark,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  transfers: InventoryTransferDTO[];
  dark: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      style={dark ? { backgroundColor: "#11151d" } : undefined}
    >
      <Text style={[styles.dialogTitle, dark && { color: "#f8fafc" }]}>Pending Transfers</Text>
      {transfers.length === 0 ? (
        <Text style={[styles.dialogEmpty, dark && { color: "#94a3b8" }]}>No pending transfers</Text>
      ) : (
        <ScrollView style={styles.dialogScroll} bounces={false}>
          {transfers.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[
                styles.dialogItem,
                dark ? { borderColor: "#28303d", backgroundColor: "#0f1729" } : null,
              ]}
              onPress={() => {
                onClose();
                onSelect(t.id);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.dialogItemContent}>
                <Text style={[styles.dialogItemLabel, dark && { color: "#e2e8f0" }]} numberOfLines={1}>
                  {t.transferNumber}
                </Text>
                <Text style={[styles.dialogItemMeta, dark && { color: "#94a3b8" }]}>
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
            </TouchableOpacity>
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
  isWide,
  sidebarOpen,
  onToggleSidebar,
  onAccountPress,
  onLogoutPress,
}: {
  transferCount: number;
  transfers: InventoryTransferDTO[];
  onTransferPress: () => void;
  dark: boolean;
  isWide: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onAccountPress: () => void;
  onLogoutPress: () => void;
}) {
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [overflowVisible, setOverflowVisible] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const omsStatus = useOmsConnectionStore((state) => state.status);
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const isSyncing = useSyncStore((s) => s.isSyncing);
  const [showUserTag, setShowUserTag] = useState(true);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const showUserTagRef = useRef(showUserTag);
  useEffect(() => {
    showUserTagRef.current = showUserTag;
  }, [showUserTag]);

  useEffect(() => {
    if (isWide) {
      showUserTagRef.current = true;
      setShowUserTag(true);
      slideAnim.setValue(0);
    }
  }, [isWide, slideAnim]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gesture) => gesture.dx > 10 && gesture.dx > Math.abs(gesture.dy),
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dx <= 25) return;
        const nextShowUserTag = !showUserTagRef.current;
        showUserTagRef.current = nextShowUserTag;
        slideAnim.setValue(240);
        setShowUserTag(nextShowUserTag);
        requestAnimationFrame(() => {
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 260,
            useNativeDriver: true,
          }).start();
        });
      },
    })
  ).current;

  const router = useRouter();
  const syncLabel = isSyncing || syncingNow
    ? "Syncing..."
    : omsStatus === "connecting"
      ? "Checking..."
      : omsStatus === "connected"
        ? "Online"
        : "Offline";
  const syncColor =
    omsStatus === "connected" ? "#28a745" : omsStatus === "connecting" ? "#f59e0b" : "#dc3545";
  const handleBadgePress = () => {
    setTransferDialogOpen(true);
    onTransferPress();
  };
  const handleOverflowSyncNow = async () => {
    if (syncingNow || isSyncing) return;
    setSyncingNow(true);
    try {
      await useOmsConnectionStore.getState().checkConnection();
      try {
        const { SyncQueueService } = await import("@/lib/services/sync-queue.service");
        await SyncQueueService.processPending();
      } catch {
        // queue flush is best-effort from the header
      }
      await useSyncStore.getState().refreshPendingCount();
    } finally {
      setSyncingNow(false);
    }
  };
  const handleOverflowAccount = () => {
    setOverflowVisible(false);
    onAccountPress();
  };
  const handleOverflowSettings = () => {
    setOverflowVisible(false);
    router.push("/(pos)/settings" as any);
  };
  const handleOverflowLogout = () => {
    setOverflowVisible(false);
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => onLogoutPress() },
    ]);
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
          {isWide && (
            <TouchableOpacity
              onPress={onToggleSidebar}
              style={[
                styles.burgerBtn,
                dark ? styles.burgerBtnDark : styles.burgerBtnLight,
              ]}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={sidebarOpen ? "close" : "menu"}
                size={22}
                color={dark ? "#e2e8f0" : "#17386b"}
              />
            </TouchableOpacity>
          )}
          <TransferBadge
            count={transferCount}
            onPress={handleBadgePress}
            dark={dark}
          />
        </View>
        <View style={styles.headerBrand} pointerEvents="none">
          <Image
            source={require("../../../assets/nct-seafoods-logo.png")}
            style={styles.headerLogo}
            resizeMode="contain"
            accessibilityLabel="NCT Seafoods"
          />
          <Text
            style={[
              styles.headerTitle,
              dark ? styles.headerTitleDark : styles.headerTitleLight,
            ]}
            numberOfLines={1}
          >
            NCT Seafoods POS System
          </Text>
        </View>
        <View style={styles.headerRight} {...(!isWide ? panResponder.panHandlers : {})}>
          <View style={styles.headerActionsRow}>
            {isWide ? (
              <SessionIndicator
                dark={dark}
                onPress={onAccountPress}
                statusLabel={syncLabel}
                statusColor={syncColor}
                pendingCount={pendingCount}
              />
            ) : (
              <View style={styles.headerSliderClip}>
                <Animated.View style={[styles.headerSliderItem, { transform: [{ translateX: slideAnim }] }]}>
                  {showUserTag ? (
                    <SessionIndicator
                      dark={dark}
                      onPress={onAccountPress}
                      statusLabel={syncLabel}
                      statusColor={syncColor}
                      pendingCount={pendingCount}
                    />
                  ) : (
                    <HeaderDateTime dark={dark} />
                  )}
                </Animated.View>
              </View>
            )}
            <TouchableOpacity
              onPress={() => setOverflowVisible(true)}
              style={styles.overflowBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="More actions"
            >
              <Ionicons
                name="ellipsis-vertical"
                size={20}
                color={dark ? "#e2e8f0" : "#17386b"}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <TransferDialog
        visible={transferDialogOpen}
        onClose={() => setTransferDialogOpen(false)}
        transfers={transfers}
        dark={dark}
        onSelect={(id) => {
          setTransferDialogOpen(false);
          router.push(`/(pos)/transfers?highlight=${id}` as any);
        }}
      />
      <Modal
        visible={overflowVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOverflowVisible(false)}
      >
        <TouchableOpacity
          style={styles.overflowBackdrop}
          activeOpacity={1}
          onPress={() => setOverflowVisible(false)}
          accessibilityLabel="Close menu"
        />
        <View
          style={[
            styles.overflowMenu,
            dark ? styles.overflowMenuDark : styles.overflowMenuLight,
          ]}
        >
          <View style={styles.overflowStatusRow}>
            <View style={[styles.overflowStatusDot, { backgroundColor: syncColor }]} />
            <Text style={[styles.overflowStatusText, dark && { color: "#e2e8f0" }]}>
              {syncLabel}
            </Text>
            {pendingCount > 0 && (
              <View style={styles.overflowPendingBadge}>
                <Text style={styles.overflowPendingText}>{pendingCount > 99 ? "99+" : pendingCount}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={styles.overflowItem}
            onPress={() => void handleOverflowSyncNow()}
            disabled={syncingNow || isSyncing}
            activeOpacity={0.7}
          >
            <Ionicons name="sync-outline" size={18} color={dark ? "#93c5fd" : "#17386b"} />
            <Text style={[styles.overflowItemLabel, dark && { color: "#e2e8f0" }]}>
              {syncingNow || isSyncing ? "Syncing..." : "Sync now"}
            </Text>
            {(syncingNow || isSyncing) && <ActivityIndicator size="small" color={dark ? "#93c5fd" : "#17386b"} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.overflowItem}
            onPress={handleOverflowAccount}
            activeOpacity={0.7}
          >
            <Ionicons name="person-circle-outline" size={18} color={dark ? "#93c5fd" : "#17386b"} />
            <Text style={[styles.overflowItemLabel, dark && { color: "#e2e8f0" }]}>My account</Text>
            <Ionicons name="chevron-forward" size={16} color={dark ? "#64748b" : "#94a3b8"} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.overflowItem}
            onPress={handleOverflowSettings}
            activeOpacity={0.7}
          >
            <Ionicons name="settings-outline" size={18} color={dark ? "#93c5fd" : "#17386b"} />
            <Text style={[styles.overflowItemLabel, dark && { color: "#e2e8f0" }]}>Settings</Text>
            <Ionicons name="chevron-forward" size={16} color={dark ? "#64748b" : "#94a3b8"} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.overflowItem, styles.overflowItemLast]}
            onPress={handleOverflowLogout}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Log out"
          >
            <Ionicons name="log-out-outline" size={18} color="#dc3545" />
            <Text style={[styles.overflowItemLabel, styles.overflowItemLabelDanger]}>Log out</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

function BottomNavigation({
  visibleNavItems,
  pathname,
  onNavigate,
  dark,
}: {
  visibleNavItems: typeof navItems;
  pathname: string;
  onNavigate: (href: string) => void;
  dark: boolean;
}) {
  return (
    <View style={[styles.bottomNav, dark ? styles.bottomNavDark : styles.bottomNavLight]}>
      {visibleNavItems.map((item) => {
        const active = isNavItemActive(pathname, item.href);
        return (
          <TouchableOpacity
            key={item.name}
            style={[styles.bottomNavItem, active && (dark ? styles.bottomNavItemActiveDark : styles.bottomNavItemActiveLight)]}
            onPress={() => onNavigate(item.href)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={active ? item.activeIcon : item.icon}
              size={20}
              color={active ? (dark ? "#60a5fa" : "#17386b") : dark ? "#94a3b8" : "#ffffff"}
            />
            <Text
              style={[
                styles.bottomNavLabel,
                dark ? styles.bottomNavLabelDark : styles.bottomNavLabelLight,
                active && (dark ? styles.bottomNavLabelActiveDark : styles.bottomNavLabelActiveLight),
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function POSLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();

  const cashier = useAuthStore((s) => s.cashier);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const navigationMode = useUiStore((s) => s.navigationMode);
  const uiScale = useUiStore((s) => s.uiScale);
  const uiHydrated = useUiStore((s) => s.hydrated);
  const session = useCashierStore((s) => s.session);
  const cashierHydrated = useCashierStore((s) => s.hydrated);
  const device = useDeviceStore((s) => s.device);
  const deviceHydrated = useDeviceStore((s) => s.hydrated);
  const clearDevice = useDeviceStore((s) => s.clearDevice);
  const autoLockMinutes = useAccessSettingsStore((s) => s.autoLockMinutes);

  const [grantedPermissions, setGrantedPermissions] = useState<string[]>([]);
  const [transferCount, setTransferCount] = useState(0);
  const [transfers, setTransfers] = useState<InventoryTransferDTO[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const sidebarAnim = useRef(new Animated.Value(1)).current;
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleWarningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const backgroundedAt = useRef<number | null>(null);
  const autoLockRunning = useRef(false);
  const [lockCountdown, setLockCountdown] = useState<number | null>(null);

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

  const closeSidebar = () => {
    if (!sidebarOpen) return;
    Animated.spring(sidebarAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
    setSidebarOpen(false);
  };

  const dark = useIsDarkTheme();
  const checkOmsConnection = useOmsConnectionStore((state) => state.checkConnection);

  const handleLogout = async () => {
    if (session?.sessionId) {
      await CashierService.logout(session.sessionId);
    } else {
      useCashierStore.getState().clearSession();
      useAuthStore.getState().signOut();
    }
    router.replace("/(auth)");
  };

  const clearAutoLockTimers = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (idleWarningTimer.current) clearTimeout(idleWarningTimer.current);
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    idleTimer.current = null;
    idleWarningTimer.current = null;
    countdownTimer.current = null;
  }, []);

  const performAutoLock = useCallback(async () => {
    if (autoLockRunning.current || !useCashierStore.getState().session) return;
    autoLockRunning.current = true;
    clearAutoLockTimers();
    setLockCountdown(null);
    const currentSession = useCashierStore.getState().session;
    if (currentSession?.sessionId) await CashierService.logout(currentSession.sessionId);
    else {
      useCashierStore.getState().clearSession();
      useAuthStore.getState().signOut();
    }
    router.replace("/(auth)");
    autoLockRunning.current = false;
  }, [clearAutoLockTimers, router]);

  const showAutoLockWarning = useCallback((deadline: number) => {
    if (countdownTimer.current) clearInterval(countdownTimer.current);

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (remaining <= 0) {
        void performAutoLock();
        return;
      }
      setLockCountdown(remaining);
    };

    updateCountdown();
    countdownTimer.current = setInterval(updateCountdown, 250);
  }, [performAutoLock]);

  const resetIdleTimer = useCallback(() => {
    clearAutoLockTimers();
    setLockCountdown(null);
    if (autoLockMinutes <= 0 || !useCashierStore.getState().session) return;

    const totalIdleMs = autoLockMinutes * 60 * 1000;
    const warningMs = AUTO_LOCK_WARNING_SECONDS * 1000;
    const deadline = Date.now() + totalIdleMs;
    idleTimer.current = setTimeout(() => void performAutoLock(), totalIdleMs);

    const warningDelay = Math.max(0, totalIdleMs - warningMs);
    idleWarningTimer.current = setTimeout(
      () => showAutoLockWarning(deadline),
      warningDelay
    );
  }, [autoLockMinutes, clearAutoLockTimers, performAutoLock, showAutoLockWarning]);

  useEffect(() => {
    resetIdleTimer();
    return () => {
      clearAutoLockTimers();
    };
  }, [clearAutoLockTimers, resetIdleTimer, session?.sessionId]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        if (backgroundedAt.current && autoLockMinutes > 0) {
          const idleMs = Date.now() - backgroundedAt.current;
          if (idleMs >= autoLockMinutes * 60 * 1000) {
            void performAutoLock();
            return;
          }
        }
        backgroundedAt.current = null;
        resetIdleTimer();
      } else {
        backgroundedAt.current = Date.now();
        clearAutoLockTimers();
        setLockCountdown(null);
      }
    });
    return () => subscription.remove();
  }, [autoLockMinutes, clearAutoLockTimers, performAutoLock, resetIdleTimer]);

  // Refresh pending sync count on mount
  useEffect(() => {
    useSyncStore.getState().refreshPendingCount();
    checkOmsConnection();
  }, [checkOmsConnection]);

  const isWide =
    navigationMode === "sidebar" ||
    (navigationMode === "auto" && windowWidth >= WIDE_BREAKPOINT);

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
      hasAnyRequiredPermission(item, grantedPermissions)
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
    if (isNavItemActive(pathname, "/(pos)/transfers")) {
      setTransferCount(0);
    }
  }, [pathname]);

  // Permission gate — redirect if current route is forbidden
  useEffect(() => {
    if (grantedPermissions.length === 0) return;
    const currentItem = navItems.find((item) => {
      return isNavItemActive(pathname, item.href);
    });
    if (currentItem && !hasAnyRequiredPermission(currentItem, grantedPermissions)) {
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
          isWide={false}
          sidebarOpen={true}
          onToggleSidebar={() => {}}
          onAccountPress={() => router.push("/(pos)/user" as any)}
          onLogoutPress={() => {}}
        />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#17386b" />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.viewport, dark ? styles.bgDark : styles.bgLight]}
      onTouchStart={() => {
        if (lockCountdown === null) resetIdleTimer();
      }}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setViewportSize((current) => current.width === width && current.height === height ? current : { width, height });
      }}
    >
      <View
        style={[
          styles.container,
          dark ? styles.bgDark : styles.bgLight,
          viewportSize.width > 0 && viewportSize.height > 0 ? {
            flex: 0,
            width: viewportSize.width / uiScale,
            height: viewportSize.height / uiScale,
            transform: [{ scale: uiScale }],
            transformOrigin: "top left",
          } : null,
        ]}
      >
      <POSHeader
        transferCount={transferCount}
        transfers={transfers}
        onTransferPress={() => {}}
        dark={dark}
        isWide={isWide}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        onAccountPress={() => router.push("/(pos)/user" as any)}
        onLogoutPress={() => void handleLogout()}
      />

      <View style={styles.body}>
        {/* Main content always full width — sidebar overlays on top, does not push content */}
        <View style={styles.main}>
          <Slot />
        </View>

        {isWide && (
          <>
            {/* Backdrop to dismiss sidebar when tapping outside */}
            {sidebarOpen && (
              <TouchableOpacity
                style={styles.sidebarBackdrop}
                activeOpacity={1}
                onPress={closeSidebar}
                accessibilityLabel="Close navigation"
              />
            )}
            <Animated.View
              style={[
                styles.sidebar,
                dark ? styles.sidebarDark : styles.sidebarLight,
                {
                  transform: [{
                    translateX: sidebarAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-220, 0],
                    }),
                  }],
                },
              ]}
              pointerEvents={sidebarOpen ? "auto" : "none"}
            >
              <SidebarClock dark={dark} />
              <View style={styles.sidebarNavItems}>
                {visibleNavItems.map((item) => {
                  const active = isNavItemActive(pathname, item.href);
                  return (
                    <TouchableOpacity
                      key={item.name}
                      style={[
                        styles.sidebarNavItem,
                        active && (dark ? styles.sidebarNavItemActiveDark : styles.sidebarNavItemActiveLight),
                      ]}
                      onPress={() => router.push(item.href as any)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={active ? item.activeIcon : item.icon}
                        size={20}
                        color={active ? (dark ? "#60a5fa" : "#17386b") : dark ? "#94a3b8" : "#8e99a4"}
                      />
                      <Text
                        style={[
                          styles.sidebarNavLabel,
                          dark ? styles.sidebarNavLabelDark : styles.sidebarNavLabelLight,
                          active && (dark ? styles.sidebarNavLabelActiveDark : styles.sidebarNavLabelActiveLight),
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

              <View style={[styles.sidebarFooter, dark ? styles.sidebarFooterDark : styles.sidebarFooterLight]}>
                <TouchableOpacity style={styles.sidebarLogoutBtn} onPress={handleLogout} activeOpacity={0.75}>
                  <Ionicons name="log-out-outline" size={19} color="#dc3545" />
                  <Text style={styles.sidebarLogoutText}>Log out</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </>
        )}
      </View>

      {!isWide && (
        <BottomNavigation
          visibleNavItems={visibleNavItems}
          pathname={pathname}
          onNavigate={(href) => {
            router.push(href as any);
          }}
          dark={dark}
        />
      )}
      </View>

      <Modal
        visible={lockCountdown !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {}}
      >
        <View style={styles.autoLockOverlay}>
          <View style={[styles.autoLockCard, dark ? styles.autoLockCardDark : styles.autoLockCardLight]}>
            <View style={[styles.autoLockIcon, dark ? styles.autoLockIconDark : styles.autoLockIconLight]}>
              <Ionicons name="lock-closed" size={27} color={dark ? "#93c5fd" : "#17386b"} />
            </View>
            <Text style={[styles.autoLockTitle, dark ? styles.autoLockTextDark : styles.autoLockTextLight]}>
              Locking soon
            </Text>
            <Text style={[styles.autoLockMessage, dark ? styles.autoLockMessageDark : styles.autoLockMessageLight]}>
              NCT POS will lock in
            </Text>
            <Text style={[styles.autoLockCountdown, dark ? styles.autoLockTextDark : styles.autoLockTextLight]}>
              {lockCountdown ?? AUTO_LOCK_WARNING_SECONDS}
            </Text>
            <Text style={[styles.autoLockSeconds, dark ? styles.autoLockMessageDark : styles.autoLockMessageLight]}>
              seconds
            </Text>
            <TouchableOpacity
              style={styles.autoLockConfirm}
              activeOpacity={0.8}
              onPress={resetIdleTimer}
              accessibilityRole="button"
              accessibilityLabel="Stay signed in"
            >
              <Ionicons name="checkmark-circle-outline" size={20} color="#ffffff" />
              <Text style={styles.autoLockConfirmText}>Stay Signed In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    overflow: "hidden",
  },
  container: {
    flex: 1,
  },
  bgLight: {
    backgroundColor: "#f8fbff",
  },
  bgDark: {
    backgroundColor: "#050a14",
  },
  autoLockOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(2, 6, 23, 0.72)",
  },
  autoLockCard: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    paddingHorizontal: 28,
    paddingVertical: 28,
    borderRadius: 8,
    borderWidth: 1,
  },
  autoLockCardLight: {
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ee",
  },
  autoLockCardDark: {
    backgroundColor: "#111827",
    borderColor: "#334155",
  },
  autoLockIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  autoLockIconLight: {
    backgroundColor: "#eaf1ff",
  },
  autoLockIconDark: {
    backgroundColor: "#1e3a5f",
  },
  autoLockTitle: {
    fontSize: 22,
    fontWeight: "800",
  },
  autoLockMessage: {
    marginTop: 8,
    fontSize: 14,
  },
  autoLockCountdown: {
    marginTop: 5,
    fontSize: 48,
    fontWeight: "800",
  },
  autoLockSeconds: {
    marginTop: -5,
    fontSize: 13,
  },
  autoLockTextLight: {
    color: "#172033",
  },
  autoLockTextDark: {
    color: "#f8fafc",
  },
  autoLockMessageLight: {
    color: "#64748b",
  },
  autoLockMessageDark: {
    color: "#aeb9c8",
  },
  autoLockConfirm: {
    width: "100%",
    minHeight: 48,
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 7,
    backgroundColor: "#17386b",
  },
  autoLockConfirmText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 6,
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
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 100,
  },
  burgerBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  burgerBtnLight: {
    backgroundColor: "#f0f4ff",
    borderColor: "#e0e7ff",
  },
  burgerBtnDark: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.12)",
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 0,
    flexShrink: 1,
  },
  headerBrand: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 48,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    flexShrink: 1,
    paddingHorizontal: 12,
  },
  headerLogo: {
    width: 46,
    height: 46,
    flexShrink: 0,
  },
  headerTitleLight: {
    color: "#4169E1",
  },
  headerTitleDark: {
    color: "#ffffff",
  },
  headerRight: {
    width: 286,
    height: 36,
    marginLeft: "auto",
    justifyContent: "center",
    alignItems: "flex-end",
  },
  headerActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  overflowBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    flexShrink: 0,
  },
  overflowBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(2, 6, 23, 0.35)",
  },
  overflowMenu: {
    position: "absolute",
    top: 104,
    right: 12,
    minWidth: 248,
    maxWidth: 300,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  overflowMenuLight: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
  },
  overflowMenuDark: {
    backgroundColor: "#11151d",
    borderColor: "#28303d",
  },
  overflowStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148, 163, 184, 0.25)",
    marginBottom: 4,
  },
  overflowStatusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  overflowStatusText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#1a202c",
  },
  overflowPendingBadge: {
    backgroundColor: "#f59e0b",
    borderRadius: 10,
    minWidth: 22,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  overflowPendingText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },
  overflowItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  overflowItemLast: {
    marginBottom: 2,
  },
  overflowItemLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#1a202c",
  },
  overflowItemLabelDanger: {
    color: "#dc3545",
  },
  headerSliderClip: {
    width: 240,
    height: 34,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "flex-end",
  },
  headerSliderItem: {
    width: 240,
    height: 34,
    justifyContent: "center",
    alignItems: "flex-end",
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

  // Sidebar — overlays on top of main, does not push content
  sidebarBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.25)",
    zIndex: 49,
    elevation: 11,
  },
  sidebar: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 50,
    width: 220,
    paddingTop: 20,
    paddingBottom: 16,
    borderRightWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 12,
  },
  sidebarLight: {
    backgroundColor: "#ffffff",
    borderRightColor: "#dde3ea",
  },
  sidebarDark: {
    backgroundColor: "#11151d",
    borderRightColor: "#28303d",
  },
  sidebarNavItems: {
    flex: 1,
    paddingTop: 18,
  },
  sidebarNavItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginHorizontal: 12,
    borderRadius: 8,
  },
  sidebarNavItemActiveLight: {
    backgroundColor: "#f0f4ff",
  },
  sidebarNavItemActiveDark: {
    backgroundColor: "#202733",
  },
  sidebarNavLabel: {
    fontSize: 14,
    marginLeft: 12,
    fontWeight: "500",
    flex: 1,
  },
  sidebarNavLabelLight: {
    color: "#8e99a4",
  },
  sidebarNavLabelDark: {
    color: "#94a3b8",
  },
  sidebarNavLabelActiveLight: {
    color: "#17386b",
    fontWeight: "600",
  },
  sidebarNavLabelActiveDark: {
    color: "#60a5fa",
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
  },
  sidebarFooterLight: {
    borderTopColor: "#e8edf3",
  },
  sidebarFooterDark: {
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  sidebarLogoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "rgba(220,53,69,0.10)",
  },
  sidebarLogoutText: {
    color: "#dc3545",
    fontSize: 13,
    fontWeight: "700",
  },
  sidebarClock: {
    marginHorizontal: 12,
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  sidebarClockLight: {
    backgroundColor: "#f0f4ff",
    borderColor: "#e0e7ff",
  },
  sidebarClockDark: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.10)",
  },
  sidebarClockTime: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  sidebarClockTimeLight: {
    color: "#17386b",
  },
  sidebarClockTimeDark: {
    color: "#f8fafc",
  },
  sidebarClockDay: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  sidebarClockDayLight: {
    color: "#1e3a5f",
  },
  sidebarClockDayDark: {
    color: "#cbd5e1",
  },
  sidebarClockDate: {
    fontSize: 10,
    marginTop: 1,
  },
  sidebarClockDateLight: {
    color: "#6b7b8d",
  },
  sidebarClockDateDark: {
    color: "#94a3b8",
  },
  headerDateTime: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
  },
  headerDateTimeLight: {
    backgroundColor: "#f0f4ff",
    borderColor: "#e0e7ff",
  },
  headerDateTimeDark: {
    backgroundColor: "#1e293b",
    borderColor: "rgba(255,255,255,0.12)",
  },
  headerDateTimeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  headerDateTimeTextLight: {
    color: "#17386b",
  },
  headerDateTimeTextDark: {
    color: "#e2e8f0",
  },
  headerDateTimeTouchable: {
    borderRadius: 20,
  },

  // Bottom navigation — fixed at exact bottom, full-width flat bar, not floating
  bottomNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 4,
    paddingVertical: 6,
    paddingBottom: 10,
    borderTopWidth: 1,
  },
  bottomNavLight: {
    backgroundColor: "#17386b",
    borderTopColor: "#1a3a6b",
  },
  bottomNavDark: {
    backgroundColor: "#0f1729",
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  bottomNavItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    minWidth: 52,
    flex: 1,
  },
  bottomNavItemActiveLight: {
    backgroundColor: "#ffffff",
  },
  bottomNavItemActiveDark: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  bottomNavLabel: {
    fontSize: 10,
    fontWeight: "500",
    marginTop: 2,
  },
  bottomNavLabelLight: {
    color: "#ffffff",
  },
  bottomNavLabelDark: {
    color: "#94a3b8",
  },
  bottomNavLabelActiveLight: {
    color: "#17386b",
    fontWeight: "600",
  },
  bottomNavLabelActiveDark: {
    color: "#60a5fa",
    fontWeight: "600",
  },
});

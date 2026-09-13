import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUiStore } from "@/lib/stores/ui-store";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { PermissionService } from "@/lib/services/permission.service";
import { SessionIndicator } from "@/components/layout/session-indicator";

type NavItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  href: string;
  requiredPermission: string;
};

const navItems: NavItem[] = [
  { label: "Home", icon: "home-outline", activeIcon: "home", href: "/(pos)", requiredPermission: "DASHBOARD" },
  { label: "Sales", icon: "cart-outline", activeIcon: "cart", href: "/(pos)/sales", requiredPermission: "POS_SALES" },
  { label: "Receipts", icon: "receipt-outline", activeIcon: "receipt", href: "/(pos)/receipts", requiredPermission: "POS_RECEIPTS" },
  { label: "Products", icon: "cube-outline", activeIcon: "cube", href: "/(pos)/products", requiredPermission: "POS_PRODUCTS" },
  { label: "Stock", icon: "archive-outline", activeIcon: "archive", href: "/(pos)/stock", requiredPermission: "POS_INVENTORY" },
  { label: "Transfers", icon: "swap-horizontal-outline", activeIcon: "swap-horizontal", href: "/(pos)/transfers", requiredPermission: "POS_TRANSFERS" },
  { label: "Settings", icon: "settings-outline", activeIcon: "settings", href: "/(pos)/settings", requiredPermission: "POS_SETTINGS" },
];

interface SidebarProps {
  currentPath: string;
  transferCount?: number;
}

export function Sidebar({ currentPath, transferCount = 0 }: SidebarProps) {
  const router = useRouter();
  const themeMode = useUiStore((s) => s.themeMode);
  const session = useCashierStore((s) => s.session);
  const [grantedPermissions, setGrantedPermissions] = useState<string[]>([]);

  const dark = themeMode === "dark";

  useEffect(() => {
    if (!session?.roleId) return;
    PermissionService.getRolePermissions(session.roleId)
      .then(setGrantedPermissions)
      .catch(() => {});
  }, [session?.roleId]);

  const visibleItems = navItems.filter(
    (item) =>
      grantedPermissions.length === 0 ||
      grantedPermissions.includes(item.requiredPermission)
  );

  return (
    <View style={[styles.sidebar, dark ? styles.sidebarDark : styles.sidebarLight]}>
      <View style={styles.logoSection}>
        <View style={styles.logoIcon}>
          <Ionicons name="fish" size={22} color="#17386b" />
        </View>
        <Text style={styles.logoText}>NCT POS</Text>
      </View>

      <View style={styles.navItems}>
        {visibleItems.map((item) => {
          const isActive = currentPath === item.href ||
            (item.href === "/(pos)" && currentPath === "/(pos)/index");
          return (
            <TouchableOpacity
              key={item.label}
              style={[styles.navItem, isActive && styles.navItemActive]}
              onPress={() => router.push(item.href as any)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isActive ? item.activeIcon : item.icon}
                size={20}
                color={isActive ? "#17386b" : "#8e99a4"}
              />
              <Text
                style={[styles.navLabel, isActive && styles.navLabelActive]}
              >
                {item.label}
              </Text>
              {item.label === "Transfers" && transferCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {transferCount > 9 ? "9+" : transferCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.footer}>
        <SessionIndicator />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  logoSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#f0f4ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  logoText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#17386b",
  },
  navItems: {
    flex: 1,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginHorizontal: 12,
    borderRadius: 8,
  },
  navItemActive: {
    backgroundColor: "#f0f4ff",
  },
  navLabel: {
    fontSize: 14,
    color: "#8e99a4",
    marginLeft: 12,
    fontWeight: "500",
    flex: 1,
  },
  navLabelActive: {
    color: "#17386b",
    fontWeight: "600",
  },
  badge: {
    backgroundColor: "#ef4444",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e8edf3",
  },
});

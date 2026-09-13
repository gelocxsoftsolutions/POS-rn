import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SessionIndicator } from "@/components/layout/session-indicator";

const { width } = Dimensions.get("window");
const SIDEBAR_WIDTH = 240;

type NavItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
};

const navItems: NavItem[] = [
  { label: "Home", icon: "home-outline", href: "/(pos)" },
  { label: "Sales", icon: "cart-outline", href: "/(pos)/sales" },
  { label: "Receipts", icon: "receipt-outline", href: "/(pos)/receipts" },
  { label: "Products", icon: "cube-outline", href: "/(pos)/products" },
  { label: "Stock", icon: "archive-outline", href: "/(pos)/stock" },
  { label: "Transfers", icon: "swap-horizontal-outline", href: "/(pos)/transfers" },
  { label: "Settings", icon: "settings-outline", href: "/(pos)/settings" },
];

interface SidebarProps {
  currentPath: string;
}

export function Sidebar({ currentPath }: SidebarProps) {
  const router = useRouter();

  return (
    <View style={styles.sidebar}>
      <View style={styles.logoSection}>
        <View style={styles.logoIcon}>
          <Ionicons name="fish" size={24} color="#17386b" />
        </View>
        <Text style={styles.logoText}>NCT POS</Text>
      </View>

      <View style={styles.navItems}>
        {navItems.map((item) => {
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
                name={item.icon as any}
                size={20}
                color={isActive ? "#17386b" : "#8e99a4"}
              />
              <Text
                style={[styles.navLabel, isActive && styles.navLabelActive]}
              >
                {item.label}
              </Text>
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
    width: SIDEBAR_WIDTH,
    backgroundColor: "#ffffff",
    borderRightWidth: 1,
    borderRightColor: "#e8edf3",
    paddingTop: 20,
    paddingBottom: 16,
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
  },
  navLabelActive: {
    color: "#17386b",
    fontWeight: "600",
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e8edf3",
  },
});

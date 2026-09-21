import React from "react";
import { TouchableOpacity, Text, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCashierStore } from "@/lib/stores/cashier-store";

type Props = {
  dark?: boolean;
  onPress?: () => void;
  statusLabel?: string;
  statusColor?: string;
  pendingCount?: number;
};

export function SessionIndicator({ dark = false, onPress, statusLabel, statusColor, pendingCount = 0 }: Props) {
  const session = useCashierStore((s) => s.session);

  if (!session) return null;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        dark ? styles.containerDark : styles.containerLight,
      ]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <View style={[styles.avatar, dark ? styles.avatarDark : styles.avatarLight]}>
        <Ionicons name="person" size={14} color="#ffffff" />
      </View>
      <View style={styles.info}>
        <Text
          style={[styles.name, dark ? styles.nameDark : styles.nameLight]}
          numberOfLines={1}
        >
          {session.cashierName}
        </Text>
        {statusLabel ? (
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.role, dark ? styles.roleDark : styles.roleLight]}>{statusLabel}</Text>
            {pendingCount > 0 && <Text style={styles.pendingText}>{pendingCount}</Text>}
          </View>
        ) : (
          <Text style={[styles.role, dark ? styles.roleDark : styles.roleLight]}>
            {session.cashierRole}
          </Text>
        )}
      </View>
      {onPress && <Ionicons name="chevron-forward" size={14} color={dark ? "#94a3b8" : "#64748b"} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    height: 34,
  },
  containerLight: {
    backgroundColor: "#f0f4ff",
    borderColor: "#e0e7ff",
  },
  containerDark: {
    backgroundColor: "#1e293b",
    borderColor: "rgba(255,255,255,0.12)",
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  avatarLight: {
    backgroundColor: "#17386b",
  },
  avatarDark: {
    backgroundColor: "#3b82f6",
  },
  info: {
    marginRight: 2,
  },
  name: {
    fontSize: 12,
    fontWeight: "600",
    maxWidth: 80,
  },
  nameLight: {
    color: "#17386b",
  },
  nameDark: {
    color: "#e2e8f0",
  },
  role: {
    fontSize: 10,
  },
  roleLight: {
    color: "#6b7b8d",
  },
  roleDark: {
    color: "#94a3b8",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pendingText: {
    color: "#f59e0b",
    fontSize: 9,
    fontWeight: "700",
  },
});

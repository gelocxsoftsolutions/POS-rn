import React from "react";
import { TouchableOpacity, Text, StyleSheet, View, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { usePosTheme } from "@/lib/stores/ui-store";

type Props = {
  dark?: boolean;
  onPress?: () => void;
  statusLabel?: string;
  statusColor?: string;
  pendingCount?: number;
};

export function SessionIndicator({ dark: _dark = false, onPress, statusLabel, statusColor, pendingCount = 0 }: Props) {
  const session = useCashierStore((s) => s.session);
  const theme = usePosTheme();

  if (!session) return null;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
      ]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
        {session.photoUri ? (
          <Image source={{ uri: session.photoUri }} style={styles.avatarImage} />
        ) : (
          <Ionicons name="person" size={14} color={theme.onPrimary} />
        )}
      </View>
      <View style={styles.info}>
        <Text
          style={[styles.name, { color: theme.text }]}
          numberOfLines={1}
        >
          {session.cashierName}
        </Text>
        {statusLabel ? (
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.role, { color: theme.muted }]}>{statusLabel}</Text>
            {pendingCount > 0 && <Text style={styles.pendingText}>{pendingCount}</Text>}
          </View>
        ) : (
          <Text style={[styles.role, { color: theme.muted }]}>
            {session.cashierRole}
          </Text>
        )}
      </View>
      {onPress && <Ionicons name="chevron-forward" size={14} color={theme.muted} />}
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
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
  },
  info: {
    marginRight: 2,
  },
  name: {
    fontSize: 12,
    fontWeight: "600",
    maxWidth: 80,
  },
  role: {
    fontSize: 10,
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

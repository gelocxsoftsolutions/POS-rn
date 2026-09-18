import React from "react";
import { TouchableOpacity, Text, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCashierStore } from "@/lib/stores/cashier-store";

type Props = {
  dark?: boolean;
};

export function SessionIndicator({ dark = false }: Props) {
  const session = useCashierStore((s) => s.session);

  if (!session) return null;

  return (
    <View
      style={[
        styles.container,
        dark ? styles.containerDark : styles.containerLight,
      ]}
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
        <Text style={[styles.role, dark ? styles.roleDark : styles.roleLight]}>
          {session.cashierRole}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
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
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
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
});

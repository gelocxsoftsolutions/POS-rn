import React from "react";
import { TouchableOpacity, Text, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCashierStore } from "@/lib/stores/cashier-store";

export function SessionIndicator() {
  const session = useCashierStore((s) => s.session);
  const lock = useCashierStore((s) => s.lock);

  if (!session) return null;

  return (
    <TouchableOpacity onPress={lock} style={styles.container} activeOpacity={0.7}>
      <View style={styles.avatar}>
        <Ionicons name="person" size={14} color="#ffffff" />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {session.cashierName}
        </Text>
        <Text style={styles.role}>{session.cashierRole}</Text>
      </View>
      <Ionicons name="lock-closed-outline" size={14} color="#8e99a4" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0f4ff",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#17386b",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  info: {
    marginRight: 8,
  },
  name: {
    fontSize: 12,
    fontWeight: "600",
    color: "#17386b",
    maxWidth: 80,
  },
  role: {
    fontSize: 10,
    color: "#6b7b8d",
  },
});

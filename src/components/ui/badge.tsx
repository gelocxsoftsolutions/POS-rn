import React from "react";
import { View, Text, StyleSheet, type ViewStyle } from "react-native";
import { usePosTheme } from "@/lib/stores/ui-store";

interface BadgeProps {
  label: string;
  color?: string;
  textColor?: string;
  size?: "sm" | "md";
  style?: ViewStyle;
}

export function Badge({
  label,
  color,
  textColor,
  size = "sm",
  style,
}: BadgeProps) {
  const theme = usePosTheme();
  const isSmall = size === "sm";
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: color ?? theme.primary },
        isSmall ? styles.sm : styles.md,
        style,
      ]}
    >
      <Text style={[styles.text, { color: textColor ?? theme.onPrimary }, isSmall ? styles.textSm : styles.textMd]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  sm: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  md: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  text: {
    fontWeight: "600",
  },
  textSm: {
    fontSize: 10,
  },
  textMd: {
    fontSize: 12,
  },
});

import React from "react";
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePosTheme } from "@/lib/stores/ui-store";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  icon,
  style,
}: ButtonProps) {
  const theme = usePosTheme();
  const variants: Record<ButtonVariant, { container: ViewStyle; text: TextStyle }> = {
    primary: { container: { backgroundColor: theme.primary }, text: { color: theme.onPrimary } },
    secondary: { container: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: theme.primary }, text: { color: theme.primary } },
    danger: { container: { backgroundColor: "#dc3545" }, text: { color: "#ffffff" } },
    ghost: { container: { backgroundColor: "transparent" }, text: { color: theme.accent } },
  };
  const v = variants[variant];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      style={[
        styles.container,
        v.container,
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text.color} size="small" />
      ) : (
        <>
          {icon && (
            <Ionicons
              name={icon}
              size={18}
              color={v.text.color}
              style={styles.icon}
            />
          )}
          <Text style={[styles.text, v.text]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    minHeight: 48,
  },
  text: {
    fontSize: 14,
    fontWeight: "600",
  },
  icon: {
    marginRight: 8,
  },
  disabled: {
    opacity: 0.5,
  },
});

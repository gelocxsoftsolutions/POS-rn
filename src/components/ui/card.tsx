import React from "react";
import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { usePosTheme } from "@/lib/stores/ui-store";

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
}

export function Card({ children, style, padding = 16 }: CardProps) {
  const theme = usePosTheme();
  return (
    <View style={[styles.card, { padding, backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.navigation }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
});

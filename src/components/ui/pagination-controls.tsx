import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePosTheme } from "@/lib/stores/ui-store";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100];

type Props = {
  page: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  dark: boolean;
};

export function PaginationControls({
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
  dark: _dark,
}: Props) {
  const theme = usePosTheme();
  const safeTotalPages = Math.max(1, totalPages);

  return (
    <View style={[styles.container, { borderTopColor: theme.border }]}>
      <View style={styles.sizeGroup}>
        <Text style={[styles.label, { color: theme.muted }]}>Items per page</Text>
        <View style={styles.options}>
          {PAGE_SIZE_OPTIONS.map((option) => {
            const selected = option === pageSize;
            return (
              <TouchableOpacity
                key={option}
                style={[
                  styles.sizeButton,
                  {
                    backgroundColor: selected ? theme.primary : theme.surface,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}
                onPress={() => onPageSizeChange(option)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.sizeText, { color: selected ? theme.onPrimary : theme.text }]}>
                  {option}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.pageGroup}>
        <TouchableOpacity
          style={[
            styles.pageButton,
            { backgroundColor: theme.surface, borderColor: theme.border },
            page === 1 && styles.disabled,
          ]}
          onPress={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          accessibilityLabel="Previous page"
        >
          <Ionicons name="chevron-back" size={15} color={theme.accent} />
        </TouchableOpacity>
        <Text style={[styles.pageText, { color: theme.muted }]}>Page {page} of {safeTotalPages}</Text>
        <TouchableOpacity
          style={[
            styles.pageButton,
            { backgroundColor: theme.surface, borderColor: theme.border },
            page === safeTotalPages && styles.disabled,
          ]}
          onPress={() => onPageChange(Math.min(safeTotalPages, page + 1))}
          disabled={page === safeTotalPages}
          accessibilityLabel="Next page"
        >
          <Ionicons name="chevron-forward" size={15} color={theme.accent} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
  },
  sizeGroup: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  label: { fontSize: 10, fontWeight: "600" },
  options: { flexDirection: "row", alignItems: "center", gap: 4 },
  sizeButton: {
    minWidth: 30,
    height: 26,
    paddingHorizontal: 5,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sizeText: { fontSize: 10, fontWeight: "700", lineHeight: 14 },
  pageGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  pageButton: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.35 },
  pageText: { minWidth: 76, textAlign: "center", fontSize: 11, fontWeight: "600" },
});

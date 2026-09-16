import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SaleService } from "@/lib/services/sale.service";
import { useUiStore } from "@/lib/stores/ui-store";
import type { SaleDTO } from "@/lib/types/sales";

export default function ReceiptsScreen() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SaleDTO | null>(null);
  const [receipts, setReceipts] = useState<SaleDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const dark = useUiStore((s) => s.themeMode) === "dark";

  const loadReceipts = useCallback(async () => {
    try {
      const result = await SaleService.list({ page: 1, pageSize: 50 });
      setReceipts(result.items);
    } catch {
      // keep empty
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadReceipts();
      setLoading(false);
    })();
  }, [loadReceipts]);

  const filtered = receipts.filter(
    (r) =>
      r.receiptNumber.toLowerCase().includes(search.toLowerCase()) ||
      (r.paymentMethod ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const methodColor = (method: string) => {
    switch (method) {
      case "CASH": return "#28a745";
      case "CARD": return "#6f42c1";
      case "DIGITAL": return "#17a2b8";
      default: return "#6b7b8d";
    }
  };

  const renderReceipt = ({ item }: { item: SaleDTO }) => (
    <TouchableOpacity onPress={() => setSelected(item)} activeOpacity={0.7}>
      <Card style={[styles.receiptCard, { backgroundColor: dark ? "#101928" : "#ffffff" }]}>
        <View style={styles.receiptRow}>
          <View style={styles.receiptInfo}>
            <Text style={[styles.receiptNumber, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{item.receiptNumber}</Text>
            <Text style={[styles.receiptDate, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>{formatDate(item.createdAt)}</Text>
            <Text style={styles.receiptItems}>{item.itemCount} items</Text>
          </View>
          <View style={styles.receiptRight}>
            <Text style={styles.receiptTotal}>₱{item.total.toFixed(2)}</Text>
            <Badge label={item.paymentMethod} color={methodColor(item.paymentMethod)} size="sm" />
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#17386b" />
      </View>
    );
  }

  if (selected) {
    return (
      <View style={[styles.container, { backgroundColor: dark ? "#050a14" : "#f8fbff" }]}>
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={() => setSelected(null)} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#17386b" />
          </TouchableOpacity>
          <Text style={[styles.detailTitle, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{selected.receiptNumber}</Text>
          <View style={{ width: 40 }} />
        </View>
        <Card style={[styles.detailCard, { backgroundColor: dark ? "#101928" : "#ffffff" }]}>
          <Text style={styles.detailStore}>NCT Seafoods</Text>
          <Text style={[styles.detailDate, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>{formatDate(selected.createdAt)}</Text>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Receipt #</Text>
            <Text style={[styles.detailValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{selected.receiptNumber}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Cashier</Text>
            <Text style={[styles.detailValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{selected.cashierName}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Items</Text>
            <Text style={[styles.detailValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{selected.itemCount}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Payment</Text>
            <Badge label={selected.paymentMethod} color={methodColor(selected.paymentMethod)} />
          </View>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Text style={[styles.totalLabel, { color: dark ? "#e2e8f0" : "#1a202c" }]}>Total</Text>
            <Text style={styles.totalValue}>₱{selected.total.toFixed(2)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Paid</Text>
            <Text style={[styles.detailValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>₱{selected.paidAmount.toFixed(2)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Change</Text>
            <Text style={[styles.detailValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>₱{selected.changeAmount.toFixed(2)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Status</Text>
            <Badge label={selected.status} color="#28a745" />
          </View>
        </Card>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: dark ? "#050a14" : "#f8fbff" }]}>
      <View style={[styles.searchBar, { backgroundColor: dark ? "#101928" : "#ffffff", borderColor: dark ? "#1e2a3a" : "#e2e8f0" }]}>
        <Ionicons name="search" size={18} color="#8e99a4" />
        <TextInput
          style={[styles.searchInput, { color: dark ? "#e2e8f0" : "#1a202c" }]}
          placeholder="Search receipts..."
          placeholderTextColor={dark ? "#6b7b8d" : "#b0b8c1"}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color="#8e99a4" />
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={filtered}
        renderItem={renderReceipt}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={48} color="#d1d9e6" />
            <Text style={styles.emptyText}>No receipts found</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fbff",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 14,
    color: "#6b7b8d",
    marginTop: 8,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    margin: 16,
    marginBottom: 8,
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: 14,
    color: "#1a202c",
  },
  list: {
    padding: 16,
    paddingTop: 8,
  },
  receiptCard: {
    padding: 16,
    marginBottom: 10,
  },
  receiptRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  receiptInfo: {
    flex: 1,
  },
  receiptNumber: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a202c",
  },
  receiptDate: {
    fontSize: 12,
    color: "#6b7b8d",
    marginTop: 2,
  },
  receiptItems: {
    fontSize: 11,
    color: "#8e99a4",
    marginTop: 2,
  },
  receiptRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  receiptTotal: {
    fontSize: 16,
    fontWeight: "700",
    color: "#17386b",
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f0f4ff",
    alignItems: "center",
    justifyContent: "center",
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a202c",
  },
  detailCard: {
    margin: 16,
    padding: 24,
  },
  detailStore: {
    fontSize: 20,
    fontWeight: "700",
    color: "#17386b",
    textAlign: "center",
  },
  detailDate: {
    fontSize: 12,
    color: "#6b7b8d",
    textAlign: "center",
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "#e8edf3",
    marginVertical: 16,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 13,
    color: "#6b7b8d",
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a202c",
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a202c",
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#17386b",
  },
});

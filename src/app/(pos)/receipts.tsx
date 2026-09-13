import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ReceiptRecord {
  id: string;
  receiptNumber: string;
  date: string;
  total: number;
  paymentMethod: string;
  items: number;
  status: string;
}

const DEMO_RECEIPTS: ReceiptRecord[] = [
  { id: "1", receiptNumber: "RCP-00000047", date: "2026-09-13T10:30:00", total: 1344, paymentMethod: "CASH", items: 3, status: "COMPLETED" },
  { id: "2", receiptNumber: "RCP-00000046", date: "2026-09-13T09:45:00", total: 680, paymentMethod: "CARD", items: 1, status: "COMPLETED" },
  { id: "3", receiptNumber: "RCP-00000045", date: "2026-09-12T16:20:00", total: 2150, paymentMethod: "CASH", items: 5, status: "COMPLETED" },
  { id: "4", receiptNumber: "RCP-00000044", date: "2026-09-12T14:10:00", total: 450, paymentMethod: "DIGITAL", items: 2, status: "COMPLETED" },
  { id: "5", receiptNumber: "RCP-00000043", date: "2026-09-11T11:00:00", total: 890, paymentMethod: "CASH", items: 4, status: "COMPLETED" },
];

export default function ReceiptsScreen() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ReceiptRecord | null>(null);

  const filtered = DEMO_RECEIPTS.filter(
    (r) =>
      r.receiptNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.paymentMethod.toLowerCase().includes(search.toLowerCase())
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

  const renderReceipt = ({ item }: { item: ReceiptRecord }) => (
    <TouchableOpacity onPress={() => setSelected(item)} activeOpacity={0.7}>
      <Card style={styles.receiptCard}>
        <View style={styles.receiptRow}>
          <View style={styles.receiptInfo}>
            <Text style={styles.receiptNumber}>{item.receiptNumber}</Text>
            <Text style={styles.receiptDate}>{formatDate(item.date)}</Text>
            <Text style={styles.receiptItems}>{item.items} items</Text>
          </View>
          <View style={styles.receiptRight}>
            <Text style={styles.receiptTotal}>₱{item.total.toFixed(2)}</Text>
            <Badge label={item.paymentMethod} color={methodColor(item.paymentMethod)} size="sm" />
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );

  if (selected) {
    return (
      <View style={styles.container}>
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={() => setSelected(null)} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#17386b" />
          </TouchableOpacity>
          <Text style={styles.detailTitle}>{selected.receiptNumber}</Text>
          <View style={{ width: 40 }} />
        </View>
        <Card style={styles.detailCard}>
          <Text style={styles.detailStore}>NCT Seafoods</Text>
          <Text style={styles.detailDate}>{formatDate(selected.date)}</Text>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Receipt #</Text>
            <Text style={styles.detailValue}>{selected.receiptNumber}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Items</Text>
            <Text style={styles.detailValue}>{selected.items}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Payment</Text>
            <Badge label={selected.paymentMethod} color={methodColor(selected.paymentMethod)} />
          </View>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>₱{selected.total.toFixed(2)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Status</Text>
            <Badge label={selected.status} color="#28a745" />
          </View>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#8e99a4" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search receipts..."
          placeholderTextColor="#b0b8c1"
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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fbff",
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

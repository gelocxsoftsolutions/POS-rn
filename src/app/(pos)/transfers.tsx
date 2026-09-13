import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Transfer {
  id: string;
  transferNumber: string;
  source: string;
  destination: string;
  status: string;
  date: string;
  items: number;
}

const DEMO_TRANSFERS: Transfer[] = [
  { id: "1", transferNumber: "TRF-00012", source: "Main Warehouse", destination: "POS Terminal 1", status: "RECEIVED", date: "2026-09-13", items: 5 },
  { id: "2", transferNumber: "TRF-00011", source: "Main Warehouse", destination: "POS Terminal 2", status: "IN_TRANSIT", date: "2026-09-12", items: 3 },
  { id: "3", transferNumber: "TRF-00010", source: "Cold Storage", destination: "POS Terminal 1", status: "APPROVED", date: "2026-09-12", items: 8 },
  { id: "4", transferNumber: "TRF-00009", source: "Main Warehouse", destination: "POS Terminal 1", status: "DRAFT", date: "2026-09-11", items: 2 },
  { id: "5", transferNumber: "TRF-00008", source: "Cold Storage", destination: "POS Terminal 3", status: "RECEIVED", date: "2026-09-10", items: 6 },
];

const STATUS_FILTERS = ["All", "DRAFT", "APPROVED", "IN_TRANSIT", "RECEIVED"];

export default function TransfersScreen() {
  const [filter, setFilter] = useState("All");

  const filtered = filter === "All"
    ? DEMO_TRANSFERS
    : DEMO_TRANSFERS.filter((t) => t.status === filter);

  const statusColor = (status: string) => {
    switch (status) {
      case "DRAFT": return "#6b7b8d";
      case "APPROVED": return "#17a2b8";
      case "IN_TRANSIT": return "#ffc107";
      case "RECEIVED": return "#28a745";
      default: return "#6b7b8d";
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "DRAFT": return "Draft";
      case "APPROVED": return "Approved";
      case "IN_TRANSIT": return "In Transit";
      case "RECEIVED": return "Received";
      default: return status;
    }
  };

  const renderTransfer = ({ item }: { item: Transfer }) => (
    <Card style={styles.transferCard}>
      <View style={styles.transferHeader}>
        <View style={styles.transferInfo}>
          <Text style={styles.transferNumber}>{item.transferNumber}</Text>
          <Text style={styles.transferDate}>{item.date}</Text>
        </View>
        <Badge label={statusLabel(item.status)} color={statusColor(item.status)} />
      </View>
      <View style={styles.transferRoute}>
        <View style={styles.routeItem}>
          <Ionicons name="location-outline" size={14} color="#6b7b8d" />
          <Text style={styles.routeText} numberOfLines={1}>{item.source}</Text>
        </View>
        <Ionicons name="arrow-forward" size={14} color="#8e99a4" />
        <View style={styles.routeItem}>
          <Ionicons name="location" size={14} color="#17386b" />
          <Text style={styles.routeText} numberOfLines={1}>{item.destination}</Text>
        </View>
      </View>
      <Text style={styles.itemCount}>{item.items} items</Text>
    </Card>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
      >
        {STATUS_FILTERS.map((sf) => (
          <TouchableOpacity
            key={sf}
            style={[styles.filterChip, filter === sf && styles.filterChipActive]}
            onPress={() => setFilter(sf)}
          >
            <Text style={[styles.filterText, filter === sf && styles.filterTextActive]}>
              {sf === "All" ? "All" : statusLabel(sf)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        renderItem={renderTransfer}
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
  filterRow: {
    maxHeight: 50,
  },
  filterContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f0f4ff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  filterChipActive: {
    backgroundColor: "#17386b",
    borderColor: "#17386b",
  },
  filterText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6b7b8d",
  },
  filterTextActive: {
    color: "#ffffff",
  },
  list: {
    padding: 16,
    paddingTop: 4,
  },
  transferCard: {
    padding: 16,
    marginBottom: 10,
  },
  transferHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  transferInfo: {
    flex: 1,
  },
  transferNumber: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1a202c",
  },
  transferDate: {
    fontSize: 12,
    color: "#6b7b8d",
    marginTop: 2,
  },
  transferRoute: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  routeItem: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 4,
  },
  routeText: {
    fontSize: 12,
    color: "#4a5568",
    flex: 1,
  },
  itemCount: {
    fontSize: 12,
    color: "#8e99a4",
  },
});

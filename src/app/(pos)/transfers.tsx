import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TransferService } from "@/lib/services/transfer.service";
import { useCashierStore } from "@/lib/stores/cashier-store";
import type { InventoryTransferDTO } from "@/lib/types/inventory";

const STATUS_FILTERS = ["All", "DRAFT", "APPROVED", "IN_TRANSIT", "RECEIVED"];

export default function TransfersScreen() {
  const [filter, setFilter] = useState("All");
  const [transfers, setTransfers] = useState<InventoryTransferDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const session = useCashierStore((s) => s.session);

  const loadTransfers = useCallback(async () => {
    try {
      const result = await TransferService.list({ page: 1, pageSize: 50 });
      setTransfers(result.items);
    } catch {
      // keep empty
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadTransfers();
      setLoading(false);
    })();
  }, [loadTransfers]);

  const filtered = filter === "All"
    ? transfers
    : transfers.filter((t) => t.status === filter);

  const statusColor = (status: string) => {
    switch (status) {
      case "DRAFT": return "#6b7b8d";
      case "APPROVED": return "#17a2b8";
      case "IN_TRANSIT": return "#ffc107";
      case "RECEIVED": return "#28a745";
      case "REJECTED": return "#dc3545";
      default: return "#6b7b8d";
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "DRAFT": return "Draft";
      case "APPROVED": return "Approved";
      case "IN_TRANSIT": return "In Transit";
      case "RECEIVED": return "Received";
      case "REJECTED": return "Rejected";
      default: return status;
    }
  };

  const handleReceive = async (id: string) => {
    Alert.alert("Receive Transfer", "Mark this transfer as received?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Receive",
        onPress: async () => {
          setActionLoading(id);
          try {
            await TransferService.receive(id, session?.cashierName ?? "Cashier");
            await loadTransfers();
          } catch {
            Alert.alert("Error", "Failed to receive transfer.");
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  const handleReject = async (id: string) => {
    Alert.alert("Reject Transfer", "Reject this transfer?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject",
        style: "destructive",
        onPress: async () => {
          setActionLoading(id);
          try {
            await TransferService.reject(id, session?.cashierName ?? "Cashier");
            await loadTransfers();
          } catch {
            Alert.alert("Error", "Failed to reject transfer.");
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  const renderTransfer = ({ item }: { item: InventoryTransferDTO }) => (
    <Card style={styles.transferCard}>
      <View style={styles.transferHeader}>
        <View style={styles.transferInfo}>
          <Text style={styles.transferNumber}>{item.transferNumber}</Text>
          <Text style={styles.transferDate}>{item.createdAt.split("T")[0]}</Text>
        </View>
        <Badge label={statusLabel(item.status)} color={statusColor(item.status)} />
      </View>
      <View style={styles.transferRoute}>
        <View style={styles.routeItem}>
          <Ionicons name="location-outline" size={14} color="#6b7b8d" />
          <Text style={styles.routeText} numberOfLines={1}>{item.sourceWarehouse ?? "N/A"}</Text>
        </View>
        <Ionicons name="arrow-forward" size={14} color="#8e99a4" />
        <View style={styles.routeItem}>
          <Ionicons name="location" size={14} color="#17386b" />
          <Text style={styles.routeText} numberOfLines={1}>{item.destinationPos ?? "N/A"}</Text>
        </View>
      </View>
      <Text style={styles.itemCount}>{item.items.length} items</Text>

      {(item.status === "IN_TRANSIT" || item.status === "APPROVED") && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.receiveBtn]}
            onPress={() => handleReceive(item.id)}
            disabled={actionLoading === item.id}
          >
            {actionLoading === item.id ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={16} color="#ffffff" />
                <Text style={styles.receiveBtnText}>Receive</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={() => handleReject(item.id)}
            disabled={actionLoading === item.id}
          >
            <Ionicons name="close-circle" size={16} color="#dc3545" />
            <Text style={styles.rejectBtnText}>Reject</Text>
          </TouchableOpacity>
        </View>
      )}
    </Card>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#17386b" />
      </View>
    );
  }

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
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="swap-horizontal-outline" size={48} color="#d1d9e6" />
            <Text style={styles.emptyText}>No transfers found</Text>
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
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f0f4ff",
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  receiveBtn: {
    backgroundColor: "#28a745",
  },
  receiveBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  rejectBtn: {
    backgroundColor: "#fff5f5",
    borderWidth: 1,
    borderColor: "#dc3545",
  },
  rejectBtnText: {
    color: "#dc3545",
    fontSize: 13,
    fontWeight: "600",
  },
});

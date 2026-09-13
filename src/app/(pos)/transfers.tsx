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
import type { InventoryTransferDTO, InventoryTransferItemDTO } from "@/lib/types/inventory";

const STATUS_FILTERS = ["All", "DRAFT", "APPROVED", "IN_TRANSIT", "RECEIVED"];

const TIMELINE_STEPS = [
  { key: "CREATED", label: "Created", icon: "time-outline" as const },
  { key: "APPROVED", label: "Approved", icon: "checkmark-outline" as const },
  { key: "IN_TRANSIT", label: "In Transit", icon: "car-outline" as const },
  { key: "RECEIVED", label: "Received", icon: "cube-outline" as const },
];

const STATUS_ORDER = ["CREATED", "APPROVED", "IN_TRANSIT", "RECEIVED"];

function getTimelineStatus(stepKey: string, currentStatus: string): "done" | "active" | "pending" {
  const currentIdx = STATUS_ORDER.indexOf(currentStatus);
  const stepIdx = STATUS_ORDER.indexOf(stepKey);
  if (stepIdx < currentIdx) return "done";
  if (stepIdx === currentIdx) return "active";
  return "pending";
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TransfersScreen() {
  const [filter, setFilter] = useState("All");
  const [transfers, setTransfers] = useState<InventoryTransferDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTransfer, setSelectedTransfer] = useState<InventoryTransferDTO | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
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

  const handleTransferPress = useCallback(async (transfer: InventoryTransferDTO) => {
    setDetailLoading(true);
    setSelectedTransfer(transfer);
    try {
      const full = await TransferService.getById(transfer.id);
      if (full) setSelectedTransfer(full);
    } catch { /* use partial data */ }
    setDetailLoading(false);
  }, []);

  const handleReceive = useCallback(async (id: string) => {
    Alert.alert("Receive Transfer", "Mark this transfer as received?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Receive All",
        onPress: async () => {
          setActionLoading(true);
          try {
            const result = await TransferService.receive(id, session?.cashierName ?? "Cashier");
            if (result) {
              setSelectedTransfer(result);
              await loadTransfers();
              Alert.alert("Success", "Transfer received successfully.");
            } else {
              Alert.alert("Error", "Failed to receive transfer.");
            }
          } catch {
            Alert.alert("Error", "Failed to receive transfer.");
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  }, [session, loadTransfers]);

  const handleReject = useCallback(async (id: string) => {
    Alert.alert("Reject Transfer", "Reject this transfer?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject",
        style: "destructive",
        onPress: async () => {
          setActionLoading(true);
          try {
            const result = await TransferService.reject(id, session?.cashierName ?? "Cashier");
            if (result) {
              setSelectedTransfer(result);
              await loadTransfers();
            } else {
              Alert.alert("Error", "Failed to reject transfer.");
            }
          } catch {
            Alert.alert("Error", "Failed to reject transfer.");
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  }, [session, loadTransfers]);

  const renderTimeline = () => {
    if (!selectedTransfer) return null;
    return (
      <View style={styles.timelineContainer}>
        <Text style={styles.sectionTitle}>Timeline</Text>
        <View style={styles.timelineRow}>
          {TIMELINE_STEPS.map((step, idx) => {
            const status = getTimelineStatus(step.key, selectedTransfer.status);
            return (
              <React.Fragment key={step.key}>
                <View style={styles.timelineStep}>
                  <View
                    style={[
                      styles.timelineDot,
                      status === "done" && styles.timelineDotDone,
                      status === "active" && styles.timelineDotActive,
                      status === "pending" && styles.timelineDotPending,
                    ]}
                  >
                    <Ionicons
                      name={step.icon}
                      size={14}
                      color={status === "pending" ? "#d1d9e6" : "#ffffff"}
                    />
                  </View>
                  <Text style={[styles.timelineLabel, status === "pending" && styles.timelineLabelPending]}>
                    {step.label}
                  </Text>
                </View>
                {idx < TIMELINE_STEPS.length - 1 && (
                  <View
                    style={[
                      styles.timelineLine,
                      status === "done" ? styles.timelineLineDone : styles.timelineLinePending,
                    ]}
                  />
                )}
              </React.Fragment>
            );
          })}
        </View>
        <View style={styles.timelineDates}>
          <Text style={styles.timelineDateText}>Created: {formatDateTime(selectedTransfer.createdAt)}</Text>
          {selectedTransfer.approvedAt && (
            <Text style={styles.timelineDateText}>Approved: {formatDateTime(selectedTransfer.approvedAt)}</Text>
          )}
          {selectedTransfer.receivedAt && (
            <Text style={styles.timelineDateText}>Received: {formatDateTime(selectedTransfer.receivedAt)}</Text>
          )}
        </View>
      </View>
    );
  };

  const renderItemsTable = () => {
    if (!selectedTransfer) return null;
    return (
      <Card style={styles.tableCard}>
        <Text style={styles.sectionTitle}>Items</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, { flex: 2 }]}>Product</Text>
          <Text style={[styles.tableHeaderText, { width: 60 }]}>Alloc.</Text>
          <Text style={[styles.tableHeaderText, { width: 65 }]}>Received</Text>
          <Text style={[styles.tableHeaderText, { width: 50 }]}>Unit</Text>
          <Text style={[styles.tableHeaderText, { flex: 1 }]}>Remarks</Text>
        </View>
        {selectedTransfer.items.map((item: InventoryTransferItemDTO) => (
          <View key={item.id} style={styles.tableRow}>
            <View style={{ flex: 2 }}>
              <Text style={styles.tableCellPrimary} numberOfLines={1}>{item.productName ?? "Unknown"}</Text>
              <Text style={styles.tableCellSecondary}>{item.productSku ?? "—"}</Text>
            </View>
            <Text style={[styles.tableCell, { width: 60 }]}>{item.allocatedQty}</Text>
            <Text style={[styles.tableCell, { width: 65 }]}>{item.receivedQty}</Text>
            <Text style={[styles.tableCellMuted, { width: 50 }]}>{item.unit ?? "—"}</Text>
            <Text style={[styles.tableCellMuted, { flex: 1 }]} numberOfLines={1}>{item.remarks ?? "—"}</Text>
          </View>
        ))}
      </Card>
    );
  };

  if (selectedTransfer) {
    const canReceive =
      selectedTransfer.status === "IN_TRANSIT" || selectedTransfer.status === "APPROVED";
    const canReject =
      selectedTransfer.status !== "RECEIVED" &&
      selectedTransfer.status !== "COMPLETED" &&
      selectedTransfer.status !== "CANCELLED" &&
      selectedTransfer.status !== "REJECTED";

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.detailContent}>
        <View style={styles.detailHeader}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setSelectedTransfer(null)}
          >
            <Ionicons name="arrow-back" size={22} color="#17386b" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={styles.detailHeaderRow}>
              <Text style={styles.detailTitle}>{selectedTransfer.transferNumber}</Text>
              <Badge label={statusLabel(selectedTransfer.status)} color={statusColor(selectedTransfer.status)} />
            </View>
            <Text style={styles.detailSubtitle}>
              {selectedTransfer.sourceWarehouse ?? "Unknown source"} → {selectedTransfer.destinationPos ?? "Unknown destination"}
            </Text>
          </View>
        </View>

        {detailLoading ? (
          <ActivityIndicator size="large" color="#17386b" style={{ marginTop: 32 }} />
        ) : (
          <>
            {renderTimeline()}
            {renderItemsTable()}

            {selectedTransfer.notes && (
              <Card style={styles.notesCard}>
                <Text style={styles.sectionTitle}>Notes</Text>
                <Text style={styles.notesText}>{selectedTransfer.notes}</Text>
              </Card>
            )}

            <Card style={styles.infoCard}>
              <Text style={styles.sectionTitle}>Transfer Info</Text>
              {selectedTransfer.createdByName && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Created by</Text>
                  <Text style={styles.infoValue}>{selectedTransfer.createdByName}</Text>
                </View>
              )}
              {selectedTransfer.approvedByName && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Approved by</Text>
                  <Text style={styles.infoValue}>{selectedTransfer.approvedByName}</Text>
                </View>
              )}
              {selectedTransfer.receivedByName && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Received by</Text>
                  <Text style={styles.infoValue}>{selectedTransfer.receivedByName}</Text>
                </View>
              )}
            </Card>

            {(canReceive || canReject) && (
              <View style={styles.actionRow}>
                {canReceive && (
                  <TouchableOpacity
                    style={[styles.receiveBtn, actionLoading && styles.btnDisabled]}
                    onPress={() => handleReceive(selectedTransfer.id)}
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={16} color="#ffffff" />
                        <Text style={styles.receiveBtnText}>Receive All</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
                {canReject && (
                  <TouchableOpacity
                    style={[styles.rejectBtn, actionLoading && styles.btnDisabled]}
                    onPress={() => handleReject(selectedTransfer.id)}
                    disabled={actionLoading}
                  >
                    <Ionicons name="close-circle" size={16} color="#dc3545" />
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    );
  }

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
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => handleTransferPress(item)} activeOpacity={0.7}>
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
              <View style={styles.transferFooter}>
                <Text style={styles.itemCount}>{item.items.length} items</Text>
                <Ionicons name="chevron-forward" size={16} color="#c1c9d4" />
              </View>
            </Card>
          </TouchableOpacity>
        )}
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
  transferFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemCount: {
    fontSize: 12,
    color: "#8e99a4",
  },
  detailContent: {
    padding: 16,
    paddingBottom: 32,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f0f4ff",
    alignItems: "center",
    justifyContent: "center",
  },
  detailHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a202c",
  },
  detailSubtitle: {
    fontSize: 13,
    color: "#6b7b8d",
    marginTop: 4,
  },
  timelineContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1a202c",
    marginBottom: 12,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  timelineStep: {
    alignItems: "center",
    flex: 1,
  },
  timelineDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  timelineDotDone: {
    backgroundColor: "#28a745",
  },
  timelineDotActive: {
    backgroundColor: "#17a2b8",
  },
  timelineDotPending: {
    backgroundColor: "#e9ecef",
  },
  timelineLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#1a202c",
    textAlign: "center",
  },
  timelineLabelPending: {
    color: "#d1d9e6",
  },
  timelineLine: {
    height: 2,
    flex: 1,
    marginTop: -12,
    marginBottom: 16,
  },
  timelineLineDone: {
    backgroundColor: "#28a745",
  },
  timelineLinePending: {
    backgroundColor: "#e9ecef",
  },
  timelineDates: {
    gap: 4,
  },
  timelineDateText: {
    fontSize: 11,
    color: "#6b7b8d",
  },
  tableCard: {
    padding: 16,
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f8f9fa",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginBottom: 4,
  },
  tableHeaderText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6b7b8d",
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f4ff",
  },
  tableCell: {
    fontSize: 13,
    color: "#1a202c",
    textAlign: "center",
  },
  tableCellPrimary: {
    fontSize: 13,
    fontWeight: "500",
    color: "#1a202c",
  },
  tableCellSecondary: {
    fontSize: 10,
    color: "#8e99a4",
    marginTop: 1,
  },
  tableCellMuted: {
    fontSize: 12,
    color: "#6b7b8d",
    textAlign: "center",
  },
  notesCard: {
    padding: 16,
    marginBottom: 12,
  },
  notesText: {
    fontSize: 13,
    color: "#4a5568",
    lineHeight: 18,
  },
  infoCard: {
    padding: 16,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f4ff",
  },
  infoLabel: {
    fontSize: 13,
    color: "#6b7b8d",
  },
  infoValue: {
    fontSize: 13,
    fontWeight: "500",
    color: "#1a202c",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  receiveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#28a745",
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  receiveBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff5f5",
    borderWidth: 1.5,
    borderColor: "#dc3545",
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  rejectBtnText: {
    color: "#dc3545",
    fontSize: 14,
    fontWeight: "600",
  },
  btnDisabled: {
    opacity: 0.5,
  },
});

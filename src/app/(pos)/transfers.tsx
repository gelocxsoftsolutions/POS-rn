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
  Modal,
  TextInput,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer } from "expo-audio";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TransferService } from "@/lib/services/transfer.service";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useIsDarkTheme, useUiStore } from "@/lib/stores/ui-store";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { api } from "@/lib/api/http";
import { useDeviceStore } from "@/lib/stores/device-store";
import type { InventoryTransferDTO, InventoryTransferItemDTO } from "@/lib/types/inventory";
import { useLocalSearchParams } from "expo-router";
import { playFeedbackSound } from "@/lib/audio/feedback-sound";

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

type ReceiveDraftItem = {
  itemId: string;
  productName: string;
  productSku: string;
  unit: string | null;
  expected: number;
  actual: number;
  notes: string;
};

export default function TransfersScreen() {
  const transferReceivedPlayer = useAudioPlayer(
    require("../../../assets/sounds/transfer-received.wav")
  );
  const soundMuted = useUiStore((state) => state.soundMuted);
  const soundVolume = useUiStore((state) => state.soundVolume);
  const transferSoundVolume = useUiStore((state) => state.soundVolumes?.transferReceived ?? 1);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [transfers, setTransfers] = useState<InventoryTransferDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTransfer, setSelectedTransfer] = useState<InventoryTransferDTO | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanning, setScanning] = useState(false);
  const pageSize = useUiStore((state) => state.pageSizes?.transfers ?? 5);
  const setPageSize = useUiStore((state) => state.setPageSize);
  const [permission, requestPermission] = useCameraPermissions();
  const session = useCashierStore((s) => s.session);
  const dark = useIsDarkTheme();
  const device = useDeviceStore((s) => s.device);
  const currentDeviceName = (device.deviceName || device.branchName || "This device").trim();
  const params = useLocalSearchParams<{ highlight?: string }>();
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  useEffect(() => {
    const h = params.highlight as string | undefined;
    if (h) {
      setHighlightedId(h);
      const t = setTimeout(() => setHighlightedId(null), 3000);
      return () => clearTimeout(t);
    }
  }, [params.highlight]);

  // QR checklist receive state
  const [showReceiveChecklist, setShowReceiveChecklist] = useState(false);
  const [receiveTransferId, setReceiveTransferId] = useState<string | null>(null);
  const [receiveTransferNumber, setReceiveTransferNumber] = useState<string>("");
  const [receiveDraft, setReceiveDraft] = useState<ReceiveDraftItem[]>([]);
  const [receiveSaving, setReceiveSaving] = useState(false);
  const [showConfirmScanner, setShowConfirmScanner] = useState(false);
  const [confirmScanning, setConfirmScanning] = useState(false);

  const loadTransfers = useCallback(async () => {
    try {
      const result = await TransferService.list({ page: 1, pageSize: 500 });
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

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = transfers.filter((transfer) => {
    const matchesStatus = filter === "All" || transfer.status === filter;
    const matchesSearch = !normalizedSearch || [
      transfer.transferNumber,
      transfer.sourceWarehouse,
      transfer.destinationPos,
      transfer.status,
    ].some((value) => String(value ?? "").toLowerCase().includes(normalizedSearch));
    return matchesStatus && matchesSearch;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedTransfers = filtered.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

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

  const openReceiveChecklist = useCallback(async (transferId: string) => {
    try {
      const full = await TransferService.getById(transferId);
      if (!full) {
        Alert.alert("Error", "Transfer not found.");
        return;
      }
      if (full.status === "RECEIVED" || full.status === "REJECTED" || full.status === "CANCELLED" || full.status === "COMPLETED") {
        Alert.alert("Not receivable", `Transfer is already ${full.status}.`);
        return;
      }
      const draft: ReceiveDraftItem[] = (full.items ?? []).map((it) => ({
        itemId: it.id,
        productName: it.productName ?? "Unknown",
        productSku: it.productSku ?? "",
        unit: it.unit ?? null,
        expected: Number(it.allocatedQty ?? 0),
        actual: Number(it.allocatedQty ?? 0),
        notes: it.remarks ?? "",
      }));
      if (draft.length === 0) {
        Alert.alert("No items", "This transfer has no items to receive.");
        return;
      }
      setReceiveTransferId(full.id);
      setReceiveTransferNumber(full.transferNumber);
      setReceiveDraft(draft);
      setShowReceiveChecklist(true);
    } catch {
      Alert.alert("Error", "Failed to load transfer items.");
    }
  }, []);

  const handleReceive = useCallback(async (id: string) => {
    await openReceiveChecklist(id);
  }, [openReceiveChecklist]);

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

  const updateReceiveQty = useCallback((itemId: string, delta: number) => {
    setReceiveDraft((prev) =>
      prev.map((r) => {
        if (r.itemId !== itemId) return r;
        const next = Math.max(0, r.actual + delta);
        return { ...r, actual: next };
      })
    );
  }, []);

  const updateReceiveNotes = useCallback((itemId: string, notes: string) => {
    setReceiveDraft((prev) => prev.map((r) => (r.itemId === itemId ? { ...r, notes } : r)));
  }, []);

  const playTransferReceivedSound = useCallback(async () => {
    await playFeedbackSound(transferReceivedPlayer, {
      muted: soundMuted,
      volume: soundVolume * transferSoundVolume,
    });
  }, [transferReceivedPlayer, soundMuted, soundVolume, transferSoundVolume]);

  const doFinalReceive = useCallback(async (omsTransferId?: number) => {
    if (!receiveTransferId) return;
    setReceiveSaving(true);
    try {
      const payload = receiveDraft.map((r) => ({ itemId: r.itemId, actualQty: r.actual, notes: r.notes.trim() || undefined }));
      console.log("[Transfer] doFinalReceive", receiveTransferId, payload, "omsTransferId", omsTransferId);
      const result = await TransferService.receive(receiveTransferId, payload, session?.cashierName ?? "Cashier", omsTransferId);
      if (result) {
        void playTransferReceivedSound();
        setShowReceiveChecklist(false);
        setShowConfirmScanner(false);
        setReceiveTransferId(null);
        setReceiveDraft([]);
        setSelectedTransfer(result);
        await loadTransfers();
        Alert.alert("Transfer Received", `${receiveTransferNumber} received with ${payload.reduce((s, p) => s + p.actualQty, 0)} items.`);
      } else {
        console.warn("[Transfer] receive returned null", receiveTransferId);
        Alert.alert("Error", "Failed to receive transfer. Check that products are synced and try again.");
      }
    } catch (e: any) {
      console.error("[Transfer] doFinalReceive error", e?.message ?? e);
      Alert.alert("Error", e?.message ?? "Failed to receive transfer.");
    } finally {
      setReceiveSaving(false);
    }
  }, [receiveTransferId, receiveDraft, receiveTransferNumber, session, loadTransfers, playTransferReceivedSound]);

  const handleConfirmReceive = useCallback(async () => {
    if (!receiveTransferId) return;
    const missingNotes = receiveDraft.filter((r) => r.actual !== r.expected && !r.notes.trim());
    if (missingNotes.length > 0) {
      Alert.alert("Notes required", `Please add a reason for ${missingNotes[0].productName} (expected ${missingNotes[0].expected}, received ${missingNotes[0].actual}).`);
      return;
    }
    let hasPermission = permission?.granted ?? false;
    if (!hasPermission) {
      const result = await requestPermission();
      hasPermission = result.granted;
      if (!hasPermission) {
        if (!result.canAskAgain) {
          Alert.alert("Camera Permission Required", "Camera access is permanently denied. Please enable it in Settings to scan the OMS Transfer QR.", [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ]);
        } else {
          Alert.alert("Camera Required", "Camera permission is needed to scan the OMS Transfer QR code.");
        }
        return;
      }
    }
    // Hide checklist to avoid Android double-Modal black screen — CameraView inside second Modal mounts black if first Modal still animating
    setConfirmScanning(false);
    setShowReceiveChecklist(false);
    // Wait for checklist Modal slide dismiss (~350ms) + buffer before mounting scanner Modal
    setTimeout(() => setShowConfirmScanner(true), 500);
  }, [receiveTransferId, receiveDraft, permission, requestPermission]);

  const handleConfirmQrScan = useCallback(async (raw: string) => {
    if (confirmScanning) return;
    setConfirmScanning(true);
    setShowConfirmScanner(false);
    try {
      const payload = TransferService.parseTransferQr(raw);
      if (!payload) {
        Alert.alert("Invalid QR", "This is not a valid transfer QR code.", [
          { text: "OK", onPress: () => setShowReceiveChecklist(true) },
        ]);
        return;
      }
      if (payload.transferNumber !== receiveTransferNumber) {
        Alert.alert("QR mismatch", `Scanned ${payload.transferNumber} does not match ${receiveTransferNumber}. Scan the correct transfer QR from OMS.`, [
          { text: "OK", onPress: () => setShowReceiveChecklist(true) },
        ]);
        return;
      }
      await doFinalReceive(payload.transferId);
    } catch {
      Alert.alert("Error", "Failed to verify QR code.", [
        { text: "OK", onPress: () => setShowReceiveChecklist(true) },
      ]);
    } finally {
      setConfirmScanning(false);
    }
  }, [receiveTransferNumber, doFinalReceive, confirmScanning]);

  const handleScanQr = useCallback(async (raw: string) => {
    setScanning(true);
    setShowScanner(false);
    try {
      const payload = TransferService.parseTransferQr(raw);
      if (!payload) {
        Alert.alert("Invalid QR", "This is not a valid transfer QR code.");
        return;
      }

      // Try to find local transfer by transferNumber (now correctly TRF-xxx after for-device sync)
      let local = transfers.find((t) => t.transferNumber === payload.transferNumber) ?? null;
      if (!local) {
        // Also try numeric fallback (legacy log.id)
        const byId = transfers.find((t) => t.transferNumber === String(payload.transferId));
        if (byId) local = byId;
      }
      if (local) {
        await openReceiveChecklist(local.id);
        return;
      }

      // Not found locally — try to fetch detail from OMS and create local record then open checklist
      try {
        const deviceId = useDeviceStore.getState().device?.deviceId ?? "";
        const res = await api.get<{
          id: number;
          transferNumber: string;
          status: string;
          items: Array<{
            id: number;
            productName: string;
            sku: string | null;
            allocatedQty: number;
            unit: string | null;
            variation: { id: string; productName: string; barcode?: string | null; unit?: string | null } | null;
          }>;
        }>(`/api/pos/transfers/detail/${payload.transferId}`);
        if (res.ok && (res.data as any)?.id) {
          const data: any = res.data;
          // Ensure local transfer exists — create synthetic IN_TRANSIT if needed so receive checklist can operate
          // We can open a transient checklist without persisting transfer, but ensure product exists via variation
          // Try to upsert from detailed variation if available via pending sync
          await loadTransfers();
          const after = transfers.find((t) => t.transferNumber === data.transferNumber);
          if (after) {
            await openReceiveChecklist(after.id);
            return;
          }
          Alert.alert("Transfer not synced", `${payload.transferNumber} is approved on OMS. Pull it via Sync or wait for next sync, then scan again.`);
          return;
        }
      } catch {}

      Alert.alert("Transfer not found", `${payload.transferNumber} not found on this device. Make sure the transfer targets this POS and sync has completed.`);
    } catch {
      Alert.alert("Error", "Failed to process QR code.");
    } finally {
      setScanning(false);
    }
  }, [transfers, loadTransfers, openReceiveChecklist]);

  const openScanner = useCallback(async () => {
    let hasPermission = permission?.granted ?? false;
    if (!hasPermission) {
      const result = await requestPermission();
      hasPermission = result.granted;
      if (!hasPermission) {
        if (!result.canAskAgain) {
          Alert.alert("Camera Permission Required", "Camera access is permanently denied. Please enable it in Settings.", [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ]);
        } else {
          Alert.alert("Camera Required", "Camera permission is needed to scan QR codes.");
        }
        return;
      }
    }
    setScanning(false);
    setShowScanner(true);
  }, [permission, requestPermission]);

  const renderTimeline = () => {
    if (!selectedTransfer) return null;
    return (
      <View style={[styles.timelineContainer, { backgroundColor: dark ? "#101928" : "#ffffff" }]}>
        <Text style={[styles.sectionTitle, { color: dark ? "#e2e8f0" : "#1a202c" }]}>Timeline</Text>
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
                  <Text style={[styles.timelineLabel, status === "pending" && styles.timelineLabelPending, { color: dark && status !== "pending" ? "#e2e8f0" : undefined }]}>
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
          <Text style={[styles.timelineDateText, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Created: {formatDateTime(selectedTransfer.createdAt)}</Text>
          {selectedTransfer.approvedAt && (
            <Text style={[styles.timelineDateText, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Approved: {formatDateTime(selectedTransfer.approvedAt)}</Text>
          )}
          {selectedTransfer.receivedAt && (
            <Text style={[styles.timelineDateText, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Received: {formatDateTime(selectedTransfer.receivedAt)}</Text>
          )}
        </View>
      </View>
    );
  };

  const renderItemsTable = () => {
    if (!selectedTransfer) return null;
    return (
      <Card style={[styles.tableCard, { backgroundColor: dark ? "#101928" : "#ffffff" }]}>
        <Text style={[styles.sectionTitle, { color: dark ? "#e2e8f0" : "#1a202c" }]}>Items</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, { flex: 2, color: dark ? "#8e99a4" : "#6b7b8d" }]}>Product</Text>
          <Text style={[styles.tableHeaderText, { width: 60, color: dark ? "#8e99a4" : "#6b7b8d" }]}>Alloc.</Text>
          <Text style={[styles.tableHeaderText, { width: 65, color: dark ? "#8e99a4" : "#6b7b8d" }]}>Received</Text>
          <Text style={[styles.tableHeaderText, { width: 50, color: dark ? "#8e99a4" : "#6b7b8d" }]}>Unit</Text>
          <Text style={[styles.tableHeaderText, { flex: 1, color: dark ? "#8e99a4" : "#6b7b8d" }]}>Remarks</Text>
        </View>
        {(selectedTransfer.items ?? []).map((item: InventoryTransferItemDTO) => (
          <View key={item.id} style={styles.tableRow}>
            <View style={{ flex: 2 }}>
              <Text style={[styles.tableCellPrimary, { color: dark ? "#e2e8f0" : "#1a202c" }]} numberOfLines={1}>{item.productName ?? "Unknown"}</Text>
              <Text style={[styles.tableCellSecondary, { color: dark ? "#8e99a4" : "#8e99a4" }]}>{item.productSku ?? "—"}</Text>
            </View>
            <Text style={[styles.tableCell, { width: 60, color: dark ? "#e2e8f0" : "#1a202c" }]}>{item.allocatedQty}</Text>
            <Text style={[styles.tableCell, { width: 65, color: dark ? "#e2e8f0" : "#1a202c" }]}>{item.receivedQty}</Text>
            <Text style={[styles.tableCellMuted, { width: 50, color: dark ? "#8e99a4" : "#6b7b8d" }]}>{item.unit ?? "—"}</Text>
            <Text style={[styles.tableCellMuted, { flex: 1, color: dark ? "#8e99a4" : "#6b7b8d" }]} numberOfLines={1}>{item.remarks ?? "—"}</Text>
          </View>
        ))}
      </Card>
    );
  };

  // Detail view — rendered together with modals so checklist appears immediately (no back needed)
  if (selectedTransfer) {
    const canReceive =
      selectedTransfer.status === "IN_TRANSIT" || selectedTransfer.status === "APPROVED";
    const canReject =
      selectedTransfer.status !== "RECEIVED" &&
      selectedTransfer.status !== "COMPLETED" &&
      selectedTransfer.status !== "CANCELLED" &&
      selectedTransfer.status !== "REJECTED";

    return (
      <View style={{ flex: 1 }}>
        <ScrollView style={[styles.container, { backgroundColor: dark ? "#050a14" : "#f8fbff" }]} contentContainerStyle={styles.detailContent}>
          <View style={styles.detailHeader}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => setSelectedTransfer(null)}
            >
              <Ionicons name="arrow-back" size={22} color="#17386b" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <View style={styles.detailHeaderRow}>
                <Text style={[styles.detailTitle, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{selectedTransfer.transferNumber}</Text>
                <Badge label={statusLabel(selectedTransfer.status)} color={statusColor(selectedTransfer.status)} />
              </View>
              <Text style={[styles.detailSubtitle, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>
                {selectedTransfer.sourceWarehouse ?? "OMS Warehouse"} → {selectedTransfer.destinationPos ?? currentDeviceName}
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
                <Card style={[styles.notesCard, { backgroundColor: dark ? "#101928" : "#ffffff" }]}>
                  <Text style={[styles.sectionTitle, { color: dark ? "#e2e8f0" : "#1a202c" }]}>Notes</Text>
                  <Text style={[styles.notesText, { color: dark ? "#c1c9d4" : "#4a5568" }]}>{selectedTransfer.notes}</Text>
                </Card>
              )}

              <Card style={[styles.infoCard, { backgroundColor: dark ? "#101928" : "#ffffff" }]}>
                <Text style={[styles.sectionTitle, { color: dark ? "#e2e8f0" : "#1a202c" }]}>Transfer Info</Text>
                {selectedTransfer.createdByName && (
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Created by</Text>
                    <Text style={[styles.infoValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{selectedTransfer.createdByName}</Text>
                  </View>
                )}
                {selectedTransfer.approvedByName && (
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Approved by</Text>
                    <Text style={[styles.infoValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{selectedTransfer.approvedByName}</Text>
                  </View>
                )}
                {selectedTransfer.receivedByName && (
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>Received by</Text>
                    <Text style={[styles.infoValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{selectedTransfer.receivedByName}</Text>
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
                          <Text style={styles.receiveBtnText}>Receive</Text>
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

        {/* Checklist must be reachable from detail view — not only list view */}
        <Modal visible={showReceiveChecklist} animationType="slide" onRequestClose={() => setShowReceiveChecklist(false)}>
          <View style={[styles.receiveOverlay, { backgroundColor: dark ? "#050a14" : "#f8fbff" }]}>
            <View style={[styles.receiveHeader, { borderBottomColor: dark ? "#1e293b" : "#e2e8f0" }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.receiveTitle, { color: dark ? "#e2e8f0" : "#1a202c" }]}>Receive Transfer</Text>
                <Text style={[styles.receiveSubtitle, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>{receiveTransferNumber}</Text>
              </View>
              <TouchableOpacity style={[styles.receiveClose, { backgroundColor: dark ? "#1e293b" : "#f0f4ff" }]} onPress={() => setShowReceiveChecklist(false)}>
                <Ionicons name="close" size={20} color={dark ? "#e2e8f0" : "#17386b"} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.receiveList} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
              <Text style={[styles.receiveHint, { color: dark ? "#8e99a4" : "#6b7b8d", backgroundColor: dark ? "#0f1729" : "#eef2ff", borderColor: dark ? "#1e293b" : "#c7d2fe" }]}>
                Adjust received quantity with +/-. If actual ≠ expected, add a reason below each item. You will scan the OMS QR to confirm.
              </Text>
              {receiveDraft.map((item) => {
                const needsNote = item.actual !== item.expected;
                const hasMissingNote = needsNote && !item.notes.trim();
                return (
                  <View key={item.itemId} style={[styles.receiveItemCard, { backgroundColor: dark ? "#0f1729" : "#ffffff", borderColor: hasMissingNote ? "#fecaca" : dark ? "#1e293b" : "#e2e8f0" }]}>
                    <View style={styles.receiveItemTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.receiveItemName, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{item.productName}</Text>
                        <Text style={[styles.receiveItemSku, { color: dark ? "#64748b" : "#8e99a4" }]}>{item.productSku ?? "—"} {item.unit ? `• ${item.unit}` : ""}</Text>
                        <Text style={[styles.receiveExpected, { color: dark ? "#93c5fd" : "#17386b" }]}>Expected: {item.expected}</Text>
                      </View>
                      <View style={[styles.qtyRow, { backgroundColor: dark ? "#1e293b" : "#f8f9ff", borderColor: dark ? "#334155" : "#e2e8f0" }]}>
                        <TouchableOpacity style={[styles.qtyBtn, item.actual <= 0 && styles.qtyBtnDisabled]} onPress={() => updateReceiveQty(item.itemId, -1)} disabled={item.actual <= 0}>
                          <Ionicons name="remove" size={18} color={item.actual <= 0 ? "#94a3b8" : "#dc2626"} />
                        </TouchableOpacity>
                        <Text style={[styles.qtyValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{item.actual}</Text>
                        <TouchableOpacity style={styles.qtyBtn} onPress={() => updateReceiveQty(item.itemId, 1)}>
                          <Ionicons name="add" size={18} color="#16a34a" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    {needsNote && (
                      <View style={{ marginTop: 10 }}>
                        <Text style={[styles.notesLabel, { color: hasMissingNote ? "#dc2626" : dark ? "#94a3b8" : "#6b7280" }]}>Reason for discrepancy {hasMissingNote ? "• required" : ""}</Text>
                        <TextInput style={[styles.notesInput, { backgroundColor: dark ? "#020617" : "#fefefe", borderColor: hasMissingNote ? "#f87171" : dark ? "#334155" : "#e5e7eb", color: dark ? "#e2e8f0" : "#1e293b" }]} placeholder="e.g., 3 damaged, 2 short on delivery" placeholderTextColor={dark ? "#475569" : "#9ca3af"} value={item.notes} onChangeText={(v) => updateReceiveNotes(item.itemId, v)} multiline />
                      </View>
                    )}
                    {needsNote && !hasMissingNote && <Text style={[styles.discrepancyNote, { color: "#b45309" }]}>Notes saved ✓</Text>}
                  </View>
                );
              })}
              <View style={[styles.receiveSummary, { backgroundColor: dark ? "#0f1729" : "#ffffff", borderColor: dark ? "#1e293b" : "#e2e8f0" }]}>
                <Text style={[styles.receiveSummaryText, { color: dark ? "#cbd5e1" : "#334155" }]}>Total to receive: {receiveDraft.reduce((s, r) => s + r.actual, 0)}  •  Expected: {receiveDraft.reduce((s, r) => s + r.expected, 0)}</Text>
              </View>
            </ScrollView>
            <View style={[styles.receiveFooter, { backgroundColor: dark ? "#0f1729" : "#ffffff", borderTopColor: dark ? "#1e293b" : "#e2e8f0" }]}>
              <TouchableOpacity style={[styles.receiveCancelBtn, { borderColor: dark ? "#334155" : "#e2e8f0" }]} onPress={() => setShowReceiveChecklist(false)} disabled={receiveSaving}>
                <Text style={[styles.receiveCancelText, { color: dark ? "#cbd5e1" : "#475569" }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.receiveConfirmBtn, receiveSaving && styles.btnDisabled]} onPress={handleConfirmReceive} disabled={receiveSaving}>
                {receiveSaving ? <ActivityIndicator size="small" color="#ffffff" /> : <><Ionicons name="qr-code-outline" size={18} color="#ffffff" /><Text style={styles.receiveConfirmText}>Scan QR to Confirm</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showConfirmScanner}
          animationType="slide"
          onRequestClose={() => {
            setConfirmScanning(false);
            setShowConfirmScanner(false);
            setShowReceiveChecklist(true);
          }}
        >
          <View style={styles.qrModalContainer}>
            <View style={styles.qrModalHeader}>
              <TouchableOpacity
                onPress={() => {
                  setConfirmScanning(false);
                  setShowConfirmScanner(false);
                  setShowReceiveChecklist(true);
                }}
                style={styles.backButton}
              >
                <Ionicons name="arrow-back" size={20} color="#17386b" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Scan QR</Text>
              <View style={{ width: 40 }} />
            </View>
            <View style={styles.qrContainer}>
              {permission?.granted ? (
                <View style={styles.cameraCard}>
                  <View style={styles.cameraWrapper}>
                    <CameraView
                      key={showConfirmScanner ? "confirm-camera-mounted" : "confirm-camera-unmounted"}
                      style={styles.camera}
                      barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                      onBarcodeScanned={confirmScanning ? undefined : ({ data }: { data: string }) => handleConfirmQrScan(data)}
                      onMountError={(e) => console.warn("[Camera] mount error", e)}
                    />
                    <View style={[styles.corner, styles.cornerTL]} />
                    <View style={[styles.corner, styles.cornerTR]} />
                    <View style={[styles.corner, styles.cornerBL]} />
                    <View style={[styles.corner, styles.cornerBR]} />
                  </View>
                </View>
              ) : (
                <View style={styles.permissionCard}>
                  <View style={styles.permissionIcon}>
                    <Ionicons name="camera-outline" size={48} color="#17386b" />
                  </View>
                  <Text style={styles.qrTitle}>Camera permission needed</Text>
                  <Text style={styles.qrSubtitle}>Allow camera access to scan the OMS Transfer QR</Text>
                  <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission} activeOpacity={0.8}>
                    <Ionicons name="camera" size={16} color="#ffffff" style={{ marginRight: 8 }} />
                    <Text style={styles.permissionBtnText}>Grant Permission</Text>
                  </TouchableOpacity>
                </View>
              )}
              <Text style={styles.qrTitle}>Scan OMS Transfer QR</Text>
              <Text style={styles.qrSubtitleCenter}>Point camera at {receiveTransferNumber} QR from OMS to finalize</Text>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setConfirmScanning(false);
                  setShowConfirmScanner(false);
                  setShowReceiveChecklist(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
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
    <View style={[styles.container, { backgroundColor: dark ? "#0b0f16" : "#f4f6f8" }]}>
      <View style={styles.pageHeader}>
        <View>
          <Text style={[styles.pageTitle, { color: dark ? "#f5f7fa" : "#151a22" }]}>Transfers</Text>
          <Text style={[styles.pageSubtitle, { color: dark ? "#8f99a8" : "#667080" }]}>Track incoming and outgoing inventory</Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: dark ? "#18202c" : "#e8edf3" }]}>
          <Text style={[styles.countBadgeText, { color: dark ? "#d8dee8" : "#334155" }]}>{filtered.length} records</Text>
        </View>
      </View>
      <View style={[styles.searchBar, { backgroundColor: dark ? "#141922" : "#ffffff", borderColor: dark ? "#28303d" : "#dde3ea" }]}>
        <Ionicons name="search" size={18} color={dark ? "#64748b" : "#8e99a4"} />
        <TextInput
          style={[styles.searchInput, { color: dark ? "#e2e8f0" : "#1a202c" }]}
          placeholder="Search transfers..."
          placeholderTextColor={dark ? "#64748b" : "#9aa4b2"}
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => { setSearch(""); setPage(1); }} accessibilityLabel="Clear transfer search">
            <Ionicons name="close-circle" size={18} color={dark ? "#64748b" : "#8e99a4"} />
          </TouchableOpacity>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
      >
        {STATUS_FILTERS.map((sf) => {
          const active = filter === sf;
          return (
            <TouchableOpacity
              key={sf}
              style={[
                styles.filterChip,
                active
                  ? styles.filterChipActive
                  : { backgroundColor: dark ? "#101928" : "#f0f4ff", borderColor: dark ? "#1e2a3a" : "#e2e8f0" },
              ]}
              onPress={() => {
                setFilter(sf);
                setPage(1);
              }}
            >
              <Text
                style={[
                  styles.filterText,
                  { color: active ? "#ffffff" : dark ? "#e2e8f0" : "#526174" },
                ]}
              >
                {sf === "All" ? "All" : statusLabel(sf)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <FlatList
        style={styles.transferList}
        data={pagedTransfers}
        renderItem={({ item }) => {
          const isHighlighted = highlightedId === item.id;
          return (
          <TouchableOpacity onPress={() => handleTransferPress(item)} activeOpacity={0.7}>
            <Card style={[
              styles.transferCard,
              { backgroundColor: dark ? "#141922" : "#ffffff", borderColor: dark ? "#28303d" : "#dde3ea" },
              isHighlighted && (dark ? styles.transferCardHighlightedDark : styles.transferCardHighlighted),
            ]}>
              <View style={styles.transferHeader}>
                <View style={styles.transferInfo}>
                  <Text style={[styles.transferNumber, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{item.transferNumber}</Text>
                  <Text style={[styles.transferDate, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>{item.createdAt.split("T")[0]}</Text>
                </View>
                <Badge label={statusLabel(item.status)} color={statusColor(item.status)} />
              </View>
              <View style={styles.transferRoute}>
                <View style={styles.routeItem}>
                  <Ionicons name="location-outline" size={14} color="#6b7b8d" />
                  <Text style={[styles.routeText, { color: dark ? "#c1c9d4" : "#4a5568" }]} numberOfLines={1}>{item.sourceWarehouse ?? "OMS Warehouse"}</Text>
                </View>
                <Ionicons name="arrow-forward" size={14} color="#8e99a4" />
                <View style={styles.routeItem}>
                  <Ionicons name="location" size={14} color="#17386b" />
                  <Text style={[styles.routeText, { color: dark ? "#c1c9d4" : "#4a5568" }]} numberOfLines={1}>{item.destinationPos ?? currentDeviceName}</Text>
                </View>
              </View>
              <View style={styles.transferFooter}>
                <Text style={styles.itemCount}>{(item.items as any)?.length ?? (item as any).itemCount ?? 0} items</Text>
                <Ionicons name="chevron-forward" size={16} color="#c1c9d4" />
              </View>
            </Card>
          </TouchableOpacity>
          );
        }}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="swap-horizontal-outline" size={48} color="#d1d9e6" />
            <Text style={styles.emptyText}>No transfers found</Text>
          </View>
        }
      />

      <PaginationControls
        page={page}
        totalPages={totalPages}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize("transfers", size);
          setPage(1);
        }}
        dark={dark}
      />

      <Modal visible={showScanner} animationType="slide" onRequestClose={() => { setScanning(false); setShowScanner(false); }} statusBarTranslucent>
        <View style={styles.scannerContainer}>
          <CameraView
            facing="back"
            style={StyleSheet.absoluteFill}
            onBarcodeScanned={scanning ? undefined : ({ data }: { data: string }) => handleScanQr(data)}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          />
          <TouchableOpacity style={styles.scannerClose} onPress={() => { setScanning(false); setShowScanner(false); }}>
            <Ionicons name="close-circle" size={36} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.scannerHint}>Point camera at transfer QR code</Text>
        </View>
      </Modal>

      {/* Receive checklist — QR → actual quantities + notes */}
      <Modal visible={showReceiveChecklist} animationType="slide" onRequestClose={() => setShowReceiveChecklist(false)}>
        <View style={[styles.receiveOverlay, { backgroundColor: dark ? "#050a14" : "#f8fbff" }]}>
          <View style={[styles.receiveHeader, { borderBottomColor: dark ? "#1e293b" : "#e2e8f0" }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.receiveTitle, { color: dark ? "#e2e8f0" : "#1a202c" }]}>Receive Transfer</Text>
              <Text style={[styles.receiveSubtitle, { color: dark ? "#8e99a4" : "#6b7b8d" }]}>{receiveTransferNumber}</Text>
            </View>
            <TouchableOpacity style={[styles.receiveClose, { backgroundColor: dark ? "#1e293b" : "#f0f4ff" }]} onPress={() => setShowReceiveChecklist(false)}>
              <Ionicons name="close" size={20} color={dark ? "#e2e8f0" : "#17386b"} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.receiveList} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
            <Text style={[styles.receiveHint, { color: dark ? "#8e99a4" : "#6b7b8d", backgroundColor: dark ? "#0f1729" : "#eef2ff", borderColor: dark ? "#1e293b" : "#c7d2fe" }]}>
              Adjust received quantity with +/-. If actual ≠ expected, add a reason. You will scan the OMS QR to confirm.
            </Text>

            {receiveDraft.map((item) => {
              const needsNote = item.actual !== item.expected;
              const hasMissingNote = needsNote && !item.notes.trim();
              return (
                <View key={item.itemId} style={[styles.receiveItemCard, { backgroundColor: dark ? "#0f1729" : "#ffffff", borderColor: hasMissingNote ? "#fecaca" : dark ? "#1e293b" : "#e2e8f0" }]}>
                  <View style={styles.receiveItemTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.receiveItemName, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{item.productName}</Text>
                      <Text style={[styles.receiveItemSku, { color: dark ? "#64748b" : "#8e99a4" }]}>{item.productSku ?? "—"} {item.unit ? `• ${item.unit}` : ""}</Text>
                      <Text style={[styles.receiveExpected, { color: dark ? "#93c5fd" : "#17386b" }]}>Expected: {item.expected}</Text>
                    </View>
                    <View style={[styles.qtyRow, { backgroundColor: dark ? "#1e293b" : "#f8f9ff", borderColor: dark ? "#334155" : "#e2e8f0" }]}>
                      <TouchableOpacity
                        style={[styles.qtyBtn, item.actual <= 0 && styles.qtyBtnDisabled]}
                        onPress={() => updateReceiveQty(item.itemId, -1)}
                        disabled={item.actual <= 0}
                      >
                        <Ionicons name="remove" size={18} color={item.actual <= 0 ? "#94a3b8" : "#dc2626"} />
                      </TouchableOpacity>
                      <Text style={[styles.qtyValue, { color: dark ? "#e2e8f0" : "#1a202c" }]}>{item.actual}</Text>
                      <TouchableOpacity style={styles.qtyBtn} onPress={() => updateReceiveQty(item.itemId, 1)}>
                        <Ionicons name="add" size={18} color="#16a34a" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {needsNote && (
                    <View style={{ marginTop: 10 }}>
                      <Text style={[styles.notesLabel, { color: hasMissingNote ? "#dc2626" : dark ? "#94a3b8" : "#6b7280" }]}>
                        Reason for discrepancy {hasMissingNote ? "• required" : ""}
                      </Text>
                      <TextInput
                        style={[
                          styles.notesInput,
                          {
                            backgroundColor: dark ? "#020617" : "#fefefe",
                            borderColor: hasMissingNote ? "#f87171" : dark ? "#334155" : "#e5e7eb",
                            color: dark ? "#e2e8f0" : "#1e293b",
                          },
                        ]}
                        placeholder="e.g., 3 damaged, 2 short on delivery"
                        placeholderTextColor={dark ? "#475569" : "#9ca3af"}
                        value={item.notes}
                        onChangeText={(v) => updateReceiveNotes(item.itemId, v)}
                        multiline
                      />
                    </View>
                  )}
                  {needsNote && !hasMissingNote && (
                    <Text style={[styles.discrepancyNote, { color: "#b45309" }]}>Notes saved ✓</Text>
                  )}
                </View>
              );
            })}

            <View style={[styles.receiveSummary, { backgroundColor: dark ? "#0f1729" : "#ffffff", borderColor: dark ? "#1e293b" : "#e2e8f0" }]}>
              <Text style={[styles.receiveSummaryText, { color: dark ? "#cbd5e1" : "#334155" }]}>
                Total to receive: {receiveDraft.reduce((s, r) => s + r.actual, 0)}  •  Expected: {receiveDraft.reduce((s, r) => s + r.expected, 0)}
              </Text>
            </View>
          </ScrollView>

          <View style={[styles.receiveFooter, { backgroundColor: dark ? "#0f1729" : "#ffffff", borderTopColor: dark ? "#1e293b" : "#e2e8f0" }]}>
            <TouchableOpacity style={[styles.receiveCancelBtn, { borderColor: dark ? "#334155" : "#e2e8f0" }]} onPress={() => setShowReceiveChecklist(false)} disabled={receiveSaving}>
              <Text style={[styles.receiveCancelText, { color: dark ? "#cbd5e1" : "#475569" }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.receiveConfirmBtn, receiveSaving && styles.btnDisabled]}
              onPress={handleConfirmReceive}
              disabled={receiveSaving}
            >
              {receiveSaving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="qr-code-outline" size={18} color="#ffffff" />
                  <Text style={styles.receiveConfirmText}>Scan QR to Confirm</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showConfirmScanner}
        animationType="slide"
        onRequestClose={() => {
          setConfirmScanning(false);
          setShowConfirmScanner(false);
          setShowReceiveChecklist(true);
        }}
      >
        <View style={styles.qrModalContainer}>
          <View style={styles.qrModalHeader}>
            <TouchableOpacity
              onPress={() => {
                setConfirmScanning(false);
                setShowConfirmScanner(false);
                setShowReceiveChecklist(true);
              }}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={20} color="#17386b" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Scan QR</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={styles.qrContainer}>
            {permission?.granted ? (
              <View style={styles.cameraCard}>
                <View style={styles.cameraWrapper}>
                  <CameraView
                    key={showConfirmScanner ? "confirm-camera-mounted-2" : "confirm-camera-unmounted-2"}
                    style={styles.camera}
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                    onBarcodeScanned={confirmScanning ? undefined : ({ data }: { data: string }) => handleConfirmQrScan(data)}
                    onMountError={(e) => console.warn("[Camera] mount error", e)}
                  />
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                </View>
              </View>
            ) : (
              <View style={styles.permissionCard}>
                <View style={styles.permissionIcon}>
                  <Ionicons name="camera-outline" size={48} color="#17386b" />
                </View>
                <Text style={styles.qrTitle}>Camera permission needed</Text>
                <Text style={styles.qrSubtitle}>Allow camera access to scan the OMS Transfer QR</Text>
                <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission} activeOpacity={0.8}>
                  <Ionicons name="camera" size={16} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.permissionBtnText}>Grant Permission</Text>
                </TouchableOpacity>
              </View>
            )}
            <Text style={styles.qrTitle}>Scan OMS Transfer QR</Text>
            <Text style={styles.qrSubtitleCenter}>Point camera at {receiveTransferNumber} QR from OMS to finalize</Text>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setConfirmScanning(false);
                setShowConfirmScanner(false);
                setShowReceiveChecklist(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fbff",
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "700",
  },
  pageSubtitle: {
    fontSize: 12,
    marginTop: 3,
  },
  searchBar: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 14,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: "600",
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
    flexGrow: 0,
  },
  filterContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    minHeight: 38,
    borderRadius: 20,
    backgroundColor: "#f0f4ff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipActive: {
    backgroundColor: "#17386b",
    borderColor: "#17386b",
  },
  filterText: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    opacity: 1,
    includeFontPadding: false,
  },
  list: {
    padding: 16,
    paddingTop: 4,
  },
  transferList: {
    flex: 1,
  },
  transferCard: {
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
  },
  transferCardHighlighted: {
    backgroundColor: "#fefce8",
    borderColor: "#f59e0b",
    borderWidth: 2,
    shadowColor: "#f59e0b",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  transferCardHighlightedDark: {
    backgroundColor: "#3a2e0a",
    borderColor: "#f59e0b",
    borderWidth: 2,
    shadowColor: "#f59e0b",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
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
  scanFab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#17386b",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  scannerClose: {
    position: "absolute",
    top: 48,
    right: 16,
  },
  scannerHint: {
    position: "absolute",
    bottom: 48,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingVertical: 8,
  },
  receiveOverlay: { flex: 1 },
  receiveHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  receiveTitle: { fontSize: 18, fontWeight: "700" },
  receiveSubtitle: { fontSize: 12, marginTop: 2 },
  receiveClose: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  receiveList: { flex: 1 },
  receiveHint: {
    fontSize: 12,
    lineHeight: 16,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  receiveItemCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  receiveItemTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  receiveItemName: { fontSize: 14, fontWeight: "600" },
  receiveItemSku: { fontSize: 11, marginTop: 2 },
  receiveExpected: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 8,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  qtyBtnDisabled: { opacity: 0.5 },
  qtyValue: { fontSize: 16, fontWeight: "700", minWidth: 24, textAlign: "center" },
  notesLabel: { fontSize: 11, fontWeight: "600", marginBottom: 6 },
  notesInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    minHeight: 44,
    textAlignVertical: "top",
  },
  discrepancyNote: { fontSize: 11, marginTop: 6, fontWeight: "500" },
  receiveSummary: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  receiveSummaryText: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  receiveFooter: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
  },
  receiveCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  receiveCancelText: { fontSize: 14, fontWeight: "600" },
  receiveConfirmBtn: {
    flex: 2,
    flexDirection: "row",
    backgroundColor: "#16a34a",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  receiveConfirmText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
  qrModalContainer: { flex: 1, backgroundColor: "#f8fbff" },
  qrModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12, backgroundColor: "#f8fbff", borderBottomWidth: 1, borderBottomColor: "#eef2f7" },
  headerTitle: { fontSize: 15, fontWeight: "700", color: "#1a202c" },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e8edf3", alignItems: "center", justifyContent: "center" },
  qrContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 20 },
  cameraCard: { backgroundColor: "#ffffff", borderRadius: 20, padding: 12, borderWidth: 1, borderColor: "#e8edf3", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4, marginBottom: 20 },
  cameraWrapper: { width: 280, height: 280, borderRadius: 16, overflow: "hidden", backgroundColor: "#0f1729" },
  camera: { flex: 1 },
  corner: { position: "absolute", width: 28, height: 28, borderColor: "#ffffff" },
  cornerTL: { top: 14, left: 14, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 10 },
  cornerTR: { top: 14, right: 14, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 10 },
  cornerBL: { bottom: 14, left: 14, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 10 },
  cornerBR: { bottom: 14, right: 14, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 10 },
  cameraOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(15,23,41,0.62)", alignItems: "center", justifyContent: "center" },
  cameraOverlayText: { color: "#ffffff", fontSize: 13, fontWeight: "600", marginTop: 10 },
  permissionCard: { alignItems: "center", backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1, borderColor: "#e8edf3", paddingHorizontal: 24, paddingVertical: 28, width: "100%", maxWidth: 360, marginBottom: 20 },
  permissionIcon: { width: 80, height: 80, borderRadius: 20, backgroundColor: "#f0f4ff", borderWidth: 1, borderColor: "#e0e7ff", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  permissionBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#17386b", borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12, marginTop: 16 },
  permissionBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  qrTitle: { fontSize: 18, fontWeight: "800", color: "#1a202c", marginTop: 4, textAlign: "center" },
  qrSubtitle: { fontSize: 13, color: "#6b7b8d", textAlign: "center", marginTop: 6 },
  qrSubtitleCenter: { fontSize: 13, color: "#6b7b8d", textAlign: "center", marginTop: 8, marginBottom: 20, lineHeight: 18, paddingHorizontal: 16 },
  cancelButton: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: "#e2e8f0", backgroundColor: "#ffffff" },
  cancelButtonText: { fontSize: 13, fontWeight: "700", color: "#475569" },
});

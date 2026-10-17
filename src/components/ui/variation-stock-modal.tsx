import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { IndependentCatalogService, type IndependentStockMovement, type LossCategory, type ProductActionHistoryRow } from "@/lib/business/independent-catalog.service";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { MediaCaptureModal, type CapturedMedia } from "@/components/ui/media-capture-modal";
import { ProductAuditDetailModal } from "@/components/ui/product-audit-detail-modal";
import type { ProductDTO } from "@/lib/types/inventory";
import { usePosTheme } from "@/lib/stores/ui-store";

const LOSS_OPTIONS: Array<{ value: LossCategory; label: string }> = [
  { value: "EXPIRED", label: "Expired" }, { value: "DAMAGED", label: "Damaged" },
  { value: "SPOILED", label: "Spoiled" }, { value: "MISSING", label: "Missing" },
  { value: "QUALITY_REJECTION", label: "Quality rejection" }, { value: "INTERNAL_USE", label: "Internal use" },
  { value: "OTHER", label: "Other" },
];

export function VariationStockModal({ visible, product, dark, onClose, onSaved }: {
  visible: boolean; product: ProductDTO | null; dark: boolean; onClose: () => void; onSaved: () => void;
}) {
  const theme = usePosTheme();
  const session = useCashierStore((state) => state.session);
  const [movement, setMovement] = useState<IndependentStockMovement>("RECEIVING");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState<LossCategory>("EXPIRED");
  const [proof, setProof] = useState<CapturedMedia | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<ProductActionHistoryRow[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<ProductActionHistoryRow | null>(null);
  const { text, muted, border, surface, background, surfaceAlt: input, primary, onPrimary, accent } = theme;

  useEffect(() => {
    if (!visible || !product) return;
    setMovement("RECEIVING"); setQuantity(""); setReason(""); setCategory("EXPIRED"); setProof(null);
    IndependentCatalogService.getProductHistory(product.id).then(setHistory).catch(() => setHistory([]));
  }, [visible, product?.id]);

  const submit = async () => {
    if (!product) return;
    setSaving(true);
    try {
      if (movement === "LOSS") {
        await IndependentCatalogService.recordLoss({ productId: product.id, quantity: Number(quantity), category, reason, proofImageDataUri: proof?.dataUri || "" });
        Alert.alert("Loss recorded", "The stock deduction, reason, and proof are now in the ledger and audit log.");
      } else {
        await IndependentCatalogService.adjustStock({ productId: product.id, quantity: Number(quantity), movementType: movement, reason, createdById: session?.cashierId, createdByName: session?.cashierName });
        Alert.alert("Stock updated", "The variation stock movement was recorded.");
      }
      onSaved(); onClose();
    } catch (error: any) { Alert.alert("Variation stock", error?.message ?? "Unable to record stock movement."); }
    finally { setSaving(false); }
  };

  return <>
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.screen, { backgroundColor: background }]}>
        <View style={[styles.header, { backgroundColor: surface, borderBottomColor: border }]}><TouchableOpacity onPress={onClose} style={styles.close}><Ionicons name="close" size={23} color={text} /></TouchableOpacity><View style={{ flex: 1 }}><Text style={[styles.title, { color: text }]}>Variation Stock & Loss</Text><Text style={[styles.subtitle, { color: muted }]}>{product?.name} · {product?.description || "Standard"}</Text></View><View style={[styles.stockBadge, { backgroundColor: input }]}><Text style={[styles.stockValue, { color: primary }]}>{product?.availableQty ?? 0}</Text><Text style={[styles.stockLabel, { color: muted }]}>available</Text></View></View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
            <Text style={[styles.section, { color: text }]}>Choose stock action</Text>
            <View style={styles.row}>{(["RECEIVING", "ADJUSTMENT", "LOSS"] as IndependentStockMovement[]).map((value) => <TouchableOpacity key={value} style={[styles.choice, { borderColor: movement === value ? value === "LOSS" ? "#dc2626" : accent : border, backgroundColor: input }]} onPress={() => { setMovement(value); setProof(null); }}><Ionicons name={value === "LOSS" ? "warning-outline" : value === "RECEIVING" ? "download-outline" : "options-outline"} size={17} color={value === "LOSS" ? "#dc2626" : accent} /><Text style={{ color: text, fontWeight: "700" }}>{value === "LOSS" ? "Expired / damaged / loss" : value === "RECEIVING" ? "Receive stock" : "Positive correction"}</Text></TouchableOpacity>)}</View>
            <Text style={[styles.label, { color: text }]}>{movement === "LOSS" ? "Quantity to remove" : "Quantity to add"}</Text><TextInput style={[styles.input, { color: text, backgroundColor: input, borderColor: border }]} keyboardType="decimal-pad" value={quantity} onChangeText={setQuantity} placeholder="0" placeholderTextColor={muted} />
            {movement === "LOSS" ? <><Text style={[styles.label, { color: text }]}>Loss category</Text><View style={styles.row}>{LOSS_OPTIONS.map((option) => <TouchableOpacity key={option.value} onPress={() => setCategory(option.value)} style={[styles.category, { borderColor: category === option.value ? "#dc2626" : border, backgroundColor: input }]}><Text style={{ color: text }}>{option.label}</Text></TouchableOpacity>)}</View></> : null}
            <Text style={[styles.label, { color: text }]}>Reason / explanation</Text><TextInput style={[styles.input, styles.notes, { color: text, backgroundColor: input, borderColor: border }]} multiline value={reason} onChangeText={setReason} placeholder="Required reason" placeholderTextColor={muted} />
            {movement === "LOSS" ? <View style={styles.proofSection}><TouchableOpacity style={[styles.proofButton, { borderColor: border }]} onPress={() => setCaptureOpen(true)}><Ionicons name="camera" size={19} color={text} /><Text style={{ color: text, fontWeight: "700" }}>{proof ? "Retake proof" : "Take photo or video proof"}</Text></TouchableOpacity>{proof ? proof.kind === "photo" ? <Image source={{ uri: proof.dataUri }} style={styles.proofImage} /> : <View style={[styles.videoProof, { borderColor: border }]}><Ionicons name="videocam" size={27} color={accent} /><Text style={{ color: text }}>Video proof attached</Text></View> : null}</View> : null}
            <TouchableOpacity style={[styles.submit, { backgroundColor: primary }, saving && { opacity: 0.6 }, movement === "LOSS" && styles.lossSubmit]} disabled={saving} onPress={() => void submit()}>{saving ? <ActivityIndicator color={movement === "LOSS" ? "#fff" : onPrimary} /> : <Text style={[styles.submitText, { color: movement === "LOSS" ? "#fff" : onPrimary }]}>{movement === "LOSS" ? "Record as inventory loss" : "Save stock change"}</Text>}</TouchableOpacity>
          </View>
          {history.length ? <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}><Text style={[styles.section, { color: text }]}>Variation audit history</Text>{history.map((entry) => <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open ${entry.action.replace(/_/g, " ")} audit details`} onPress={() => setSelectedHistory(entry)} key={entry.id} style={[styles.history, { borderBottomColor: border }]}>{entry.proofImageDataUri.startsWith("data:video/") ? <View style={[styles.historyMedia, { backgroundColor: input }]}><Ionicons name="videocam" size={20} color={accent} /></View> : <Image source={{ uri: entry.proofImageDataUri }} style={styles.historyMedia} />}<View style={{ flex: 1 }}><Text style={{ color: text, fontWeight: "800" }}>{entry.action.replace(/_/g, " ")}{entry.reasonCategory ? ` · ${entry.reasonCategory.replace(/_/g, " ")}` : ""}</Text><Text style={{ color: muted }}>{entry.reason}</Text><Text style={{ color: muted, fontSize: 11 }}>{entry.createdByName || "System"} · {new Date(entry.createdAt).toLocaleString()}</Text></View><Ionicons name="chevron-forward" size={19} color={muted} /></TouchableOpacity>)}</View> : null}
        </ScrollView>
      </View>
    </Modal>
    <MediaCaptureModal visible={captureOpen} allowVideo title="Capture inventory-loss proof" onClose={() => setCaptureOpen(false)} onUse={setProof} />
    <ProductAuditDetailModal visible={selectedHistory !== null} entry={selectedHistory} dark={dark} onClose={() => setSelectedHistory(null)} />
  </>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { minHeight: 78, borderBottomWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }, close: { width: 42, height: 42, alignItems: "center", justifyContent: "center" }, title: { fontSize: 18, fontWeight: "800" }, subtitle: { fontSize: 12, marginTop: 2 }, stockBadge: { minWidth: 70, borderRadius: 9, padding: 8, alignItems: "center" }, stockValue: { fontSize: 18, fontWeight: "900" }, stockLabel: { fontSize: 10 },
  content: { padding: 18, alignItems: "center", paddingBottom: 50 }, card: { width: "100%", maxWidth: 720, borderWidth: 1, borderRadius: 12, padding: 18, marginBottom: 14 }, section: { fontSize: 17, fontWeight: "800", marginBottom: 12 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, choice: { minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 7 }, label: { fontSize: 12, fontWeight: "700", marginTop: 14, marginBottom: 6 }, input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 }, notes: { minHeight: 76, textAlignVertical: "top" }, category: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  proofSection: { marginTop: 14, gap: 10 }, proofButton: { minHeight: 45, borderWidth: 1, borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }, proofImage: { width: 150, height: 105, borderRadius: 8 }, videoProof: { width: 200, borderWidth: 1, borderRadius: 8, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }, submit: { minHeight: 48, borderRadius: 9, alignItems: "center", justifyContent: "center", marginTop: 18 }, lossSubmit: { backgroundColor: "#b91c1c" }, submitText: { fontWeight: "800" },
  history: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth }, historyMedia: { width: 46, height: 46, borderRadius: 7, alignItems: "center", justifyContent: "center" },
});

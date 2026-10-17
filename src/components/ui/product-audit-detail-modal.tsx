import React from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ProductActionHistoryRow } from "@/lib/business/independent-catalog.service";
import { usePosTheme } from "@/lib/stores/ui-store";

function label(value: string | null | undefined) {
  return value?.trim() || "Not recorded";
}

const ACTION_LABELS: Record<string, string> = {
  PRODUCT_CREATE: "Product created",
  PRODUCT_EDIT: "Product or variations changed",
  PRODUCT_ARCHIVE: "Product archived",
  PRODUCT_DELETE: "Product permanently deleted",
  INVENTORY_STOCK_CHANGE: "Stock added",
  STOCK_LOSS: "Stock removed as loss",
};

const CATEGORY_LABELS: Record<string, string> = {
  RECEIVE_STOCK: "Received new stock",
  POSITIVE_CORRECTION: "Positive stock correction",
  VARIATION_ADDED: "Added a variation",
  VARIATION_ARCHIVED: "Archived a variation",
  VARIATIONS_CHANGED: "Added and archived variations",
  PRODUCT_DETAILS_CHANGED: "Updated product details",
  EXPIRED: "Expired products",
  DAMAGED: "Damaged products",
  SPOILED: "Spoiled products",
  MISSING: "Missing products",
  QUALITY_REJECTION: "Quality rejection",
  INTERNAL_USE: "Internal use",
  OTHER: "Other recorded reason",
};

type SnapshotItem = { id?: string; name?: string; variationName?: string; sku?: string; price?: number; availableQty?: number; status?: string };

function parseSnapshot(value: string | null): SnapshotItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return (Array.isArray(parsed) ? parsed : [parsed]).filter((item) => item && typeof item === "object");
  } catch { return []; }
}

function Detail({ name, value, muted, text }: { name: string; value: string; muted: string; text: string }) {
  return <View style={styles.detail}><Text style={[styles.detailLabel, { color: muted }]}>{name}</Text><Text selectable style={[styles.detailValue, { color: text }]}>{value}</Text></View>;
}

function SnapshotList({ title, emptyText, rows, colors }: { title: string; emptyText: string; rows: SnapshotItem[]; colors: { text: string; muted: string; border: string; surfaceAlt: string } }) {
  return <View style={styles.snapshotSection}><Text style={[styles.snapshotTitle, { color: colors.text }]}>{title}</Text>{rows.length === 0 ? <Text style={[styles.snapshotEmpty, { color: colors.muted, backgroundColor: colors.surfaceAlt }]}>{emptyText}</Text> : rows.map((item, index) => <View key={`${item.id ?? item.sku ?? index}`} style={[styles.snapshotItem, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}><Text style={[styles.snapshotItemTitle, { color: colors.text }]}>{item.name || "Product"}{item.variationName ? ` — ${item.variationName}` : ""}</Text><View style={styles.snapshotFacts}><Detail name="Barcode / SKU" value={label(item.sku)} muted={colors.muted} text={colors.text} /><Detail name="Selling price" value={item.price == null ? "Not recorded" : `PHP ${Number(item.price).toFixed(2)}`} muted={colors.muted} text={colors.text} /><Detail name="Available stock" value={item.availableQty == null ? "Not recorded" : String(item.availableQty)} muted={colors.muted} text={colors.text} /><Detail name="Status" value={label(item.status)} muted={colors.muted} text={colors.text} /></View></View>)}</View>;
}

export function ProductAuditDetailModal({ visible, entry, dark: _dark, onClose }: {
  visible: boolean;
  entry: ProductActionHistoryRow | null;
  dark: boolean;
  onClose: () => void;
}) {
  const { text, muted, border, surface, background, surfaceAlt, accent } = usePosTheme();
  const isVideo = entry?.proofImageDataUri.startsWith("data:video/") ?? false;
  const beforeRows = parseSnapshot(entry?.beforeJson ?? null);
  const afterRows = parseSnapshot(entry?.afterJson ?? null);

  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <View style={[styles.screen, { backgroundColor: background }]}>
      <View style={[styles.header, { backgroundColor: surface, borderBottomColor: border }]}>
        <TouchableOpacity onPress={onClose} style={styles.close}><Ionicons name="close" size={24} color={text} /></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={[styles.title, { color: text }]}>Audit Details</Text><Text style={[styles.subtitle, { color: muted }]}>Complete recorded product action</Text></View>
      </View>
      {entry ? <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <View style={styles.actionRow}><View style={[styles.actionIcon, { backgroundColor: surfaceAlt }]}><Ionicons name="document-text-outline" size={25} color={accent} /></View><View style={{ flex: 1 }}><Text style={[styles.action, { color: text }]}>{ACTION_LABELS[entry.action] ?? entry.action.replace(/_/g, " ")}</Text><Text style={{ color: muted }}>{new Date(entry.createdAt).toLocaleString()}</Text></View></View>
          <Detail name="What was done" value={entry.reasonCategory ? (CATEGORY_LABELS[entry.reasonCategory] ?? entry.reasonCategory.replace(/_/g, " ")) : (ACTION_LABELS[entry.action] ?? entry.action.replace(/_/g, " "))} muted={muted} text={text} />
          <Detail name="Reason / explanation" value={label(entry.reason)} muted={muted} text={text} />
          <View style={styles.grid}>
            <Detail name="Quantity affected" value={entry.quantity == null ? "Not applicable to this action" : `${entry.action === "STOCK_LOSS" ? "Removed" : entry.action === "INVENTORY_STOCK_CHANGE" ? "Added" : "Variations affected"} ${entry.quantity}`} muted={muted} text={text} />
            <Detail name="Stock balance" value={entry.balanceBefore == null && entry.balanceAfter == null ? "Not applicable to this action" : `${entry.balanceBefore ?? "Unknown"} before → ${entry.balanceAfter ?? "Unknown"} after`} muted={muted} text={text} />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.section, { color: text }]}>Proof evidence</Text>
          <Text style={[styles.evidenceType, { color: muted }]}>{isVideo ? "Video" : "Photo"} evidence · stored with this audit record</Text>
          {isVideo ? <View style={[styles.video, { borderColor: border }]}><Ionicons name="videocam" size={46} color={accent} /><Text style={[styles.videoTitle, { color: text }]}>Video proof attached</Text><Text style={{ color: muted, textAlign: "center" }}>The original recording is retained in local audit data and recoverable backups.</Text></View> : <Image source={{ uri: entry.proofImageDataUri }} style={styles.image} resizeMode="contain" />}
        </View>

        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.section, { color: text }]}>Who and where</Text>
          <Text style={[styles.identityHelp, { color: muted }]}>These details identify who made the change and which dealership terminal recorded it.</Text>
          <View style={styles.grid}><Detail name="Team member" value={label(entry.createdByName)} muted={muted} text={text} /><Detail name="Dealership" value={label(entry.businessId)} muted={muted} text={text} /><Detail name="POS device" value={label(entry.deviceId)} muted={muted} text={text} /><Detail name="Product variation reference" value={label(entry.productId)} muted={muted} text={text} /></View>
          <View style={[styles.technicalReferences, { borderTopColor: border }]}><Text style={[styles.technicalTitle, { color: text }]}>Reference numbers</Text><Detail name="Audit reference" value={entry.id} muted={muted} text={text} /><Detail name="Product group reference" value={label(entry.productCode)} muted={muted} text={text} /><Detail name="User reference" value={label(entry.createdById)} muted={muted} text={text} /></View>
        </View>

        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.section, { color: text }]}>Product record changes</Text>
          <Text style={[styles.identityHelp, { color: muted }]}>A readable copy of the product and variation details saved at the time of this action.</Text>
          <SnapshotList title="Before the change" emptyText="No earlier product snapshot was needed for this action." rows={beforeRows} colors={{ text, muted, border, surfaceAlt }} />
          <SnapshotList title="After the change" emptyText="No updated product snapshot was needed for this action." rows={afterRows} colors={{ text, muted, border, surfaceAlt }} />
        </View>
      </ScrollView> : null}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { minHeight: 76, borderBottomWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }, close: { width: 42, height: 42, alignItems: "center", justifyContent: "center" }, title: { fontSize: 19, fontWeight: "900" }, subtitle: { fontSize: 12, marginTop: 2 },
  content: { padding: 18, paddingBottom: 48, alignItems: "center" }, card: { width: "100%", maxWidth: 720, borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 13 }, actionRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }, actionIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" }, action: { fontSize: 18, fontWeight: "900", textTransform: "capitalize" }, section: { fontSize: 16, fontWeight: "900", marginBottom: 10 },
  detail: { flex: 1, minWidth: 170, marginBottom: 11 }, detailLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 }, detailValue: { fontSize: 14, lineHeight: 20 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: 18 }, evidenceType: { fontSize: 12, marginBottom: 12 }, image: { width: "100%", height: 300, borderRadius: 9, backgroundColor: "#020617" }, video: { minHeight: 210, borderWidth: 1, borderRadius: 9, padding: 24, alignItems: "center", justifyContent: "center", gap: 8 }, videoTitle: { fontSize: 17, fontWeight: "800" }, identityHelp: { fontSize: 12, lineHeight: 18, marginBottom: 14 }, technicalReferences: { borderTopWidth: 1, paddingTop: 13, marginTop: 2 }, technicalTitle: { fontSize: 14, fontWeight: "800", marginBottom: 10 }, snapshotSection: { marginTop: 8 }, snapshotTitle: { fontSize: 14, fontWeight: "900", marginBottom: 8 }, snapshotEmpty: { padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 12 }, snapshotItem: { borderWidth: 1, borderRadius: 9, padding: 12, marginBottom: 10 }, snapshotItemTitle: { fontSize: 14, fontWeight: "900", marginBottom: 10 }, snapshotFacts: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
});

import React from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ProductActionHistoryRow } from "@/lib/business/independent-catalog.service";

function label(value: string | null | undefined) {
  return value?.trim() || "Not recorded";
}

function snapshot(value: string | null) {
  if (!value) return "Not recorded";
  try { return JSON.stringify(JSON.parse(value), null, 2); }
  catch { return value; }
}

function Detail({ name, value, muted, text }: { name: string; value: string; muted: string; text: string }) {
  return <View style={styles.detail}><Text style={[styles.detailLabel, { color: muted }]}>{name}</Text><Text selectable style={[styles.detailValue, { color: text }]}>{value}</Text></View>;
}

export function ProductAuditDetailModal({ visible, entry, dark, onClose }: {
  visible: boolean;
  entry: ProductActionHistoryRow | null;
  dark: boolean;
  onClose: () => void;
}) {
  const text = dark ? "#f8fafc" : "#172033";
  const muted = dark ? "#94a3b8" : "#64748b";
  const border = dark ? "#334155" : "#dbe3ec";
  const surface = dark ? "#111827" : "#ffffff";
  const background = dark ? "#050a14" : "#f4f6f8";
  const isVideo = entry?.proofImageDataUri.startsWith("data:video/") ?? false;

  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <View style={[styles.screen, { backgroundColor: background }]}>
      <View style={[styles.header, { backgroundColor: surface, borderBottomColor: border }]}>
        <TouchableOpacity onPress={onClose} style={styles.close}><Ionicons name="close" size={24} color={text} /></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={[styles.title, { color: text }]}>Audit Details</Text><Text style={[styles.subtitle, { color: muted }]}>Complete recorded product action</Text></View>
      </View>
      {entry ? <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <View style={styles.actionRow}><View style={styles.actionIcon}><Ionicons name="document-text-outline" size={25} color="#2563eb" /></View><View style={{ flex: 1 }}><Text style={[styles.action, { color: text }]}>{entry.action.replace(/_/g, " ")}</Text><Text style={{ color: muted }}>{new Date(entry.createdAt).toLocaleString()}</Text></View></View>
          <Detail name="Reason category" value={label(entry.reasonCategory?.replace(/_/g, " "))} muted={muted} text={text} />
          <Detail name="Reason / explanation" value={label(entry.reason)} muted={muted} text={text} />
          <View style={styles.grid}>
            <Detail name="Quantity" value={entry.quantity == null ? "Not applicable" : String(entry.quantity)} muted={muted} text={text} />
            <Detail name="Stock balance" value={entry.balanceBefore == null && entry.balanceAfter == null ? "Not applicable" : `${entry.balanceBefore ?? "?"} → ${entry.balanceAfter ?? "?"}`} muted={muted} text={text} />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.section, { color: text }]}>Proof evidence</Text>
          <Text style={[styles.evidenceType, { color: muted }]}>{isVideo ? "Video" : "Photo"} evidence · stored with this audit record</Text>
          {isVideo ? <View style={[styles.video, { borderColor: border }]}><Ionicons name="videocam" size={46} color="#2563eb" /><Text style={[styles.videoTitle, { color: text }]}>Video proof attached</Text><Text style={{ color: muted, textAlign: "center" }}>The original recording is retained in local audit data and recoverable backups.</Text></View> : <Image source={{ uri: entry.proofImageDataUri }} style={styles.image} resizeMode="contain" />}
        </View>

        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.section, { color: text }]}>Audit identity</Text>
          <Detail name="Recorded by" value={label(entry.createdByName)} muted={muted} text={text} />
          <Detail name="User ID" value={label(entry.createdById)} muted={muted} text={text} />
          <Detail name="Business ID" value={label(entry.businessId)} muted={muted} text={text} />
          <Detail name="Product / variation ID" value={label(entry.productId)} muted={muted} text={text} />
          <Detail name="Product group ID" value={label(entry.productCode)} muted={muted} text={text} />
          <Detail name="Device ID" value={label(entry.deviceId)} muted={muted} text={text} />
          <Detail name="Audit record ID" value={entry.id} muted={muted} text={text} />
        </View>

        <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.section, { color: text }]}>Recorded snapshots</Text>
          <Text style={[styles.detailLabel, { color: muted }]}>Before</Text><Text selectable style={[styles.snapshot, { color: text, backgroundColor: background }]}>{snapshot(entry.beforeJson)}</Text>
          <Text style={[styles.detailLabel, { color: muted }]}>After</Text><Text selectable style={[styles.snapshot, { color: text, backgroundColor: background }]}>{snapshot(entry.afterJson)}</Text>
        </View>
      </ScrollView> : null}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { minHeight: 76, borderBottomWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }, close: { width: 42, height: 42, alignItems: "center", justifyContent: "center" }, title: { fontSize: 19, fontWeight: "900" }, subtitle: { fontSize: 12, marginTop: 2 },
  content: { padding: 18, paddingBottom: 48, alignItems: "center" }, card: { width: "100%", maxWidth: 720, borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 13 }, actionRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }, actionIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#dbeafe", alignItems: "center", justifyContent: "center" }, action: { fontSize: 18, fontWeight: "900", textTransform: "capitalize" }, section: { fontSize: 16, fontWeight: "900", marginBottom: 10 },
  detail: { flex: 1, minWidth: 170, marginBottom: 11 }, detailLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 }, detailValue: { fontSize: 14, lineHeight: 20 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: 18 }, evidenceType: { fontSize: 12, marginBottom: 12 }, image: { width: "100%", height: 300, borderRadius: 9, backgroundColor: "#020617" }, video: { minHeight: 210, borderWidth: 1, borderRadius: 9, padding: 24, alignItems: "center", justifyContent: "center", gap: 8 }, videoTitle: { fontSize: 17, fontWeight: "800" }, snapshot: { fontFamily: "monospace", fontSize: 12, lineHeight: 18, padding: 12, borderRadius: 8, marginBottom: 14 },
});

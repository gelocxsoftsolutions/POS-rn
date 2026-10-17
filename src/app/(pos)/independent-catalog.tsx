import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { IndependentCatalogService, type ProductActionHistoryRow } from "@/lib/business/independent-catalog.service";
import { useBusinessConfigStore } from "@/lib/stores/business-config-store";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useIsDarkTheme, usePosTheme } from "@/lib/stores/ui-store";
import { SUPER_ADMIN_ID } from "@/lib/services/cashier.service";
import { MediaCaptureModal, type CapturedMedia } from "@/components/ui/media-capture-modal";
import { ProductAuditDetailModal } from "@/components/ui/product-audit-detail-modal";

interface VariationForm { key: string; id?: string; name: string; price: string; stock: string; currentStock?: number }
function dataUri(asset: ImagePicker.ImagePickerAsset): string | null {
  if (!asset.base64) return null;
  return `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`;
}

export default function IndependentCatalogScreen() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const { width } = useWindowDimensions();
  const dark = useIsDarkTheme();
  const theme = usePosTheme();
  const mode = useBusinessConfigStore((s) => s.configuration.operatingMode);
  const session = useCashierStore((s) => s.session);
  const isSystemSuperAdmin = session?.cashierId === SUPER_ADMIN_ID;
  const [productName, setProductName] = useState("");
  const [productImage, setProductImage] = useState<string | null>(null);
  const [imageChanged, setImageChanged] = useState(false);
  const [variations, setVariations] = useState<VariationForm[]>([{ key: "new-1", name: "Standard", price: "", stock: "" }]);
  const [editReason, setEditReason] = useState("");
  const [editProof, setEditProof] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [captureTarget, setCaptureTarget] = useState<"product" | "edit" | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [history, setHistory] = useState<ProductActionHistoryRow[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<ProductActionHistoryRow | null>(null);
  const editingId = typeof edit === "string" && edit ? edit : null;

  useEffect(() => { if (mode !== "INDEPENDENT") router.replace("/(pos)/products" as any); }, [mode, router]);
  useEffect(() => {
    if (!editingId) return;
    setLoadingEdit(true);
    Promise.all([IndependentCatalogService.getProductGroup(editingId), IndependentCatalogService.getProductHistory(editingId)]).then(([group, auditRows]) => {
      if (!group.length) throw new Error("Product not found.");
      setProductName(group[0].name);
      setProductImage(group[0].imageUrl ?? null);
      setImageChanged(false);
      setVariations(group.map((item) => ({ key: item.id, id: item.id, name: item.description || "Standard", price: String(item.retailPrice ?? 0), stock: "", currentStock: Number(item.availableQty ?? 0) })));
      setHistory(auditRows);
    }).catch((error: any) => Alert.alert("Edit product", error?.message ?? "Unable to load product."))
      .finally(() => setLoadingEdit(false));
  }, [editingId]);

  const palette = useMemo(() => ({
    bg: theme.background, surface: theme.surface, input: theme.surfaceAlt,
    border: theme.border, text: theme.text, muted: theme.muted,
  }), [theme.background, theme.surface, theme.surfaceAlt, theme.border, theme.text, theme.muted]);

  const pickProductPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, base64: true });
      if (result.canceled) return;
      const uri = dataUri(result.assets[0]);
      if (!uri) throw new Error("The selected image could not be read.");
      setProductImage(uri); setImageChanged(true);
    } catch (error: any) { Alert.alert("Product photo", error?.message ?? "Unable to use that photo."); }
  };

  const handleCapturedMedia = (media: CapturedMedia) => {
    if (captureTarget === "product") { setProductImage(media.dataUri); setImageChanged(true); }
    if (captureTarget === "edit") setEditProof(media.dataUri);
  };

  const updateVariation = (key: string, field: "name" | "price" | "stock", value: string) => setVariations((rows) => rows.map((row) => row.key === key ? { ...row, [field]: value } : row));
  const addVariation = () => setVariations((rows) => [...rows, { key: `new-${Date.now()}`, name: "", price: "", stock: "" }]);
  const removeVariation = (key: string) => {
    if (variations.length === 1) return Alert.alert("Variation required", "A product must have at least one variation.");
    const variation = variations.find((row) => row.key === key);
    if (variation?.id && Number(variation.currentStock ?? 0) !== 0) {
      return Alert.alert("Stock must be zero", "Record sales, transfers, or an evidence-backed loss until this variation reaches zero stock before removing it.");
    }
    setVariations((rows) => rows.filter((row) => row.key !== key));
  };

  const resetForm = () => {
    setProductName(""); setProductImage(null); setImageChanged(false);
    setVariations([{ key: `new-${Date.now()}`, name: "Standard", price: "", stock: "" }]);
    setEditReason(""); setEditProof(null); setDeleteConfirmation("");
  };

  const saveProduct = async () => {
    setSaving(true);
    try {
      const drafts = variations.map((row) => ({ id: row.id, variationName: row.name, price: Number(row.price), stock: row.id ? undefined : Number(row.stock || 0) }));
      if (editingId) {
        await IndependentCatalogService.updateProduct({ productId: editingId, productName, imageDataUri: imageChanged ? productImage : undefined, variations: drafts, reason: editReason, proofImageDataUri: editProof || "" });
        Alert.alert("Product updated", "The change, reason, and proof were recorded in the audit history.");
        router.replace("/(pos)/products" as any);
      } else {
        await IndependentCatalogService.createProduct({ productName, imageDataUri: productImage, variations: drafts, createdById: session?.cashierId, createdByName: session?.cashierName });
        Alert.alert("Product added", "Variations and Code 128 barcodes are ready for checkout.");
        resetForm();
      }
    } catch (error: any) { Alert.alert(editingId ? "Edit product" : "Add product", error?.message ?? "Unable to save product."); }
    finally { setSaving(false); }
  };

  const archive = () => {
    if (!editingId) return;
    Alert.alert("Archive product?", "The product will leave checkout but remain in history.", [
      { text: "Cancel", style: "cancel" },
      { text: "Archive", style: "destructive", onPress: async () => {
        try { await IndependentCatalogService.archiveProduct({ productId: editingId, reason: editReason, proofImageDataUri: editProof || "" }); router.replace("/(pos)/products" as any); }
        catch (error: any) { Alert.alert("Archive product", error?.message ?? "Unable to archive product."); }
      } },
    ]);
  };

  const permanentlyDelete = () => {
    if (!editingId) return;
    Alert.alert("Permanently delete product?", "This succeeds only when the product has no sales, transfers, inventory movements, mappings, or stock. It cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete permanently", style: "destructive", onPress: async () => {
        try { await IndependentCatalogService.permanentlyDeleteProduct({ productId: editingId, reason: editReason, proofImageDataUri: editProof || "", confirmation: deleteConfirmation }); router.replace("/(pos)/products" as any); }
        catch (error: any) { Alert.alert("Delete product", error?.message ?? "Unable to delete product."); }
      } },
    ]);
  };

  const inputStyle = [styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.input }];
  if (loadingEdit) return <View style={[styles.loading, { backgroundColor: palette.bg }]}><ActivityIndicator size="large" color={theme.accent} /></View>;
  return <ScrollView style={[styles.screen, { backgroundColor: palette.bg }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><TouchableOpacity style={[styles.back, { borderColor: palette.border, backgroundColor: palette.surface }]} onPress={() => router.back()}><Ionicons name="arrow-back" size={20} color={palette.text} /></TouchableOpacity><View style={{ flex: 1 }}><Text style={[styles.title, { color: palette.text }]}>{editingId ? "Edit Product" : "Add Product to Inventory"}</Text><Text style={[styles.subtitle, { color: palette.muted }]}>{editingId ? "Reuse the product form while preserving barcode identity and history" : "Create an offline product with one or more variations"}</Text></View></View>

    <View style={[styles.card, styles.formLayout, width < 760 && styles.formStack, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <View style={styles.photoColumn}>
        <View style={[styles.photoFrame, { backgroundColor: palette.input, borderColor: palette.border }]}>{productImage ? <Image source={{ uri: productImage }} style={styles.photo} resizeMode="contain" /> : <><Ionicons name="image-outline" size={54} color={palette.muted} /><Text style={{ color: palette.muted }}>Product photo</Text></>}</View>
        <View style={styles.row}><TouchableOpacity style={[styles.secondary, { borderColor: palette.border }]} onPress={() => void pickProductPhoto()}><Ionicons name="images-outline" size={17} color={palette.text} /><Text style={{ color: palette.text }}>Upload</Text></TouchableOpacity><TouchableOpacity style={[styles.secondary, { borderColor: palette.border }]} onPress={() => setCaptureTarget("product")}><Ionicons name="camera-outline" size={17} color={palette.text} /><Text style={{ color: palette.text }}>Camera</Text></TouchableOpacity></View>
      </View>
      <View style={styles.settingsColumn}>
        <Text style={[styles.section, { color: palette.text }]}>Product settings</Text>
        <Text style={[styles.label, { color: palette.text }]}>Product name</Text><TextInput style={inputStyle} placeholder="Product name" placeholderTextColor={palette.muted} value={productName} onChangeText={setProductName} />
        <View style={styles.sectionHeader}><Text style={[styles.section, { color: palette.text, marginBottom: 0 }]}>Variations</Text><TouchableOpacity onPress={addVariation} style={[styles.addSmall, { backgroundColor: theme.primary }]}><Ionicons name="add" size={17} color={theme.onPrimary} /><Text style={[styles.white, { color: theme.onPrimary }]}>Add variation</Text></TouchableOpacity></View>
        {variations.map((row, index) => <View key={row.key} style={[styles.variation, { backgroundColor: palette.input, borderColor: palette.border }]}>
          <View style={styles.variationTitle}><Text style={[styles.label, { color: palette.text, marginBottom: 0 }]}>Variation {index + 1}</Text><TouchableOpacity onPress={() => removeVariation(row.key)}><Ionicons name="trash-outline" size={19} color="#dc2626" /></TouchableOpacity></View>
          <TextInput style={inputStyle} placeholder="Variation name" placeholderTextColor={palette.muted} value={row.name} onChangeText={(value) => updateVariation(row.key, "name", value)} />
          <View style={styles.row}><TextInput style={[inputStyle, styles.flex]} placeholder="Price" keyboardType="decimal-pad" placeholderTextColor={palette.muted} value={row.price} onChangeText={(value) => updateVariation(row.key, "price", value)} />{row.id ? <View style={[styles.stockReadOnly, { borderColor: palette.border }]}><Text style={{ color: palette.muted, fontSize: 11 }}>Current stock</Text><Text style={{ color: palette.text, fontWeight: "800" }}>{row.currentStock ?? 0}</Text></View> : <TextInput style={[inputStyle, styles.flex]} placeholder="Stock (optional)" keyboardType="decimal-pad" placeholderTextColor={palette.muted} value={row.stock} onChangeText={(value) => updateVariation(row.key, "stock", value)} />}</View>
        </View>)}
        {editingId ? <View style={[styles.evidenceBox, { borderColor: palette.border }]}><Text style={[styles.section, { color: palette.text }]}>Required change evidence</Text><TextInput style={[inputStyle, styles.notes]} placeholder="Reason for editing or archiving" placeholderTextColor={palette.muted} value={editReason} onChangeText={setEditReason} multiline /><TouchableOpacity style={[styles.secondary, { borderColor: palette.border }]} onPress={() => setCaptureTarget("edit")}><Ionicons name="camera" size={17} color={palette.text} /><Text style={{ color: palette.text }}>{editProof ? "Retake proof" : "Take photo or video proof"}</Text></TouchableOpacity>{editProof ? editProof.startsWith("data:video/") ? <View style={[styles.videoProof, { borderColor: palette.border, backgroundColor: theme.surfaceAlt }]}><Ionicons name="videocam" size={24} color={theme.accent} /><Text style={{ color: palette.text }}>Video proof attached</Text></View> : <Image source={{ uri: editProof }} style={styles.proofPreview} /> : null}</View> : null}
        <TouchableOpacity style={[styles.primary, { backgroundColor: theme.primary }]} disabled={saving} onPress={() => void saveProduct()}>{saving ? <ActivityIndicator color={theme.onPrimary} /> : <Text style={[styles.white, { color: theme.onPrimary }]}>{editingId ? "Save Changes" : "Add product and variations"}</Text>}</TouchableOpacity>
        {editingId ? <View style={styles.dangerRow}><TouchableOpacity style={[styles.archive, { borderColor: "#d97706" }]} onPress={archive}><Text style={{ color: "#d97706", fontWeight: "800" }}>Archive product</Text></TouchableOpacity>{isSystemSuperAdmin ? <View style={styles.deleteArea}><TextInput style={[inputStyle, { marginBottom: 5 }]} placeholder={`Type DELETE ${productName}`} placeholderTextColor={palette.muted} value={deleteConfirmation} onChangeText={setDeleteConfirmation} /><TouchableOpacity style={styles.delete} onPress={permanentlyDelete}><Ionicons name="trash" size={17} color="#fff" /><Text style={styles.white}>Delete permanently</Text></TouchableOpacity></View> : null}</View> : null}
      </View>
    </View>

    {editingId && history.length > 0 ? <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}><Text style={[styles.section, { color: palette.text }]}>Product action history</Text>{history.map((entry) => <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open ${entry.action.replace(/_/g, " ")} audit details`} onPress={() => setSelectedHistory(entry)} key={entry.id} style={[styles.historyRow, { borderBottomColor: palette.border }]}>{entry.proofImageDataUri.startsWith("data:video/") ? <View style={[styles.historyProof, styles.historyVideo, { backgroundColor: theme.surfaceAlt }]}><Ionicons name="videocam" size={22} color={theme.accent} /></View> : <Image source={{ uri: entry.proofImageDataUri }} style={styles.historyProof} />}<View style={{ flex: 1 }}><Text style={{ color: palette.text, fontWeight: "800" }}>{entry.action.replace(/_/g, " ")}{entry.reasonCategory ? ` · ${entry.reasonCategory.replace(/_/g, " ")}` : ""}</Text><Text style={{ color: palette.muted, marginTop: 2 }}>{entry.reason}</Text><Text style={{ color: palette.muted, fontSize: 11, marginTop: 4 }}>{entry.createdByName || "System"} · {new Date(entry.createdAt).toLocaleString()}</Text></View>{entry.quantity != null ? <Text style={{ color: palette.text, fontWeight: "800" }}>−{entry.quantity}</Text> : null}<Ionicons name="chevron-forward" size={19} color={palette.muted} /></TouchableOpacity>)}</View> : null}
    <MediaCaptureModal visible={captureTarget !== null} allowVideo={captureTarget === "edit"} title={captureTarget === "product" ? "Take product photo" : "Capture change proof"} onClose={() => setCaptureTarget(null)} onUse={handleCapturedMedia} />
    <ProductAuditDetailModal visible={selectedHistory !== null} entry={selectedHistory} dark={dark} onClose={() => setSelectedHistory(null)} />
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, loading: { flex: 1, alignItems: "center", justifyContent: "center" }, content: { padding: 20, paddingBottom: 60, alignItems: "center" },
  header: { width: "100%", maxWidth: 980, flexDirection: "row", alignItems: "center", marginBottom: 18 }, back: { width: 40, height: 40, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 12 },
  title: { fontSize: 23, fontWeight: "800" }, subtitle: { fontSize: 12, marginTop: 2, lineHeight: 18 }, card: { width: "100%", maxWidth: 980, borderWidth: 1, borderRadius: 12, padding: 18, marginBottom: 16 },
  formLayout: { flexDirection: "row", gap: 22, alignItems: "flex-start" }, formStack: { flexDirection: "column" }, photoColumn: { width: 260, maxWidth: "100%", gap: 10 }, settingsColumn: { flex: 1, minWidth: 0 }, photoFrame: { width: "100%", aspectRatio: 1, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 8, overflow: "hidden" }, photo: { width: "100%", height: "100%" },
  section: { fontSize: 17, fontWeight: "800", marginBottom: 12 }, sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8, marginBottom: 10 }, label: { fontSize: 12, fontWeight: "700", marginBottom: 6 }, input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, minWidth: 100 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }, flex: { flex: 1 }, primary: { minHeight: 45, borderRadius: 8, backgroundColor: "#17386b", alignItems: "center", justifyContent: "center", paddingHorizontal: 16, marginTop: 4 }, secondary: { minHeight: 42, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 13, flexDirection: "row", gap: 6 }, white: { color: "#fff", fontWeight: "800" }, addSmall: { borderRadius: 7, backgroundColor: "#2563eb", paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", gap: 5 },
  variation: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 10 }, variationTitle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }, stockReadOnly: { flex: 1, borderWidth: 1, borderRadius: 8, minHeight: 43, paddingHorizontal: 12, justifyContent: "center", marginBottom: 10 },
  evidenceBox: { borderTopWidth: 1, paddingTop: 14, marginTop: 8 }, notes: { minHeight: 72, textAlignVertical: "top" }, proofPreview: { width: 140, height: 100, resizeMode: "cover", borderRadius: 8, marginTop: 10 }, videoProof: { width: 180, borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  dangerRow: { marginTop: 16, gap: 10 }, archive: { borderWidth: 1, borderRadius: 8, minHeight: 43, alignItems: "center", justifyContent: "center" }, deleteArea: { gap: 4 }, delete: { backgroundColor: "#b91c1c", borderRadius: 8, minHeight: 43, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  historyRow: { flexDirection: "row", gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: "center" }, historyProof: { width: 52, height: 52, borderRadius: 7 }, historyVideo: { backgroundColor: "#dbeafe", alignItems: "center", justifyContent: "center" },
});

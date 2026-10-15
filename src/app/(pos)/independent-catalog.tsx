import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ProductService } from "@/lib/services/product.service";
import { IndependentCatalogService, type IndependentStockMovement } from "@/lib/business/independent-catalog.service";
import { useBusinessConfigStore } from "@/lib/stores/business-config-store";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useIsDarkTheme } from "@/lib/stores/ui-store";
import { Code128Barcode } from "@/components/ui/code128-barcode";
import type { ProductDTO } from "@/lib/types/inventory";

export default function IndependentCatalogScreen() {
  const router = useRouter();
  const dark = useIsDarkTheme();
  const mode = useBusinessConfigStore((s) => s.configuration.operatingMode);
  const session = useCashierStore((s) => s.session);
  const [name, setName] = useState(""); const [variation, setVariation] = useState("");
  const [price, setPrice] = useState(""); const [openingStock, setOpeningStock] = useState("0");
  const [minimumStock, setMinimumStock] = useState("0"); const [saving, setSaving] = useState(false);
  const [createdBarcode, setCreatedBarcode] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [selected, setSelected] = useState<ProductDTO | null>(null);
  const [movement, setMovement] = useState<IndependentStockMovement>("RECEIVING");
  const [quantity, setQuantity] = useState(""); const [reason, setReason] = useState("");

  useEffect(() => { if (mode !== "INDEPENDENT") router.replace("/(pos)/products" as any); }, [mode, router]);
  const load = useCallback(async () => {
    const result = await ProductService.search({ page: 1, pageSize: 500 });
    setProducts(result.items.filter((item) => item.identitySource === "INDEPENDENT"));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setSaving(true);
    try {
      const result = await ProductService.createIndependentVariation({
        productName: name, variationName: variation, price: Number(price),
        openingStock: Number(openingStock), minimumStock: Number(minimumStock),
        createdById: session?.cashierId, createdByName: session?.cashierName,
      });
      setCreatedBarcode(result.barcode); setName(""); setVariation(""); setPrice(""); setOpeningStock("0");
      await load();
    } catch (error: any) { Alert.alert("Create variation", error?.message ?? "Unable to create variation."); }
    finally { setSaving(false); }
  };

  const adjust = async () => {
    if (!selected) return;
    let delta = Number(quantity);
    if (movement === "DAMAGE") delta = -Math.abs(delta);
    try {
      await IndependentCatalogService.adjustStock({ productId: selected.id, quantity: delta, movementType: movement, reason, createdById: session?.cashierId, createdByName: session?.cashierName });
      setSelected(null); setQuantity(""); setReason(""); await load();
    } catch (error: any) { Alert.alert("Stock movement", error?.message ?? "Unable to update stock."); }
  };

  const surface = dark ? "#141922" : "#ffffff"; const border = dark ? "#334155" : "#dbe3ec"; const text = dark ? "#f8fafc" : "#172033"; const muted = dark ? "#94a3b8" : "#64748b";
  const inputStyle = [styles.input, { color: text, borderColor: border, backgroundColor: dark ? "#0f141d" : "#f8fafc" }];
  return <ScrollView style={[styles.screen, { backgroundColor: dark ? "#0b0f16" : "#f4f6f8" }]} contentContainerStyle={styles.content}>
    <View style={styles.header}><TouchableOpacity style={[styles.back, { borderColor: border, backgroundColor: surface }]} onPress={() => router.back()}><Ionicons name="arrow-back" size={20} color={text} /></TouchableOpacity><View><Text style={[styles.title, { color: text }]}>Independent Catalog</Text><Text style={[styles.subtitle, { color: muted }]}>Offline products, variations, barcodes, and stock</Text></View></View>
    <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}><Text style={[styles.section, { color: text }]}>Create product variation</Text><TextInput style={inputStyle} placeholder="Product name" placeholderTextColor={muted} value={name} onChangeText={setName} /><TextInput style={inputStyle} placeholder="Variation name / description" placeholderTextColor={muted} value={variation} onChangeText={setVariation} /><View style={styles.row}><TextInput style={[inputStyle, styles.flex]} placeholder="Price" keyboardType="decimal-pad" placeholderTextColor={muted} value={price} onChangeText={setPrice} /><TextInput style={[inputStyle, styles.flex]} placeholder="Opening stock" keyboardType="decimal-pad" placeholderTextColor={muted} value={openingStock} onChangeText={setOpeningStock} /><TextInput style={[inputStyle, styles.flex]} placeholder="Minimum stock" keyboardType="decimal-pad" placeholderTextColor={muted} value={minimumStock} onChangeText={setMinimumStock} /></View><TouchableOpacity style={styles.primary} disabled={saving} onPress={() => void create()}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.white}>Create variation and Code 128 barcode</Text>}</TouchableOpacity>{createdBarcode ? <View style={styles.barcode}><Code128Barcode value={createdBarcode} height={72} dark={dark} /><Text selectable style={[styles.barcodeText, { color: text }]}>{createdBarcode}</Text></View> : null}</View>
    <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}><Text style={[styles.section, { color: text }]}>Independent stock</Text><Text style={[styles.subtitle, { color: muted, marginBottom: 10 }]}>Select a variation to receive or adjust stock. Every movement requires a reason and is written to the local ledger.</Text>{products.map((product) => <TouchableOpacity key={product.id} style={[styles.product, { borderColor: border }]} onPress={() => setSelected(product)}><View style={{ flex: 1 }}><Text style={[styles.productName, { color: text }]}>{product.name}</Text><Text style={{ color: muted, fontSize: 11 }}>{product.sku} · Stock {product.availableQty ?? 0}</Text></View><Ionicons name="create-outline" size={20} color="#2563eb" /></TouchableOpacity>)}</View>
    {selected ? <View style={[styles.card, { backgroundColor: surface, borderColor: "#2563eb" }]}><Text style={[styles.section, { color: text }]}>Stock movement: {selected.name}</Text><View style={styles.row}>{(["RECEIVING", "ADJUSTMENT", "DAMAGE"] as IndependentStockMovement[]).map((value) => <TouchableOpacity key={value} style={[styles.choice, { borderColor: movement === value ? "#2563eb" : border }]} onPress={() => setMovement(value)}><Text style={{ color: text, fontSize: 11 }}>{value}</Text></TouchableOpacity>)}</View><TextInput style={inputStyle} placeholder={movement === "DAMAGE" ? "Damaged quantity" : "Quantity change (+ or -)"} keyboardType="numbers-and-punctuation" placeholderTextColor={muted} value={quantity} onChangeText={setQuantity} /><TextInput style={[inputStyle, styles.notes]} placeholder="Required reason" placeholderTextColor={muted} value={reason} onChangeText={setReason} multiline /><View style={styles.row}><TouchableOpacity style={[styles.secondary, { borderColor: border }]} onPress={() => setSelected(null)}><Text style={{ color: text }}>Cancel</Text></TouchableOpacity><TouchableOpacity style={[styles.primary, styles.flex]} onPress={() => void adjust()}><Text style={styles.white}>Post stock movement</Text></TouchableOpacity></View></View> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, content: { padding: 20, paddingBottom: 50, alignItems: "center" }, header: { width: "100%", maxWidth: 780, flexDirection: "row", alignItems: "center", marginBottom: 18 }, back: { width: 40, height: 40, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 12 }, title: { fontSize: 23, fontWeight: "800" }, subtitle: { fontSize: 12, marginTop: 2 }, card: { width: "100%", maxWidth: 780, borderWidth: 1, borderRadius: 10, padding: 18, marginBottom: 16 }, section: { fontSize: 17, fontWeight: "800", marginBottom: 12 }, input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, minWidth: 120 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, flex: { flex: 1 }, primary: { minHeight: 44, borderRadius: 8, backgroundColor: "#17386b", alignItems: "center", justifyContent: "center", paddingHorizontal: 16 }, secondary: { minHeight: 44, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 }, white: { color: "#ffffff", fontWeight: "800" }, barcode: { alignItems: "center", marginTop: 18 }, barcodeText: { fontSize: 14, fontWeight: "800", marginTop: 6, letterSpacing: 1 }, product: { borderWidth: 1, borderRadius: 8, padding: 12, flexDirection: "row", alignItems: "center", marginBottom: 8 }, productName: { fontSize: 14, fontWeight: "700" }, choice: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 10 }, notes: { minHeight: 70, textAlignVertical: "top" } });

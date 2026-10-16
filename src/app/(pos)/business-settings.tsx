import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Directory, File, Paths } from "expo-file-system";
import { BusinessConfigurationService } from "@/lib/business/configuration.service";
import type { OperatingMode } from "@/lib/business/types";
import { useBusinessConfigStore } from "@/lib/stores/business-config-store";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useIsDarkTheme } from "@/lib/stores/ui-store";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

export default function BusinessSettingsScreen() {
  const router = useRouter();
  const dark = useIsDarkTheme();
  const session = useCashierStore((state) => state.session);
  const configuration = useBusinessConfigStore((state) => state.configuration);
  const [businessName, setBusinessName] = useState(configuration.businessName);
  const [posSystemName, setPosSystemName] = useState(configuration.posSystemName);
  const [headerName, setHeaderName] = useState(configuration.headerName);
  const [address, setAddress] = useState(configuration.address);
  const [supportPhone, setSupportPhone] = useState(configuration.supportPhone);
  const [contactEmail, setContactEmail] = useState(configuration.contactEmail);
  const [businessLogoUri, setBusinessLogoUri] = useState<string | null>(configuration.businessLogoUri);
  const [receiptLogoUri, setReceiptLogoUri] = useState<string | null>(configuration.receiptLogoUri);
  const [nextMode, setNextMode] = useState<OperatingMode>(configuration.operatingMode);
  const [stockResolution, setStockResolution] = useState("");
  const [mappings, setMappings] = useState<Array<{ productId: string; name: string; sku: string; availableQty: number; omsVariationId: string | null }>>([]);
  const [mappingValues, setMappingValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session?.isSuperAdmin) router.replace("/(pos)/settings" as any);
  }, [router, session?.isSuperAdmin]);
  useEffect(() => {
    if (configuration.operatingMode !== "INDEPENDENT") return;
    BusinessConfigurationService.listIndependentStockMappings().then((rows) => {
      setMappings(rows);
      setMappingValues(Object.fromEntries(rows.map((row) => [row.productId, row.omsVariationId ?? ""])));
    }).catch(() => {});
  }, [configuration.operatingMode]);

  const saveMapping = async (productId: string) => {
    try {
      await BusinessConfigurationService.mapIndependentVariation({
        productId, omsVariationId: mappingValues[productId] ?? "",
        mappedById: session?.cashierId, mappedByName: session?.cashierName,
      });
      const rows = await BusinessConfigurationService.listIndependentStockMappings();
      setMappings(rows);
      Alert.alert("Mapping saved", "The local variation mapping is recorded for mode migration.");
    } catch (error: any) { Alert.alert("Variation mapping", error?.message ?? "Unable to save mapping."); }
  };

  const pickLogo = async (kind: "business" | "receipt") => {
    try {
      const selection = await File.pickFileAsync({ mimeTypes: "image/*" });
      if (selection.canceled) return;
      const source = selection.result;
      const extension = String(source.extension || ".jpg").toLowerCase();
      const size = Number((source as any).size ?? 0);
      if (size > MAX_LOGO_BYTES) throw new Error("Logo images must be 5 MB or smaller.");
      const directory = new Directory(Paths.document, "business-branding");
      directory.create({ intermediates: true, idempotent: true });
      const destination = new File(directory, `${configuration.businessId}-${kind}-${Date.now()}${extension}`);
      await source.copy(destination, { overwrite: false });
      if (kind === "business") setBusinessLogoUri(destination.uri);
      else setReceiptLogoUri(destination.uri);
    } catch (error: any) {
      Alert.alert("Branding image", error?.message ?? "Unable to use that image.");
    }
  };

  const save = async () => {
    if (!businessName.trim() || !posSystemName.trim() || !headerName.trim()) {
      Alert.alert("Business settings", "Business name, POS system name, and header name are required.");
      return;
    }
    setSaving(true);
    try {
      await BusinessConfigurationService.updateBranding({
        businessName: businessName.trim(), posSystemName: posSystemName.trim(),
        headerName: headerName.trim(), address: address.trim(),
        supportPhone: supportPhone.trim(), contactEmail: contactEmail.trim(),
        businessLogoUri, receiptLogoUri,
      });
      if (nextMode !== configuration.operatingMode) {
        await BusinessConfigurationService.changeOperatingMode({
          nextMode,
          changedById: session?.cashierId,
          changedByName: session?.cashierName,
          stockResolution,
        });
      }
      Alert.alert("Saved", "Business configuration is available offline on this device.");
    } catch (error: any) {
      Alert.alert("Business settings", error?.message ?? "Unable to save configuration.");
    } finally {
      setSaving(false);
    }
  };

  const surface = dark ? "#141922" : "#ffffff";
  const border = dark ? "#334155" : "#dbe3ec";
  const text = dark ? "#f8fafc" : "#172033";
  const muted = dark ? "#94a3b8" : "#64748b";
  const logo = businessLogoUri ? { uri: businessLogoUri } : require("../../../assets/nct-seafoods-logo.png");

  return <ScrollView style={[styles.screen, { backgroundColor: dark ? "#0b0f16" : "#f4f6f8" }]} contentContainerStyle={styles.content}>
    <View style={styles.header}>
      <TouchableOpacity style={[styles.back, { borderColor: border, backgroundColor: surface }]} onPress={() => router.back()}><Ionicons name="arrow-back" size={20} color={text} /></TouchableOpacity>
      <View><Text style={[styles.title, { color: text }]}>Business & Branding</Text><Text style={[styles.subtitle, { color: muted }]}>One offline configuration for every POS surface</Text></View>
    </View>
    <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
      <Text style={[styles.sectionTitle, { color: text }]}>Stable identity</Text>
      <Text style={[styles.readOnly, { color: muted }]}>Business ID: {configuration.businessId}</Text>
      <Text style={[styles.help, { color: muted }]}>This ID is not derived from the editable business name.</Text>
      <Image source={logo} style={styles.logo} resizeMode="contain" />
      <View style={styles.logoActions}>
        <TouchableOpacity style={[styles.secondaryButton, { borderColor: border }]} onPress={() => void pickLogo("business")}><Text style={{ color: text }}>Choose business logo</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.secondaryButton, { borderColor: border }]} onPress={() => void pickLogo("receipt")}><Text style={{ color: text }}>Choose receipt logo</Text></TouchableOpacity>
      </View>
      <Text style={[styles.help, { color: muted }]}>PNG, JPEG, or WebP; maximum 2 MB. Receipt logo defaults to the business logo.</Text>
      {[
        ["Business/display name", businessName, setBusinessName],
        ["POS system name", posSystemName, setPosSystemName],
        ["Header/business name", headerName, setHeaderName],
        ["Address", address, setAddress],
        ["Contact phone", supportPhone, setSupportPhone],
        ["Contact email", contactEmail, setContactEmail],
      ].map(([label, value, setter]) => <View key={label as string} style={styles.field}><Text style={[styles.label, { color: text }]}>{label as string}</Text><TextInput value={value as string} onChangeText={setter as (value: string) => void} style={[styles.input, { color: text, borderColor: border, backgroundColor: dark ? "#0f141d" : "#f8fafc" }]} placeholderTextColor={muted} /></View>)}
    </View>
    <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
      <Text style={[styles.sectionTitle, { color: text }]}>Operating mode</Text>
      <Text style={[styles.help, { color: muted }]}>Mode changes are audited and never delete products, stock, transfers, or transactions.</Text>
      {(["NCT_DEPENDENT", "INDEPENDENT"] as OperatingMode[]).map((mode) => <TouchableOpacity key={mode} style={[styles.mode, { borderColor: mode === nextMode ? "#2563eb" : border }]} onPress={() => setNextMode(mode)}><Ionicons name={mode === nextMode ? "radio-button-on" : "radio-button-off"} size={20} color="#2563eb" /><View style={{ flex: 1 }}><Text style={[styles.modeTitle, { color: text }]}>{mode === "INDEPENDENT" ? "Fully Independent POS" : "NCT OMS-Dependent POS"}</Text><Text style={[styles.help, { color: muted }]}>{mode === "INDEPENDENT" ? "Local catalog and stock; OMS transfers disabled; EOD and backups remain enabled." : "NCT catalog and QR transfers; checkout remains local-first."}</Text></View></TouchableOpacity>)}
      {configuration.operatingMode === "INDEPENDENT" && nextMode === "NCT_DEPENDENT" ? <>
        <TextInput multiline value={stockResolution} onChangeText={setStockResolution} placeholder="Required: describe how existing stock will be reconciled" placeholderTextColor={muted} style={[styles.input, styles.notes, { color: text, borderColor: border, backgroundColor: dark ? "#0f141d" : "#f8fafc" }]} />
        <Text style={[styles.label, { color: text, marginTop: 14 }]}>Map stocked local variations to NCT OMS variation IDs</Text>
        {mappings.filter((row) => row.availableQty !== 0).map((row) => <View key={row.productId} style={styles.mappingRow}><View style={{ flex: 1 }}><Text style={[styles.modeTitle, { color: text }]}>{row.name}</Text><Text style={[styles.help, { color: muted }]}>Local {row.sku} · Stock {row.availableQty}</Text></View><TextInput value={mappingValues[row.productId] ?? ""} onChangeText={(value) => setMappingValues((current) => ({ ...current, [row.productId]: value }))} keyboardType="number-pad" placeholder="OMS variation ID" placeholderTextColor={muted} style={[styles.mappingInput, { color: text, borderColor: border }]} /><TouchableOpacity style={styles.mappingSave} onPress={() => void saveMapping(row.productId)}><Ionicons name="checkmark" size={18} color="#fff" /></TouchableOpacity></View>)}
      </> : null}
    </View>
    <TouchableOpacity style={styles.designerButton} onPress={() => router.push("/(pos)/receipt-designer" as any)}><Ionicons name="receipt-outline" size={18} color="#ffffff" /><Text style={styles.primaryText}>Open receipt designer</Text></TouchableOpacity>
    <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.6 }]} disabled={saving} onPress={() => void save()}>{saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>Save business configuration</Text>}</TouchableOpacity>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { padding: 20, paddingBottom: 48, alignItems: "center" },
  header: { width: "100%", maxWidth: 760, flexDirection: "row", alignItems: "center", marginBottom: 18 },
  back: { width: 40, height: 40, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 12 },
  title: { fontSize: 23, fontWeight: "800" }, subtitle: { fontSize: 12, marginTop: 2 },
  card: { width: "100%", maxWidth: 760, borderWidth: 1, borderRadius: 10, padding: 18, marginBottom: 16 },
  sectionTitle: { fontSize: 17, fontWeight: "800", marginBottom: 8 }, readOnly: { fontSize: 13, fontWeight: "700" }, help: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  logo: { width: 140, height: 100, alignSelf: "center", marginVertical: 16 }, logoActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  secondaryButton: { minHeight: 40, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  field: { marginTop: 13 }, label: { fontSize: 12, fontWeight: "700", marginBottom: 6 }, input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 }, notes: { minHeight: 90, marginTop: 12, textAlignVertical: "top" },
  mode: { borderWidth: 1, borderRadius: 9, padding: 12, flexDirection: "row", gap: 10, marginTop: 10 }, modeTitle: { fontSize: 14, fontWeight: "700" },
  mappingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }, mappingInput: { width: 150, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }, mappingSave: { width: 38, height: 38, borderRadius: 8, backgroundColor: "#2563eb", alignItems: "center", justifyContent: "center" },
  designerButton: { width: "100%", maxWidth: 760, minHeight: 46, backgroundColor: "#475569", borderRadius: 8, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  saveButton: { width: "100%", maxWidth: 760, minHeight: 48, backgroundColor: "#17386b", borderRadius: 8, alignItems: "center", justifyContent: "center" }, primaryText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
});

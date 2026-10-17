import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DEFAULT_POS_THEMES, usePosTheme, useUiStore, type PosThemeColors, type ThemePaletteMode } from "@/lib/stores/ui-store";

const COLOR_FIELDS: Array<{ key: keyof PosThemeColors; label: string; detail: string }> = [
  { key: "background", label: "Page background", detail: "Login, registration, and main content background" },
  { key: "surface", label: "Cards and inputs", detail: "Panels, dialogs, keys, and form fields" },
  { key: "surfaceAlt", label: "Secondary surface", detail: "Selected rows, subtle panels, and icon backgrounds" },
  { key: "primary", label: "Primary color", detail: "Main buttons, dashboard hero, and emphasis" },
  { key: "onPrimary", label: "Text on primary", detail: "Text and icons displayed over the primary color" },
  { key: "accent", label: "Accent color", detail: "Active navigation, loading, links, and highlights" },
  { key: "text", label: "Main text", detail: "Titles and primary content" },
  { key: "muted", label: "Secondary text", detail: "Descriptions, placeholders, and metadata" },
  { key: "border", label: "Borders", detail: "Cards, inputs, dividers, and outlines" },
  { key: "navigation", label: "Navigation background", detail: "Header, sidebar, and bottom navigation" },
  { key: "navigationText", label: "Navigation text", detail: "Inactive navigation labels and header icons" },
];

const SWATCHES = [
  "#ffffff", "#f8fafc", "#e2e8f0", "#94a3b8", "#475569", "#172033", "#0f172a", "#050a14",
  "#17386b", "#2563eb", "#3b82f6", "#60a5fa", "#0f766e", "#16a34a", "#d97706", "#dc2626",
  "#7c3aed", "#db2777", "#f43f5e", "#f59e0b", "#14b8a6", "#06b6d4", "#1d4ed8", "#4f46e5",
];

const normalizeHex = (value: string) => {
  const trimmed = value.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return withHash.toLowerCase();
};

export function ThemeColorEditor() {
  const currentTheme = usePosTheme();
  const themePalettes = useUiStore((state) => state.themePalettes);
  const setThemeColor = useUiStore((state) => state.setThemeColor);
  const resetThemePalette = useUiStore((state) => state.resetThemePalette);
  const [mode, setMode] = useState<ThemePaletteMode>(currentTheme.dark ? "dark" : "light");
  const [selected, setSelected] = useState<keyof PosThemeColors | null>(null);
  const [draft, setDraft] = useState("");
  const palette = { ...DEFAULT_POS_THEMES[mode], ...(themePalettes?.[mode] ?? {}) };
  const selectedField = COLOR_FIELDS.find((field) => field.key === selected);
  const valid = /^#[0-9a-f]{6}$/i.test(normalizeHex(draft));
  const shellText = currentTheme.text;
  const shellMuted = currentTheme.muted;
  const shellBorder = currentTheme.border;
  const shellSurface = currentTheme.surface;

  useEffect(() => {
    if (selected) setDraft(palette[selected]);
  }, [selected]);

  const preview = useMemo(() => palette, [palette.background, palette.surface, palette.surfaceAlt, palette.primary, palette.onPrimary, palette.accent, palette.text, palette.muted, palette.border, palette.navigation, palette.navigationText]);

  const openPicker = (key: keyof PosThemeColors) => {
    setDraft(palette[key]);
    setSelected(key);
  };

  const apply = () => {
    if (!selected || !valid) return Alert.alert("Invalid color", "Enter a six-digit hexadecimal color such as #2563EB.");
    setThemeColor(mode, selected, normalizeHex(draft));
    setSelected(null);
  };

  const reset = () => Alert.alert(`Reset ${mode} palette?`, "All colors in this palette will return to their POS defaults.", [
    { text: "Cancel", style: "cancel" },
    { text: "Reset", style: "destructive", onPress: () => resetThemePalette(mode) },
  ]);

  return <View style={styles.wrap}>
    <View style={styles.modeRow}>
      {(["light", "dark"] as ThemePaletteMode[]).map((value) => <TouchableOpacity key={value} onPress={() => setMode(value)} style={[styles.modeButton, { borderColor: shellBorder, backgroundColor: value === mode ? currentTheme.primary : shellSurface }]}><Ionicons name={value === "light" ? "sunny" : "moon"} size={16} color={value === mode ? currentTheme.onPrimary : shellText} /><Text style={{ color: value === mode ? currentTheme.onPrimary : shellText, fontWeight: "800", textTransform: "capitalize" }}>{value} palette</Text></TouchableOpacity>)}
    </View>

    <View style={[styles.preview, { backgroundColor: preview.background, borderColor: preview.border }]}>
      <View style={[styles.previewNav, { backgroundColor: preview.navigation }]}><Ionicons name="menu" size={17} color={preview.navigationText} /><Text style={{ color: preview.navigationText, fontWeight: "900" }}>POS preview</Text><Ionicons name="settings-outline" size={17} color={preview.navigationText} /></View>
      <View style={[styles.previewBody, { backgroundColor: preview.background }]}>
        <Text style={{ color: preview.text, fontSize: 16, fontWeight: "900" }}>Welcome to your POS</Text><Text style={{ color: preview.muted, fontSize: 11 }}>Login, registration, and dashboard use this palette.</Text>
        <View style={[styles.previewCard, { backgroundColor: preview.surface, borderColor: preview.border }]}><View style={[styles.previewIcon, { backgroundColor: preview.surfaceAlt }]}><Ionicons name="cart-outline" size={19} color={preview.accent} /></View><View style={{ flex: 1 }}><Text style={{ color: preview.text, fontWeight: "800" }}>New Sale</Text><Text style={{ color: preview.muted, fontSize: 10 }}>Example surface and content</Text></View><TouchableOpacity style={[styles.previewButton, { backgroundColor: preview.primary }]}><Text style={{ color: preview.onPrimary, fontWeight: "900", fontSize: 11 }}>OPEN</Text></TouchableOpacity></View>
      </View>
    </View>

    <View style={styles.colorList}>{COLOR_FIELDS.map((field) => <TouchableOpacity key={field.key} onPress={() => openPicker(field.key)} style={[styles.colorRow, { borderColor: shellBorder }]}><View style={[styles.colorChip, { backgroundColor: palette[field.key], borderColor: shellBorder }]} /><View style={{ flex: 1 }}><Text style={{ color: shellText, fontWeight: "800" }}>{field.label}</Text><Text style={{ color: shellMuted, fontSize: 11, marginTop: 2 }}>{field.detail}</Text></View><Text style={{ color: shellMuted, fontFamily: "monospace", fontSize: 11 }}>{palette[field.key].toUpperCase()}</Text><Ionicons name="chevron-forward" size={18} color={shellMuted} /></TouchableOpacity>)}</View>
    <TouchableOpacity onPress={reset} style={[styles.reset, { borderColor: shellBorder }]}><Ionicons name="refresh-outline" size={17} color={shellText} /><Text style={{ color: shellText, fontWeight: "800" }}>Reset {mode} colors</Text></TouchableOpacity>
    <Text style={[styles.persistNote, { color: shellMuted }]}>Colors save automatically on this device and are available before login.</Text>

    <Modal visible={selected !== null} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
      <View style={styles.backdrop}><View style={[styles.modalCard, { backgroundColor: shellSurface, borderColor: shellBorder }]}>
        <View style={styles.modalHeader}><View style={{ flex: 1 }}><Text style={[styles.modalTitle, { color: shellText }]}>{selectedField?.label ?? "Choose color"}</Text><Text style={{ color: shellMuted, fontSize: 12 }}>{selectedField?.detail}</Text></View><TouchableOpacity onPress={() => setSelected(null)} style={styles.close}><Ionicons name="close" size={23} color={shellText} /></TouchableOpacity></View>
        <View style={[styles.selectedPreview, { backgroundColor: valid ? normalizeHex(draft) : shellSurface, borderColor: shellBorder }]} />
        <Text style={[styles.inputLabel, { color: shellText }]}>Hex color</Text><TextInput autoCapitalize="characters" autoCorrect={false} maxLength={7} value={draft} onChangeText={setDraft} placeholder="#2563EB" placeholderTextColor={shellMuted} style={[styles.hexInput, { color: shellText, backgroundColor: currentTheme.background, borderColor: valid ? currentTheme.accent : "#dc2626" }]} />
        <Text style={[styles.inputLabel, { color: shellText }]}>Color presets</Text><ScrollView style={{ maxHeight: 190 }} contentContainerStyle={styles.swatches}>{SWATCHES.map((color) => <TouchableOpacity accessibilityLabel={`Select color ${color}`} key={color} onPress={() => setDraft(color)} style={[styles.swatch, { backgroundColor: color, borderColor: normalizeHex(draft) === color ? currentTheme.accent : shellBorder }]}>{normalizeHex(draft) === color ? <Ionicons name="checkmark" size={20} color={color === "#ffffff" || color === "#f8fafc" || color === "#e2e8f0" ? "#111827" : "#ffffff"} /> : null}</TouchableOpacity>)}</ScrollView>
        <View style={styles.actions}><TouchableOpacity onPress={() => setSelected(null)} style={[styles.cancel, { borderColor: shellBorder }]}><Text style={{ color: shellText, fontWeight: "800" }}>Cancel</Text></TouchableOpacity><TouchableOpacity onPress={apply} style={[styles.apply, { backgroundColor: currentTheme.primary }, !valid && { opacity: 0.45 }]}><Text style={{ color: currentTheme.onPrimary, fontWeight: "900" }}>Apply color</Text></TouchableOpacity></View>
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 18 }, modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }, modeButton: { minHeight: 42, borderWidth: 1, borderRadius: 9, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 7 },
  preview: { borderWidth: 1, borderRadius: 12, overflow: "hidden", marginBottom: 14 }, previewNav: { minHeight: 42, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, previewBody: { padding: 14, gap: 5 }, previewCard: { marginTop: 7, borderWidth: 1, borderRadius: 9, padding: 10, flexDirection: "row", alignItems: "center", gap: 9 }, previewIcon: { width: 38, height: 38, borderRadius: 9, alignItems: "center", justifyContent: "center" }, previewButton: { borderRadius: 7, paddingHorizontal: 12, paddingVertical: 9 },
  colorList: { gap: 7 }, colorRow: { minHeight: 62, borderWidth: 1, borderRadius: 9, padding: 9, flexDirection: "row", alignItems: "center", gap: 10 }, colorChip: { width: 38, height: 38, borderRadius: 8, borderWidth: 1 }, reset: { alignSelf: "flex-start", minHeight: 42, borderWidth: 1, borderRadius: 8, paddingHorizontal: 13, marginTop: 13, flexDirection: "row", alignItems: "center", gap: 7 }, persistNote: { fontSize: 11, marginTop: 9 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.58)", justifyContent: "center", padding: 20 }, modalCard: { width: "100%", maxWidth: 560, alignSelf: "center", borderWidth: 1, borderRadius: 14, padding: 18 }, modalHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 }, modalTitle: { fontSize: 19, fontWeight: "900", marginBottom: 3 }, close: { width: 40, height: 40, alignItems: "center", justifyContent: "center" }, selectedPreview: { height: 64, borderWidth: 1, borderRadius: 9, marginVertical: 14 }, inputLabel: { fontSize: 12, fontWeight: "800", marginBottom: 6 }, hexInput: { height: 46, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontFamily: "monospace", fontSize: 16, marginBottom: 14 }, swatches: { flexDirection: "row", flexWrap: "wrap", gap: 9, paddingBottom: 8 }, swatch: { width: 48, height: 48, borderRadius: 9, borderWidth: 3, alignItems: "center", justifyContent: "center" }, actions: { flexDirection: "row", gap: 9, marginTop: 14 }, cancel: { flex: 1, height: 46, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" }, apply: { flex: 1, height: 46, borderRadius: 8, alignItems: "center", justifyContent: "center" },
});

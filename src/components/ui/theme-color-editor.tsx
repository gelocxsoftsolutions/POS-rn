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

const THEME_PRESETS: Record<ThemePaletteMode, Array<{ name: string; description: string; colors: PosThemeColors }>> = {
  light: [
    { name: "Classic Blue", description: "Clean NCT-inspired business theme", colors: DEFAULT_POS_THEMES.light },
    { name: "Ocean", description: "Cool cyan surfaces and navy navigation", colors: { background: "#eef8fb", surface: "#ffffff", surfaceAlt: "#dff3f7", primary: "#0f6173", onPrimary: "#ffffff", accent: "#0891b2", text: "#12313a", muted: "#5d7780", border: "#c5e2e8", navigation: "#083344", navigationText: "#ecfeff" } },
    { name: "Forest", description: "Natural greens with high contrast", colors: { background: "#f3f8f2", surface: "#ffffff", surfaceAlt: "#e2f0df", primary: "#2f6b3c", onPrimary: "#ffffff", accent: "#4d8f5b", text: "#19321f", muted: "#66776a", border: "#cddfce", navigation: "#183a22", navigationText: "#f0fdf4" } },
    { name: "Warm Sand", description: "Warm neutral surfaces and amber accents", colors: { background: "#faf6ef", surface: "#fffdf9", surfaceAlt: "#f3e8d4", primary: "#8a4b16", onPrimary: "#ffffff", accent: "#d97706", text: "#3f2d20", muted: "#7f6b5a", border: "#e6d5bd", navigation: "#4b2e1c", navigationText: "#fff7ed" } },
    { name: "Lavender", description: "Soft violet surfaces with a rich purple focus", colors: { background: "#f7f3ff", surface: "#ffffff", surfaceAlt: "#eee7fb", primary: "#6941c6", onPrimary: "#ffffff", accent: "#7f56d9", text: "#2d2140", muted: "#746a82", border: "#ded3ef", navigation: "#39245f", navigationText: "#faf7ff" } },
    { name: "Rose", description: "Warm rose highlights on clean neutral panels", colors: { background: "#fff5f7", surface: "#ffffff", surfaceAlt: "#ffe4e9", primary: "#a61e4d", onPrimary: "#ffffff", accent: "#d6336c", text: "#45192a", muted: "#866171", border: "#f1cad5", navigation: "#5c1733", navigationText: "#fff0f4" } },
    { name: "Sky", description: "Bright blue workspace with crisp readable contrast", colors: { background: "#f0f8ff", surface: "#ffffff", surfaceAlt: "#dff0ff", primary: "#075985", onPrimary: "#ffffff", accent: "#0284c7", text: "#153247", muted: "#607b8e", border: "#c7e2f4", navigation: "#0c4a6e", navigationText: "#f0f9ff" } },
    { name: "Mint", description: "Fresh mint surfaces with deep teal controls", colors: { background: "#f0faf7", surface: "#ffffff", surfaceAlt: "#dcf4ec", primary: "#0f766e", onPrimary: "#ffffff", accent: "#0d9488", text: "#153b37", muted: "#5f7e79", border: "#c5e5de", navigation: "#134e4a", navigationText: "#f0fdfa" } },
    { name: "Slate", description: "Professional cool gray with strong blue actions", colors: { background: "#f3f5f8", surface: "#ffffff", surfaceAlt: "#e5e9ef", primary: "#334155", onPrimary: "#ffffff", accent: "#2563eb", text: "#1e293b", muted: "#64748b", border: "#cbd5e1", navigation: "#1e293b", navigationText: "#f8fafc" } },
    { name: "Coral", description: "Friendly coral actions with warm ivory surfaces", colors: { background: "#fff7f3", surface: "#ffffff", surfaceAlt: "#ffe7dc", primary: "#b93815", onPrimary: "#ffffff", accent: "#ea580c", text: "#48251b", muted: "#88675d", border: "#f2cdbf", navigation: "#672814", navigationText: "#fff7ed" } },
  ],
  dark: [
    { name: "Midnight", description: "Default low-light blue theme", colors: DEFAULT_POS_THEMES.dark },
    { name: "Graphite", description: "Neutral charcoal with silver details", colors: { background: "#101214", surface: "#191c1f", surfaceAlt: "#25292d", primary: "#d1d5db", onPrimary: "#111827", accent: "#9ca3af", text: "#f3f4f6", muted: "#9ca3af", border: "#343a40", navigation: "#090a0b", navigationText: "#f9fafb" } },
    { name: "Deep Ocean", description: "Dark marine blue with cyan highlights", colors: { background: "#06131b", surface: "#0c202b", surfaceAlt: "#13313e", primary: "#67e8f9", onPrimary: "#083344", accent: "#22d3ee", text: "#ecfeff", muted: "#8db6c2", border: "#244653", navigation: "#031017", navigationText: "#ecfeff" } },
    { name: "Plum", description: "Dark violet surfaces and lavender accents", colors: { background: "#160f1c", surface: "#211629", surfaceAlt: "#32203d", primary: "#d8b4fe", onPrimary: "#2e1065", accent: "#c084fc", text: "#faf5ff", muted: "#b9a2c6", border: "#493455", navigation: "#100817", navigationText: "#faf5ff" } },
    { name: "Emerald Night", description: "Deep green workspace with vivid mint actions", colors: { background: "#071511", surface: "#0d211a", surfaceAlt: "#16352a", primary: "#6ee7b7", onPrimary: "#052e22", accent: "#34d399", text: "#ecfdf5", muted: "#8bb9a8", border: "#285344", navigation: "#04100c", navigationText: "#ecfdf5" } },
    { name: "Crimson", description: "Dark red accents for a bold retail workspace", colors: { background: "#170b0d", surface: "#241215", surfaceAlt: "#381c21", primary: "#fda4af", onPrimary: "#4c0519", accent: "#fb7185", text: "#fff1f2", muted: "#c59aa1", border: "#553038", navigation: "#100609", navigationText: "#fff1f2" } },
    { name: "Indigo", description: "Rich indigo panels with electric violet focus", colors: { background: "#0d0d1d", surface: "#17172b", surfaceAlt: "#252443", primary: "#a5b4fc", onPrimary: "#1e1b4b", accent: "#818cf8", text: "#eef2ff", muted: "#a5a8c7", border: "#39385d", navigation: "#090918", navigationText: "#eef2ff" } },
    { name: "Bronze", description: "Warm near-black panels with amber controls", colors: { background: "#15110c", surface: "#211a12", surfaceAlt: "#34291b", primary: "#fbbf24", onPrimary: "#422006", accent: "#f59e0b", text: "#fffbeb", muted: "#c2aa81", border: "#4d3d28", navigation: "#0e0b07", navigationText: "#fffbeb" } },
    { name: "Teal Night", description: "Balanced dark teal for extended checkout use", colors: { background: "#071416", surface: "#0d2225", surfaceAlt: "#16353a", primary: "#5eead4", onPrimary: "#042f2e", accent: "#2dd4bf", text: "#f0fdfa", muted: "#8bb8b5", border: "#285055", navigation: "#041012", navigationText: "#f0fdfa" } },
    { name: "High Contrast", description: "Maximum separation for low-visibility environments", colors: { background: "#000000", surface: "#111111", surfaceAlt: "#242424", primary: "#facc15", onPrimary: "#000000", accent: "#38bdf8", text: "#ffffff", muted: "#c7c7c7", border: "#666666", navigation: "#000000", navigationText: "#ffffff" } },
  ],
};

const normalizeHex = (value: string) => {
  const trimmed = value.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return withHash.toLowerCase();
};

export function ThemeColorEditor() {
  const currentTheme = usePosTheme();
  const themePalettes = useUiStore((state) => state.themePalettes);
  const setThemeColor = useUiStore((state) => state.setThemeColor);
  const setThemePalette = useUiStore((state) => state.setThemePalette);
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
  const selectedPreset = THEME_PRESETS[mode].find((preset) => JSON.stringify(preset.colors) === JSON.stringify(palette))?.name;

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

    <Text style={[styles.presetHeading, { color: shellText }]}>{mode === "light" ? "Light" : "Dark"} color presets</Text>
    <Text style={[styles.presetHelp, { color: shellMuted }]}>Presets are designed specifically for the selected palette. You can fine-tune any color afterward.</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>{THEME_PRESETS[mode].map((preset) => { const active = selectedPreset === preset.name; return <TouchableOpacity key={preset.name} onPress={() => setThemePalette(mode, preset.colors)} style={[styles.presetCard, { borderColor: active ? currentTheme.accent : shellBorder, backgroundColor: shellSurface }]}><View style={styles.presetColors}>{(["navigation", "primary", "accent", "surfaceAlt", "background"] as Array<keyof PosThemeColors>).map((key) => <View key={key} style={[styles.presetColor, { backgroundColor: preset.colors[key], borderColor: shellBorder }]} />)}</View><View style={styles.presetTitleRow}><Text style={{ color: shellText, fontWeight: "900", fontSize: 13 }}>{preset.name}</Text>{active ? <Ionicons name="checkmark-circle" size={17} color={currentTheme.accent} /> : null}</View><Text style={{ color: shellMuted, fontSize: 10, lineHeight: 14 }}>{preset.description}</Text></TouchableOpacity>; })}</ScrollView>

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
  wrap: { marginTop: 18 }, modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }, modeButton: { minHeight: 42, borderWidth: 1, borderRadius: 9, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 7 }, presetHeading: { fontSize: 14, fontWeight: "900" }, presetHelp: { fontSize: 11, lineHeight: 16, marginTop: 3, marginBottom: 10 }, presetRow: { gap: 9, paddingBottom: 14 }, presetCard: { width: 168, minHeight: 112, borderWidth: 2, borderRadius: 10, padding: 10 }, presetColors: { flexDirection: "row", marginBottom: 9 }, presetColor: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, marginRight: -4 }, presetTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  preview: { borderWidth: 1, borderRadius: 12, overflow: "hidden", marginBottom: 14 }, previewNav: { minHeight: 42, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, previewBody: { padding: 14, gap: 5 }, previewCard: { marginTop: 7, borderWidth: 1, borderRadius: 9, padding: 10, flexDirection: "row", alignItems: "center", gap: 9 }, previewIcon: { width: 38, height: 38, borderRadius: 9, alignItems: "center", justifyContent: "center" }, previewButton: { borderRadius: 7, paddingHorizontal: 12, paddingVertical: 9 },
  colorList: { gap: 7 }, colorRow: { minHeight: 62, borderWidth: 1, borderRadius: 9, padding: 9, flexDirection: "row", alignItems: "center", gap: 10 }, colorChip: { width: 38, height: 38, borderRadius: 8, borderWidth: 1 }, reset: { alignSelf: "flex-start", minHeight: 42, borderWidth: 1, borderRadius: 8, paddingHorizontal: 13, marginTop: 13, flexDirection: "row", alignItems: "center", gap: 7 }, persistNote: { fontSize: 11, marginTop: 9 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.58)", justifyContent: "center", padding: 20 }, modalCard: { width: "100%", maxWidth: 560, alignSelf: "center", borderWidth: 1, borderRadius: 14, padding: 18 }, modalHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 }, modalTitle: { fontSize: 19, fontWeight: "900", marginBottom: 3 }, close: { width: 40, height: 40, alignItems: "center", justifyContent: "center" }, selectedPreview: { height: 64, borderWidth: 1, borderRadius: 9, marginVertical: 14 }, inputLabel: { fontSize: 12, fontWeight: "800", marginBottom: 6 }, hexInput: { height: 46, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontFamily: "monospace", fontSize: 16, marginBottom: 14 }, swatches: { flexDirection: "row", flexWrap: "wrap", gap: 9, paddingBottom: 8 }, swatch: { width: 48, height: 48, borderRadius: 9, borderWidth: 3, alignItems: "center", justifyContent: "center" }, actions: { flexDirection: "row", gap: 9, marginTop: 14 }, cancel: { flex: 1, height: 46, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" }, apply: { flex: 1, height: 46, borderRadius: 8, alignItems: "center", justifyContent: "center" },
});

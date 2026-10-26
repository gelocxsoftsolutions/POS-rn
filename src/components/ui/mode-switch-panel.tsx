import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from "react-native";
import { usePosTheme } from "@/lib/stores/ui-store";
import { useBusinessConfigStore } from "@/lib/stores/business-config-store";
import { readModeSwitchIntent } from "@/lib/services/dealership-cloud.service";
import { switchDealershipMode } from "@/lib/services/dealership-mode-switch.service";
import { UploadQrImageButton } from "./upload-qr-image-button";
import { ReceiptQrScannerModal } from "./receipt-qr-scanner-modal";
export function ModeSwitchPanel({ disabled, onBusyChange }: { disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const theme = usePosTheme();
  const mode = useBusinessConfigStore(state => state.configuration.operatingMode);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanner, setScanner] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => { void readModeSwitchIntent().then(value => setPending(Boolean(value))); }, []);
  const apply = (value: string) => {
    if (busy || disabled) return;
    setScanner(false);
    setBusy(true);onBusyChange(true);
    Alert.alert("Switch this device's mode?", "OMS will verify the key and a recovery backup. Products, stock, sales and history remain on this device. Existing local products remain sellable.", [
      { text: "Cancel", style: "cancel", onPress: () => { setBusy(false);onBusyChange(false); } },
      { text: "Back up and switch", onPress: () => { void (async () => {
        try { const next = await switchDealershipMode(value);setCode("");setPending(false);Alert.alert("Mode updated", next.operatingMode === "INDEPENDENT" ? "Independent mode is active. OMS transfers are disabled; existing products and cloud backups remain available." : "OMS-dependent mode is active. Existing local products remain sellable and OMS catalog and transfers are enabled."); }
        catch (error: any) { setPending(Boolean(await readModeSwitchIntent()));Alert.alert("Mode switch", (error?.message ?? "Switch failed") + "\nIf OMS accepted the switch, retry the same key to finish it. Your database has not been cleared."); }
        finally { setBusy(false);onBusyChange(false); }
      })(); } },
    ], { cancelable: false });
  };
  return <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 16, padding: 16, gap: 12 }}>
    <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Change device mode</Text>
    <Text style={{ color: theme.accent }}>Current mode: {mode === "INDEPENDENT" ? "Independent" : "OMS-dependent"}</Text>
    <Text style={{ color: theme.muted }}>Request a switch key for this device in OMS Dealership. Only this device changes mode. Finish active checkout and open transfers first. A verified cloud backup is required.</Text>
    <TextInput accessibilityLabel="Mode switch key" editable={!busy && !disabled} value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} placeholder="MODE-..." placeholderTextColor={theme.muted} style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12, color: theme.text, backgroundColor: theme.surfaceAlt }} />
    <View style={{ flexDirection: "row", gap: 10 }}><TouchableOpacity disabled={busy || disabled} onPress={() => setScanner(true)} style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.border }}><Text style={{ color: theme.text }}>Scan switch QR</Text></TouchableOpacity><UploadQrImageButton disabled={busy || disabled} onScan={value => { setCode(value); }} style={{ flex: 1 }} /></View>
    <TouchableOpacity disabled={busy || disabled || !code.trim()} onPress={() => apply(code)} style={{ padding: 14, borderRadius: 10, backgroundColor: theme.primary, opacity: busy || disabled || !code.trim() ? 0.5 : 1 }}>{busy ? <ActivityIndicator color={theme.onPrimary} /> : <Text style={{ color: theme.onPrimary, textAlign: "center", fontWeight: "700" }}>Back up and apply switch key</Text>}</TouchableOpacity>
    {pending && <TouchableOpacity disabled={busy || disabled} onPress={() => { void readModeSwitchIntent().then(value => { if (value) apply(value.code); }); }}><Text style={{ color: theme.accent }}>Resume unfinished mode switch</Text></TouchableOpacity>}
    <ReceiptQrScannerModal visible={scanner} dark={false} onClose={() => setScanner(false)} onScan={value => { setCode(value);setScanner(false); }} title="Scan mode switch QR" subtitle="OMS mode switch authorization" description="Scan the switch QR issued for this device." />
  </View>;
}

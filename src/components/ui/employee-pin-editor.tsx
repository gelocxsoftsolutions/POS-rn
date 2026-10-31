import React, { useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { usePosTheme } from "@/lib/stores/ui-store";
import { EmployeePinService } from "@/lib/services/employee-pin.service";

export function EmployeePinEditor({ userId, builtInSuperAdmin = false, registration = false, onSaved }: { userId: string; builtInSuperAdmin?: boolean; registration?: boolean; onSaved?: () => void }) {
  const theme = usePosTheme();
  const [open, setOpen] = useState(registration);
  const [pin, setPin] = useState("");
  const [repeat, setRepeat] = useState("");
  const [proof, setProof] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const clear = () => { setPin(""); setRepeat(""); setProof(""); };
  const save = async () => {
    setError(""); setMessage("");
    if (!/^\d{6}$/.test(pin) || pin !== repeat) { setError("Enter matching six-digit PINs."); return; }
    if (!registration && !proof) { setError(builtInSuperAdmin ? "Confirm your Super Admin password." : "Confirm your current PIN."); return; }
    setBusy(true);
    try { setMessage(await (registration ? EmployeePinService.saveDuringRegistration(userId, pin) : EmployeePinService.save(userId, pin, proof))); clear(); setOpen(false); onSaved?.(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to save PIN."); }
    finally { setBusy(false); }
  };
  const input = { color: theme.text, backgroundColor: theme.surfaceAlt, borderColor: theme.border, borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 8 };
  return <View style={{ marginTop: 10 }}>
    {!open ? <TouchableOpacity accessibilityRole="button" onPress={() => { clear(); setError(""); setMessage(""); setOpen(true); }} style={{ paddingVertical: 10 }}><Text style={{ color: theme.accent, fontWeight: "700" }}>Set / change employee PIN</Text></TouchableOpacity> : <>
      <Text style={{ color: theme.muted, lineHeight: 20 }}>One PIN across assigned devices. An OMS connection is required to save. Offline devices keep the previous PIN until they sync.</Text>
      <Text style={{ color: theme.text, marginTop: 12 }}>New 6-digit PIN</Text>
      <TextInput accessibilityLabel="New employee PIN" placeholder="New 6-digit PIN" placeholderTextColor={theme.muted} style={input} value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={6} editable={!busy} autoComplete="off" />
      <Text style={{ color: theme.text, marginTop: 12 }}>Confirm new PIN</Text>
      <TextInput accessibilityLabel="Confirm employee PIN" placeholder="Confirm new PIN" placeholderTextColor={theme.muted} style={input} value={repeat} onChangeText={setRepeat} keyboardType="number-pad" secureTextEntry maxLength={6} editable={!busy} autoComplete="off" />
      {!registration && <><Text style={{ color: theme.text, marginTop: 12 }}>{builtInSuperAdmin ? "Your Super Admin password" : "Your current PIN"}</Text><TextInput accessibilityLabel={builtInSuperAdmin ? "Super Admin password" : "Your current PIN"} placeholder={builtInSuperAdmin ? "Your Super Admin password" : "Your current PIN"} placeholderTextColor={theme.muted} style={input} value={proof} onChangeText={setProof} secureTextEntry editable={!busy} autoComplete="off" /></>}
      <View style={{ flexDirection: "row", gap: 20, marginTop: 12 }}>
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void save()} style={{ backgroundColor: theme.primary, borderRadius: 8, padding: 12 }}><Text style={{ color: theme.onPrimary, fontWeight: "700" }}>Save shared PIN</Text></TouchableOpacity>
        {!registration && <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => { clear(); setOpen(false); setError(""); }} style={{ padding: 12 }}><Text style={{ color: theme.text }}>Cancel</Text></TouchableOpacity>}
        {busy && <ActivityIndicator color={theme.accent} />}
      </View>
    </>}
    {!!error && <Text accessibilityRole="alert" style={{ color: theme.accent, marginTop: 8 }}>{error}</Text>}
    {!!message && <Text style={{ color: theme.muted, marginTop: 8 }}>{message}</Text>}
  </View>;
}

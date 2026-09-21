import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/card";
import { CashierService } from "@/lib/services/cashier.service";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useIsDarkTheme } from "@/lib/stores/ui-store";

export default function UserScreen() {
  const router = useRouter();
  const session = useCashierStore((state) => state.session);
  const dark = useIsDarkTheme();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => setName(session?.cashierName ?? ""), [session?.cashierName]);

  const handleSave = async () => {
    const displayName = name.trim();
    if (!session?.cashierId || !displayName) {
      Alert.alert("Profile", "Enter your display name.");
      return;
    }
    if (pin && !/^\d{6}$/.test(pin)) {
      Alert.alert("Profile", "The PIN must contain exactly 6 numbers.");
      return;
    }
    if (pin !== confirmPin) {
      Alert.alert("Profile", "The PIN confirmation does not match.");
      return;
    }

    setSaving(true);
    try {
      await CashierService.updateProfile(session.cashierId, displayName, pin || undefined);
      setPin("");
      setConfirmPin("");
      Alert.alert("Profile updated", "Your name and login details have been saved.");
    } catch (error: any) {
      Alert.alert("Profile", error?.message ?? "Unable to update your profile.");
    } finally {
      setSaving(false);
    }
  };

  const surface = dark ? "#141922" : "#ffffff";
  const border = dark ? "#28303d" : "#dde3ea";
  const text = dark ? "#f8fafc" : "#17202b";
  const muted = dark ? "#8f9baa" : "#667085";

  return (
    <ScrollView style={[styles.container, { backgroundColor: dark ? "#0b0f16" : "#f4f6f8" }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: surface, borderColor: border }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={text} />
        </TouchableOpacity>
        <View>
          <Text style={[styles.title, { color: text }]}>Your Profile</Text>
          <Text style={[styles.subtitle, { color: muted }]}>Manage your display name and login PIN</Text>
        </View>
      </View>

      <Card style={[styles.profileCard, { backgroundColor: surface, borderColor: border }]}>
        <View style={styles.identityRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(session?.cashierName || "U").slice(0, 2).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={[styles.identityName, { color: text }]}>{session?.cashierName || "User"}</Text>
            <Text style={[styles.identityRole, { color: muted }]}>{session?.cashierRole || "Cashier"}</Text>
          </View>
        </View>

        <Text style={[styles.label, { color: text }]}>Display name</Text>
        <TextInput style={[styles.input, { color: text, backgroundColor: dark ? "#0f141d" : "#f8fafc", borderColor: border }]} value={name} onChangeText={setName} placeholder="Display name" placeholderTextColor={muted} />

        <View style={[styles.rule, { backgroundColor: border }]} />
        <Text style={[styles.sectionLabel, { color: text }]}>Change PIN</Text>
        <Text style={[styles.helpText, { color: muted }]}>Leave these fields empty to keep your current PIN.</Text>
        <TextInput style={[styles.input, { color: text, backgroundColor: dark ? "#0f141d" : "#f8fafc", borderColor: border }]} value={pin} onChangeText={setPin} placeholder="New 6-digit PIN" placeholderTextColor={muted} keyboardType="number-pad" secureTextEntry maxLength={6} />
        <TextInput style={[styles.input, { color: text, backgroundColor: dark ? "#0f141d" : "#f8fafc", borderColor: border }]} value={confirmPin} onChangeText={setConfirmPin} placeholder="Confirm new PIN" placeholderTextColor={muted} keyboardType="number-pad" secureTextEntry maxLength={6} />

        <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#ffffff" /> : <><Ionicons name="checkmark" size={18} color="#ffffff" /><Text style={styles.saveButtonText}>Save changes</Text></>}
        </TouchableOpacity>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, alignItems: "center" },
  header: { width: "100%", maxWidth: 620, flexDirection: "row", alignItems: "center", marginBottom: 20 },
  backButton: { width: 40, height: 40, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center", marginRight: 12 },
  title: { fontSize: 24, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 3 },
  profileCard: { width: "100%", maxWidth: 620, padding: 22, borderWidth: 1, borderRadius: 8, shadowOpacity: 0.03, elevation: 1 },
  identityRow: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#17386b", alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  identityName: { fontSize: 17, fontWeight: "700" },
  identityRole: { fontSize: 12, marginTop: 2 },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 7 },
  sectionLabel: { fontSize: 14, fontWeight: "700" },
  helpText: { fontSize: 11, marginTop: 4, marginBottom: 12 },
  input: { width: "100%", borderWidth: 1, borderRadius: 8, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14, marginBottom: 12 },
  rule: { height: 1, marginVertical: 18 },
  saveButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#17386b", borderRadius: 8, paddingVertical: 12, marginTop: 8 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
});

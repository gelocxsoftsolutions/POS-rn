import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Directory, File, Paths } from "expo-file-system";
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
  const [photoUri, setPhotoUri] = useState<string | null>(session?.photoUri ?? null);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => setName(session?.cashierName ?? ""), [session?.cashierName]);
  useEffect(() => setPhotoUri(session?.photoUri ?? null), [session?.photoUri]);

  const handleChoosePhoto = async () => {
    setPickingPhoto(true);
    try {
      const selection = await File.pickFileAsync({ mimeTypes: "image/*" });
      if (selection.canceled) return;

      const directory = new Directory(Paths.document, "profile-photos");
      directory.create({ intermediates: true, idempotent: true });
      const extension = selection.result.extension || ".jpg";
      const destination = new File(directory, `${session?.cashierId || "user"}-${Date.now()}${extension}`);
      await selection.result.copy(destination, { overwrite: true });
      setPhotoUri(destination.uri);
    } catch (error: any) {
      Alert.alert("Profile photo", error?.message ?? "Unable to select that image.");
    } finally {
      setPickingPhoto(false);
    }
  };

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
      await CashierService.updateProfile(session.cashierId, displayName, pin || undefined, photoUri);
      setPin("");
      setConfirmPin("");
      Alert.alert("Profile updated", "Your photo, name, and login details have been saved.");
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
          <Text style={[styles.subtitle, { color: muted }]}>Manage your photo, display name, and login PIN</Text>
        </View>
      </View>

      <Card style={[styles.profileCard, { backgroundColor: surface, borderColor: border }]}>
        <View style={styles.identityRow}>
          <View style={styles.avatar}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{(session?.cashierName || "U").slice(0, 2).toUpperCase()}</Text>
            )}
          </View>
          <View style={styles.identityInfo}>
            <Text style={[styles.identityName, { color: text }]}>{session?.cashierName || "User"}</Text>
            <Text style={[styles.identityRole, { color: muted }]}>{session?.cashierRole || "Cashier"}</Text>
            <View style={styles.photoActions}>
              <TouchableOpacity style={[styles.photoButton, { borderColor: border }]} onPress={handleChoosePhoto} disabled={pickingPhoto}>
                {pickingPhoto ? <ActivityIndicator size="small" color={text} /> : <Ionicons name="image-outline" size={16} color={text} />}
                <Text style={[styles.photoButtonText, { color: text }]}>Change photo</Text>
              </TouchableOpacity>
              {photoUri ? (
                <TouchableOpacity style={styles.removePhotoButton} onPress={() => setPhotoUri(null)} accessibilityLabel="Remove profile photo">
                  <Ionicons name="trash-outline" size={17} color="#dc3545" />
                </TouchableOpacity>
              ) : null}
            </View>
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
  avatarImage: { width: "100%", height: "100%", borderRadius: 26 },
  avatarText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  identityInfo: { flex: 1 },
  identityName: { fontSize: 17, fontWeight: "700" },
  identityRole: { fontSize: 12, marginTop: 2 },
  photoActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  photoButton: { minHeight: 34, paddingHorizontal: 11, borderWidth: 1, borderRadius: 7, flexDirection: "row", alignItems: "center", gap: 7 },
  photoButtonText: { fontSize: 12, fontWeight: "700" },
  removePhotoButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 7 },
  sectionLabel: { fontSize: 14, fontWeight: "700" },
  helpText: { fontSize: 11, marginTop: 4, marginBottom: 12 },
  input: { width: "100%", borderWidth: 1, borderRadius: 8, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14, marginBottom: 12 },
  rule: { height: 1, marginVertical: 18 },
  saveButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#17386b", borderRadius: 8, paddingVertical: 12, marginTop: 8 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
});

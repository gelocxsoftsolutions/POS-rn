import React, { useState } from "react";
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { verifyCloudConnection, saveCloudConnection, getCloudConnection } from "@/lib/services/dealership-cloud.service";
import { BusinessConfigurationService } from "@/lib/business/configuration.service";
import { DeviceRepository } from "@/lib/repositories/device.repository";
import { CashierRepository } from "@/lib/repositories/cashier.repository";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useBackupSettingsStore } from "@/lib/stores/backup-settings-store";
import { usePosTheme } from "@/lib/stores/ui-store";
import { execute, queryFirst } from "@/lib/db/connection";
import { sha256 } from "@/lib/crypto/ed25519";
import { RecoveryService } from "@/lib/backup/recovery.service";
import { SyncQueueService } from "@/lib/services/sync-queue.service";
import { CameraView, useCameraPermissions } from "expo-camera";

export default function DealershipCloudScreen() {
  const theme = usePosTheme();
  const router = useRouter();
  const session = useCashierStore(state => state.session);
  const cloudError = useBackupSettingsStore(state => state.lastCloudError);
  const [connectionText, setConnectionText] = useState("");
  const [serverUrl, setServerUrl] = useState(getCloudConnection()?.serverUrl ?? "https://staging.nctseafoods.store");
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [ownerName, setOwnerName] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(getCloudConnection() ? "Cloud connection saved. Automatic backups use your configured schedule." : "Not connected");
  const connect = async () => {
    setBusy(true);
    try {
      const users = await queryFirst<{ count: number }>("SELECT COUNT(*) count FROM Cashier");
      if ((users?.count ?? 0) > 0 && !session?.isSuperAdmin) throw new Error("Sign in as the dealership administrator before changing cloud connections.");
      if (!users?.count && (!ownerName.trim() || !/^\d{6}$/.test(pin) || pin !== confirmPin)) throw new Error("For a new installation, enter the owner's name and a matching six-digit PIN.");
      const value = await verifyCloudConnection(connectionText, serverUrl);
      const current = getCloudConnection();
      if (current && current.deviceId !== value.deviceId) throw new Error("This installation is enrolled to another device. Use a fresh installation for a different dealership device.");
      await BusinessConfigurationService.applyProvisionedConfiguration({ businessId: value.businessId, businessName: value.businessName, posSystemName: "Dealership POS", operatingMode: value.operatingMode });
      const localDeviceId = value.oms?.deviceId ?? value.deviceId;
      let device = await queryFirst<{ id: string }>("SELECT id FROM Device WHERE id = ?", [localDeviceId]);
      if (!device) device = await DeviceRepository.create({ id: localDeviceId, deviceName: value.deviceName, status: "REGISTERED", branchId: value.oms?.branchId });
      useDeviceStore.getState().setDevice({ deviceId: localDeviceId, deviceName: value.deviceName, branchId: value.oms?.branchId ?? null, registrationState: "registered", posApiKey: value.oms?.apiKey ?? null, registeredAt: new Date().toISOString() });
      if (!users?.count) {
        const role = await queryFirst<{ id: string }>("SELECT id FROM Role WHERE lower(name) = 'admin'");
        if (!role) throw new Error("Administrator role is not initialized. Restart and retry setup.");
        await CashierRepository.create({ displayName: ownerName.trim(), username: "owner", pinHash: sha256(pin), roleId: role.id });
      }
      await saveCloudConnection(value);
      useBackupSettingsStore.getState().setAutoBackupEnabled(true);
      // Recover uploads interrupted by application shutdown; retries retain the same manifest and idempotency key.
      await execute("UPDATE SyncQueue SET status='PENDING' WHERE entityType='DatabaseBackup' AND status='PROCESSING'");
      setPin(""); setConfirmPin(""); setConnectionText("");
      setStatus(`${value.businessName} · ${value.operatingMode === "INDEPENDENT" ? "Independent" : "OMS-dependent"} · Cloud backups enabled`);
      Alert.alert("Dealership connected", "Cloud saving is ready. Sign in with your owner PIN. Automatic backups run while the POS app is open and signed in.");
      if (!session) router.replace("/(auth)" as any);
    } catch (error: any) { Alert.alert("Cloud connection", error?.message ?? "Connection failed"); }
    finally { setBusy(false); }
  };
  const upload = async () => {
    setBusy(true);
    try {
      await RecoveryService.queueBackupUpload(`manual:${Date.now()}`);
      const result = await SyncQueueService.processPending();
      setStatus(result.failed ? "Backup retained locally. Cloud upload failed; use Retry uploads when the connection is available." : result.processed ? "Database backup saved to cloud and verified." : "Backup queued for cloud upload. Keep the app open while it completes.");
    } catch (error: any) { Alert.alert("Cloud backup", error?.message ?? "Backup failed"); }
    finally { setBusy(false); }
  };
  const retry = async () => {
    if (!session?.isSuperAdmin) return;
    setBusy(true);
    try {
      await execute("UPDATE SyncQueue SET status='PENDING', retryCount=0 WHERE entityType='DatabaseBackup' AND status IN ('FAILED','PROCESSING')");
      const result = await SyncQueueService.processPending();
      setStatus(`${result.processed} uploaded, ${result.failed} failed. Local files are retained until upload succeeds.`);
    } catch (error: any) { Alert.alert("Retry uploads", error?.message ?? "Retry failed"); }
    finally { setBusy(false); }
  };
  const field = { color: theme.text, backgroundColor: theme.surfaceAlt, borderColor: theme.border, borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 10 };
  return <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 24, alignItems: "center" }} keyboardShouldPersistTaps="handled">
    <View style={{ width: "100%", maxWidth: 640, gap: 12 }}>
      <TouchableOpacity onPress={() => router.back()}><Text style={{ color: theme.accent }}>← Back</Text></TouchableOpacity>
      <Text style={{ fontSize: 26, fontWeight: "800", color: theme.text }}>Dealership Cloud Backup</Text>
      <Text style={{ color: theme.muted }}>Paste the device connection from OMS → Dealership. Independent stores manage their own products. Dependent stores use the linked OMS catalog and transfers. Sales stay on the device and in its backups.</Text>
      <Text style={{ color: theme.accent }}>{status}</Text>
      {cloudError && <Text accessibilityRole="alert" style={{ color: "#dc2626" }}>Cloud backup needs attention: {cloudError}</Text>}
      <Text style={{ color: theme.text, fontWeight: "700" }}>Connect your device</Text>
      <Text style={{ color: theme.muted }}>Scan the QR code shown in OMS, or enter the server and one-time pairing code. Codes expire after ten minutes.</Text>
      <TouchableOpacity disabled={busy} onPress={() => { void (async () => { const access = permission?.granted ? permission : await requestPermission(); if (access.granted) setScanning(true); else Alert.alert("Camera access", "Allow camera access to scan, or enter the code below."); })(); }} style={field}><Text style={{ color: theme.text, textAlign: "center", fontWeight: "700" }}>Scan connection QR code</Text></TouchableOpacity>
      {scanning && <View style={{ gap: 8 }}><CameraView style={{ height: 280, borderRadius: 12 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={({ data }) => {
        try { const value = JSON.parse(data); if (!value.serverUrl || (!value.pairingCode && !value.deviceKey)) throw new Error(); setServerUrl(value.serverUrl); setConnectionText(value.pairingCode ?? data); setScanning(false); setStatus("QR code scanned. Check the server address, then tap Connect Dealership."); }
        catch { setScanning(false); Alert.alert("Invalid QR code", "Scan the connection QR code from OMS Dealership."); }
      }} /><TouchableOpacity onPress={() => setScanning(false)}><Text style={{ color: theme.accent }}>Cancel scanning</Text></TouchableOpacity></View>}
      <TextInput accessibilityLabel="OMS server URL" style={field} placeholder="https://your-oms-server" placeholderTextColor={theme.muted} value={serverUrl} onChangeText={setServerUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      <TextInput accessibilityLabel="Device connection" style={field} placeholder="XXXX-XXXX-XXXX-XXXX" placeholderTextColor={theme.muted} value={connectionText.startsWith("{") ? "QR connection ready" : connectionText} onChangeText={setConnectionText} autoCapitalize="characters" autoCorrect={false} />
      {!session && <><Text style={{ color: theme.text, fontWeight: "700" }}>Owner account (new installations only)</Text><TextInput style={field} placeholder="Owner name" placeholderTextColor={theme.muted} value={ownerName} onChangeText={setOwnerName} /><TextInput style={field} placeholder="Six-digit owner PIN" placeholderTextColor={theme.muted} value={pin} onChangeText={setPin} maxLength={6} keyboardType="number-pad" secureTextEntry /><TextInput style={field} placeholder="Confirm PIN" placeholderTextColor={theme.muted} value={confirmPin} onChangeText={setConfirmPin} maxLength={6} keyboardType="number-pad" secureTextEntry /></>}
      <TouchableOpacity disabled={busy} onPress={() => void connect()} style={{ backgroundColor: theme.primary, padding: 15, borderRadius: 8, opacity: busy ? 0.5 : 1 }}><Text style={{ color: theme.onPrimary, fontWeight: "700", textAlign: "center" }}>{busy ? "Working..." : "Connect Dealership"}</Text></TouchableOpacity>
      {session?.isSuperAdmin && <><TouchableOpacity disabled={busy} onPress={() => void upload()} style={field}><Text style={{ color: theme.text }}>Back Up to Cloud Now</Text></TouchableOpacity><TouchableOpacity disabled={busy} onPress={() => void retry()} style={field}><Text style={{ color: theme.text }}>Retry Uploads</Text></TouchableOpacity></>}
      <Text style={{ color: theme.muted, fontSize: 12 }}>The cloud connection does not replace your local database. Offline backups remain queued. Maximum cloud backup size: 32 MiB. Keep the app open for automatic uploads.</Text>
    </View>
  </ScrollView>;
}

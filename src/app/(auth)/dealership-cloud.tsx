import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useOmsConnectionStore } from "@/lib/stores/oms-connection-store";
import { ModeSwitchPanel } from "@/components/ui/mode-switch-panel";
import { UploadQrImageButton } from "@/components/ui/upload-qr-image-button";
import React, { useState, useEffect } from "react";
import { Alert, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter, Redirect } from "expo-router";
import { verifyCloudConnection, saveCloudConnection, getCloudConnection } from "@/lib/services/dealership-cloud.service";
import { BusinessConfigurationService } from "@/lib/business/configuration.service";
import { DeviceRepository } from "@/lib/repositories/device.repository";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useBackupSettingsStore } from "@/lib/stores/backup-settings-store";
import { usePosTheme } from "@/lib/stores/ui-store";
import { execute, queryFirst } from "@/lib/db/connection";
import { RecoveryService } from "@/lib/backup/recovery.service";
import { SyncQueueService } from "@/lib/services/sync-queue.service";
import { CameraView, useCameraPermissions } from "expo-camera";
import { nextBackupAt } from "@/lib/backup/schedule";
import { runSyncCycle } from "@/lib/services/sync-worker";

export default function DealershipCloudScreen() {
  const theme = usePosTheme();
  const router = useRouter();
  const session = useCashierStore(state => state.session);
  const hydrated = useCashierStore(state => state.hydrated);
  const connectionStatus = useOmsConnectionStore(state => state.status);
  useEffect(() => { if (session?.isSuperAdmin) void useOmsConnectionStore.getState().checkConnection(); }, [session?.isSuperAdmin]);
  const cloudError = useBackupSettingsStore(state => state.lastCloudError);
  const settings = useBackupSettingsStore();
  const [dailyTime, setDailyTime] = useState(settings.dailyTime);
  const [hours, setHours] = useState(String(settings.autoBackupIntervalHours));
  const saveSchedule = () => {
    if (!session?.isSuperAdmin) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dailyTime) || !Number.isInteger(Number(hours)) || Number(hours) < 1 || Number(hours) > 168) {
      Alert.alert("Backup schedule", "Enter a time as HH:mm (24-hour clock) and an interval from 1 to 168 hours."); return;
    }
    settings.setDailyTime(dailyTime); settings.setAutoBackupIntervalHours(Number(hours));
    void runSyncCycle().catch(() => {});
    Alert.alert("Schedule saved", "Your schedule uses this device's local time. Backups run while the app is open and signed in; missed backups are caught up when it resumes.");
  };
  const [connectionText, setConnectionText] = useState("");
  const [serverUrl, setServerUrl] = useState(getCloudConnection()?.serverUrl ?? "https://staging.nctseafoods.store");
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(getCloudConnection() ? "Cloud connection saved. Automatic backups use your configured schedule." : "Not connected");
  const connect = async () => {
    if (!useCashierStore.getState().session?.isSuperAdmin) return;
    setBusy(true);
    try {
      const value = await verifyCloudConnection(connectionText, serverUrl);
      const current = getCloudConnection();
      if (current && current.deviceId !== value.deviceId) throw new Error("This installation is enrolled to another device. Use a fresh installation for a different dealership device.");
      await BusinessConfigurationService.applyProvisionedConfiguration({ businessId: value.businessId, businessName: value.businessName, posSystemName: "Dealership POS", operatingMode: value.operatingMode });
      const localDeviceId = value.oms?.deviceId ?? value.deviceId;
      let device = await queryFirst<{ id: string }>("SELECT id FROM Device WHERE id = ?", [localDeviceId]);
      if (!device) device = await DeviceRepository.create({ id: localDeviceId, deviceName: value.deviceName, status: "REGISTERED", branchId: value.oms?.branchId });
      useDeviceStore.getState().setDevice({ deviceId: localDeviceId, deviceName: value.deviceName, branchId: value.oms?.branchId ?? null, registrationState: "registered", posApiKey: value.oms?.apiKey ?? null, registeredAt: new Date().toISOString() });
      await saveCloudConnection(value);
      await useOmsConnectionStore.getState().checkConnection();
      useBackupSettingsStore.getState().setAutoBackupEnabled(true);
      // Recover uploads interrupted by application shutdown; retries retain the same manifest and idempotency key.
      await execute("UPDATE SyncQueue SET status='PENDING' WHERE entityType='DatabaseBackup' AND status='PROCESSING'");
      setConnectionText("");
      setStatus(`${value.businessName} · ${value.operatingMode === "INDEPENDENT" ? "Independent" : "OMS-dependent"} · Cloud backups enabled`);
      Alert.alert("Dealership connected", "Cloud saving is ready. Add cashier accounts in Settings. Automatic backups run while the POS app is open and signed in.");
      if (useDeviceStore.getState().device.registrationState === "registered") router.replace("/(pos)" as any);
    } catch (error: any) { Alert.alert("Cloud connection", error?.message ?? "Connection failed"); }
    finally { setBusy(false); }
  };
  const upload = async () => {
    if (!useCashierStore.getState().session?.isSuperAdmin) return;
    setBusy(true);
    try {
      await RecoveryService.queueBackupUpload(`manual:${Date.now()}`);
      const result = await SyncQueueService.processPending();
      void runSyncCycle().catch(() => {});
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
  if (!hydrated) return null;
  if (!session?.isSuperAdmin) return <Redirect href={session ? "/(pos)" : "/(auth)"} />;
  return <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
    <View style={{ paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.border, flexDirection: "row", alignItems: "center", gap: 16 }}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back from Cloud Backup" onPress={() => router.canGoBack() ? router.back() : router.replace("/(pos)" as any)} style={{ minHeight: 48, paddingHorizontal: 18, borderRadius: 12, backgroundColor: theme.primary, flexDirection: "row", alignItems: "center", gap: 8 }}><Ionicons name="arrow-back" size={22} color={theme.onPrimary} /><Text style={{ color: theme.onPrimary, fontWeight: "800", fontSize: 16 }}>Back</Text></TouchableOpacity>
      <Text style={{ color: connectionStatus === "connected" ? "#16a34a" : theme.muted, fontWeight: "700" }}>{connectionStatus === "connected" ? "Cloud connected" : connectionStatus === "connecting" ? "Checking connection..." : "Cloud disconnected"}</Text>
    </View>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
    <View style={{ width: "100%", gap: 16 }}>
      <Text style={{ fontSize: 26, fontWeight: "800", color: theme.text }}>Dealership Cloud Backup</Text>
      <Text style={{ color: theme.muted }}>Paste the device connection from OMS → Dealership. Independent stores manage their own products. Dependent stores use the linked OMS catalog and transfers. Sales stay on the device and in its backups.</Text>
      <Text style={{ color: theme.accent }}>{status}</Text>
      {cloudError && <Text accessibilityRole="alert" style={{ color: "#dc2626" }}>Cloud backup needs attention: {cloudError}</Text>}
      {getCloudConnection() && <ModeSwitchPanel disabled={busy} onBusyChange={setBusy} />}
      <Text style={{ color: theme.text, fontWeight: "700" }}>Connect your device</Text>
      <Text style={{ color: theme.muted }}>Scan the QR code shown in OMS, or enter the server and one-time pairing code. Codes expire after ten minutes.</Text>
      <TouchableOpacity disabled={busy} onPress={() => { void (async () => { const access = permission?.granted ? permission : await requestPermission(); if (access.granted) setScanning(true); else Alert.alert("Camera access", "Allow camera access to scan, or enter the code below."); })(); }} style={field}><Text style={{ color: theme.text, textAlign: "center", fontWeight: "700" }}>Scan connection QR code</Text></TouchableOpacity>
      <UploadQrImageButton disabled={busy} onScan={(data) => {
        try { const value = JSON.parse(data); if (!value.serverUrl || (!value.pairingCode && !value.deviceKey)) throw new Error(); setServerUrl(value.serverUrl); setConnectionText(value.pairingCode ?? data); setScanning(false); setStatus("QR image read. Check the server address, then tap Connect Dealership."); }
        catch { Alert.alert("Invalid QR code", "Choose the connection QR image from OMS Dealership."); }
      }} />
      {scanning && <View style={{ gap: 8 }}><CameraView style={{ height: 280, borderRadius: 12 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={({ data }) => {
        try { const value = JSON.parse(data); if (!value.serverUrl || (!value.pairingCode && !value.deviceKey)) throw new Error(); setServerUrl(value.serverUrl); setConnectionText(value.pairingCode ?? data); setScanning(false); setStatus("QR code scanned. Check the server address, then tap Connect Dealership."); }
        catch { setScanning(false); Alert.alert("Invalid QR code", "Scan the connection QR code from OMS Dealership."); }
      }} /><TouchableOpacity onPress={() => setScanning(false)}><Text style={{ color: theme.accent }}>Cancel scanning</Text></TouchableOpacity></View>}
      <TextInput accessibilityLabel="OMS server URL" style={field} placeholder="https://your-oms-server" placeholderTextColor={theme.muted} value={serverUrl} onChangeText={setServerUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      <TextInput accessibilityLabel="Device connection" style={field} placeholder="XXXX-XXXX-XXXX-XXXX" placeholderTextColor={theme.muted} value={connectionText.startsWith("{") ? "QR connection ready" : connectionText} onChangeText={setConnectionText} autoCapitalize="characters" autoCorrect={false} />
      <TouchableOpacity disabled={busy} onPress={() => void connect()} style={{ backgroundColor: theme.primary, padding: 15, borderRadius: 8, opacity: busy ? 0.5 : 1 }}><Text style={{ color: theme.onPrimary, fontWeight: "700", textAlign: "center" }}>{busy ? "Working..." : "Connect Dealership"}</Text></TouchableOpacity>
      {session?.isSuperAdmin && <><TouchableOpacity disabled={busy} onPress={() => void upload()} style={field}><Text style={{ color: theme.text }}>Back Up to Cloud Now</Text></TouchableOpacity><TouchableOpacity disabled={busy} onPress={() => void retry()} style={field}><Text style={{ color: theme.text }}>Retry Uploads</Text></TouchableOpacity></>}
      {session?.isSuperAdmin && <View style={{ ...field, gap: 12 }}>
        <Text style={{ color: theme.text, fontWeight: "800", fontSize: 18 }}>Automatic backup schedule</Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text style={{ color: theme.text }}>Enable automatic backups</Text><Switch value={settings.autoBackupEnabled} onValueChange={settings.setAutoBackupEnabled} /></View>
        <View style={{ flexDirection: "row", gap: 12 }}>{(["INTERVAL", "DAILY"] as const).map(mode => <TouchableOpacity key={mode} onPress={() => settings.setScheduleMode(mode)} style={{ padding: 12, borderRadius: 10, backgroundColor: settings.scheduleMode === mode ? theme.primary : theme.surfaceAlt }}><Text style={{ color: settings.scheduleMode === mode ? theme.onPrimary : theme.text }}>{mode === "DAILY" ? "At a daily time" : "Every few hours"}</Text></TouchableOpacity>)}</View>
        {settings.scheduleMode === "DAILY" ? <TextInput accessibilityLabel="Daily backup time" value={dailyTime} onChangeText={setDailyTime} placeholder="22:00" maxLength={5} keyboardType="numbers-and-punctuation" style={field} /> : <TextInput accessibilityLabel="Backup interval hours" value={hours} onChangeText={setHours} keyboardType="number-pad" maxLength={3} style={field} />}
        <Text style={{ color: theme.muted }}>Device time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Next: {nextBackupAt(settings)?.toLocaleString() ?? "Paused"}</Text>
        <TouchableOpacity onPress={saveSchedule} style={{ backgroundColor: theme.primary, borderRadius: 10, padding: 14 }}><Text style={{ color: theme.onPrimary, textAlign: "center", fontWeight: "700" }}>Save schedule</Text></TouchableOpacity>
        <Text style={{ color: theme.muted, fontSize: 12 }}>Manual backups and automatic backups are labeled separately in OMS. Uploads retry after connectivity returns.</Text>
      </View>}
      <Text style={{ color: theme.muted, fontSize: 12 }}>The cloud connection does not replace your local database. Offline backups remain queued. Maximum cloud backup size: 32 MiB. Keep the app open for automatic uploads.</Text>
    </View>
  </ScrollView></SafeAreaView>;
}

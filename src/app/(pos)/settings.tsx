import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  useWindowDimensions,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useIsDarkTheme, useUiStore } from "@/lib/stores/ui-store";
import { useOmsConnectionStore } from "@/lib/stores/oms-connection-store";
import { SettingsService } from "@/lib/services/settings.service";
import { OmsSyncService } from "@/lib/services/oms-sync.service";
import { AuditService } from "@/lib/services/audit.service";
import { CashierService } from "@/lib/services/cashier.service";
import { DeviceService } from "@/lib/services/device.service";
import { query } from "@/lib/db/connection";

const CURRENCY_OPTIONS = ["USD", "PHP", "CAD", "EUR", "GBP", "AUD", "JPY"] as const;

const EVENT_COLORS: Record<string, { bg: string; text: string }> = {
  SALE_CREATED: { bg: "#dcfce7", text: "#166534" },
  LOGIN_SUCCESS: { bg: "#d1fae5", text: "#065f46" },
  LOGIN_FAILED: { bg: "#fee2e2", text: "#991b1b" },
  LOGOUT: { bg: "#f3f4f6", text: "#374151" },
  TRANSFER: { bg: "#dbeafe", text: "#1e40af" },
};

const AUDIT_FILTERS = ["ALL", "SALE_CREATED", "LOGIN_SUCCESS", "LOGIN_FAILED", "TRANSFER"] as const;
const APPLICATION_SIZES = [50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150] as const;

function ApplicationSizeButtons({ value, onChange, dark }: { value: number; onChange: (value: number) => void; dark: boolean }) {
  return (
    <View style={styles.sizeOptions}>
      {APPLICATION_SIZES.map((size) => {
        const selected = Math.round(value * 100) === size;
        return (
          <TouchableOpacity
            key={size}
            style={[
              styles.sizeOption,
              { backgroundColor: dark ? "#0f141d" : "#f8fafc", borderColor: dark ? "#334155" : "#dbe3ec" },
              selected && styles.sizeOptionSelected,
            ]}
            onPress={() => onChange(size / 100)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.sizeOptionText, { color: dark ? "#cbd5e1" : "#475569" }, selected && styles.sizeOptionTextSelected]}>
              {size}%
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

interface CashierRow {
  id: string;
  displayName: string;
  username: string;
  roleName: string;
}

interface AuditLogEntry {
  id: string;
  eventType: string;
  description: string;
  cashierName: string;
  createdAt: string;
}

const OMS_STORAGE_KEY = "nct-pos-oms";

export default function SettingsScreen() {
  const router = useRouter();
  const device = useDeviceStore((s) => s.device);
  const clearDevice = useDeviceStore((s) => s.clearDevice);
  const session = useCashierStore((s) => s.session);
  const clearSession = useCashierStore((s) => s.clearSession);
  const signOut = useAuthStore((s) => s.signOut);
  const { themeMode, setThemeMode, navigationMode, setNavigationMode, uiScale, setUiScale } = useUiStore();
  const dark = useIsDarkTheme();
  const { width: windowWidth } = useWindowDimensions();
  const isWideColumns = windowWidth >= 900;

  const [storeName, setStoreName] = useState("");
  const [address, setAddress] = useState("");
  const [currencyCode, setCurrencyCode] = useState("PHP");
  const [taxLabel, setTaxLabel] = useState("VAT");
  const [taxRatePercent, setTaxRatePercent] = useState("0");
  const [receiptFooter, setReceiptFooter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [omsUrl, setOmsUrl] = useState("");
  const [omsApiKey, setOmsApiKey] = useState("");
  const [connectPending, setConnectPending] = useState(false);
  const [syncPending, setSyncPending] = useState(false);
  const liveStatus = useOmsConnectionStore((state) => state.status);
  const setLiveStatus = useOmsConnectionStore((state) => state.setStatus);
  const checkOmsConnection = useOmsConnectionStore((state) => state.checkConnection);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const [cashiers, setCashiers] = useState<CashierRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditFilter, setAuditFilter] = useState<string>("ALL");

  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [qrScanning, setQrScanning] = useState(false);

  useEffect(() => {
    const normalizedScale = Math.min(1.5, Math.max(0.5, Math.round(uiScale * 10) / 10));
    if (normalizedScale !== uiScale) setUiScale(normalizedScale);
  }, [setUiScale, uiScale]);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const loadSettings = useCallback(async () => {
    try {
      const settings = await SettingsService.get();
      setStoreName(settings.storeName || "");
      setAddress(settings.address || "");
      setCurrencyCode(settings.currencyCode || "PHP");
      setTaxLabel(settings.taxLabel || "VAT");
      setTaxRatePercent(String(Number((settings.taxRate * 100).toFixed(2))));
      setReceiptFooter(settings.receiptFooter || "");
    } catch {
      // keep defaults
    }
  }, []);

  const verifyLiveConnection = useCallback(async (url: string, key: string) => {
    if (!url) { setLiveStatus("idle"); return; }
    await checkOmsConnection(url, key);
  }, [checkOmsConnection, setLiveStatus]);

  const loadOmsSettings = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(OMS_STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        const state = data?.state ?? data;
        const url = state.serverUrl || state.url || "";
        const key = state.apiKey || "";
        setOmsUrl(url);
        setOmsApiKey(key);
        const ls = state.lastSync || data.lastSync || null;
        setLastSync(ls);
        await verifyLiveConnection(url, key);
      } else {
        setLiveStatus("idle");
      }
    } catch {
      setLiveStatus("idle");
    }
  }, [verifyLiveConnection]);

  const loadUsers = useCallback(async () => {
    try {
      // Prefer Role.name, fallback to raw roleId / CashierRole via join coalesce; ensure Role table may have been seeded as Admin
      const rows = await query<CashierRow>(
        `SELECT c.id, c.displayName, c.username, COALESCE(r.name, (SELECT r2.name FROM Role r2 WHERE r2.id = c.roleId), 'Cashier') as roleName
         FROM Cashier c
         LEFT JOIN Role r ON c.roleId = r.id
         WHERE c.active = 1
         ORDER BY c.displayName ASC`
      );
      // Normalize empty roleName
      setCashiers(rows.map((r) => ({ ...r, roleName: (r.roleName || "Cashier").trim() || "Cashier" })));
    } catch {
      setCashiers([]);
    }
  }, []);

  const loadAuditLogs = useCallback(async () => {
    try {
      const logs = await AuditService.recent(100);
      setAuditLogs(
        logs.map((l) => ({
          id: l.id,
          eventType: l.eventType,
          description: l.description || "",
          cashierName: l.cashierName || "",
          createdAt: l.createdAt,
        }))
      );
    } catch {
      setAuditLogs([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadSettings(), loadOmsSettings(), loadUsers(), loadAuditLogs()]);
      setLoading(false);
    })();
  }, [loadSettings, loadOmsSettings, loadUsers, loadAuditLogs]);

  useFocusEffect(useCallback(() => {
    loadOmsSettings();
    loadUsers();
    loadAuditLogs();
  }, [loadOmsSettings, loadUsers, loadAuditLogs]));

  const handleSaveSettings = async () => {
    const nextTaxRatePercent = Number(taxRatePercent);
    if (!Number.isFinite(nextTaxRatePercent)) {
      Alert.alert("Error", "Tax rate must be a number.");
      return;
    }
    const taxRate = nextTaxRatePercent / 100;
    if (taxRate < 0 || taxRate > 1) {
      Alert.alert("Error", "Tax rate must be between 0 and 100.");
      return;
    }
    setSaving(true);
    try {
      await SettingsService.update({
        storeName: storeName.trim(),
        currencyCode,
        taxLabel: taxLabel.trim(),
        taxRate,
        address: address.trim(),
        receiptFooter: receiptFooter.trim(),
      });
      Alert.alert("Success", "Settings saved.");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const saveOmsSettings = async (url: string, key: string) => {
    try {
      const raw = await AsyncStorage.getItem(OMS_STORAGE_KEY);
      const prev = raw ? JSON.parse(raw) : {};
      const prevState = prev?.state ?? prev;
      await AsyncStorage.setItem(
        OMS_STORAGE_KEY,
        JSON.stringify({ state: { ...prevState, serverUrl: url, apiKey: key }, version: 0 })
      );
    } catch {
      // ignore
    }
  };

  const handleTestConnect = async () => {
    const url = omsUrl.trim();
    if (!url) {
      Alert.alert("Error", "Enter the OMS server URL.");
      return;
    }
    const key = omsApiKey.trim();
    setConnectPending(true);
    setLiveStatus("connecting");
    try {
      const result = await OmsSyncService.connect(url, key);
      if (result.success) {
        setLiveStatus("connected");
        const now = new Date().toISOString();
        setLastSync(now);
        await saveOmsSettings(url, key);
        try {
          const raw = await AsyncStorage.getItem(OMS_STORAGE_KEY);
          const prev = raw ? JSON.parse(raw) : {};
          const prevState = prev?.state ?? prev;
          await AsyncStorage.setItem(OMS_STORAGE_KEY, JSON.stringify({ state: { ...prevState, serverUrl: url, apiKey: key, lastSync: now }, version: 0 }));
        } catch {}
        const s = (result as any).synced;
        const detail = s ? `Inventory: ${s.inventory}, Products: ${s.products}, Transfers: ${s.transfers}` : "";
        Alert.alert("Success", `Connected to OMS successfully!${detail ? "\n" + detail : ""}`);
      } else {
        setLiveStatus("offline");
        Alert.alert("Error", result.error ?? "Connection failed.");
      }
    } catch {
      setLiveStatus("offline");
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setConnectPending(false);
    }
  };

  const openQrScanner = useCallback(async () => {
    if (!cameraPermission?.granted) {
      const p = await requestCameraPermission();
      if (!p.granted) {
        Alert.alert("Camera Required", "Camera permission is needed to scan QR codes.");
        return;
      }
    }
    setShowQrScanner(true);
  }, [cameraPermission, requestCameraPermission]);

  const handleScanQr = useCallback((raw: string) => {
    setQrScanning(true);
    setShowQrScanner(false);
    try {
      const payload = JSON.parse(raw);
      if (payload.server || payload.url) {
        const server = payload.server || payload.url;
        setOmsUrl(server);
        if (payload.apiKey) setOmsApiKey(payload.apiKey);
        Alert.alert("QR Scanned", `Server: ${server}\nTap Test & Connect to verify.`);
      } else {
        Alert.alert("Invalid QR", "This QR code does not contain server connection data.");
      }
    } catch {
      if (raw.startsWith("http")) {
        setOmsUrl(raw);
        Alert.alert("URL Scanned", `Server: ${raw}\nTap Test & Connect to verify.`);
      } else {
        Alert.alert("Invalid QR", "Could not parse QR code data.");
      }
    } finally {
      setQrScanning(false);
    }
  }, []);

  const handleSyncNow = async () => {
    if (!omsUrl.trim()) {
      Alert.alert("Error", "Enter and connect to an OMS server first.");
      return;
    }
    setSyncPending(true);
    try {
      const result = await OmsSyncService.connect(omsUrl.trim(), omsApiKey.trim());
      if (result.success) {
        const s = (result as any).synced;
        const now = new Date().toISOString();
        setLiveStatus("connected");
        setLastSync(now);
        try {
          const raw = await AsyncStorage.getItem(OMS_STORAGE_KEY);
          const prev = raw ? JSON.parse(raw) : {};
          const prevState = prev?.state ?? prev;
          await AsyncStorage.setItem(
            OMS_STORAGE_KEY,
            JSON.stringify({ state: { ...prevState, lastSync: now }, version: 0 })
          );
        } catch {}
        let queueInfo = "";
        try {
          const { SyncQueueService } = await import("@/lib/services/sync-queue.service");
          const r = await SyncQueueService.processPending();
          if (r.processed > 0 || r.failed > 0) queueInfo = `\nQueue: ${r.processed} synced, ${r.failed} failed`;
        } catch {}
        const detail = s ? `Inventory: ${s.inventory}, Products: ${s.products}, Transfers: ${s.transfers}` : "";
        Alert.alert("Success", `Sync completed.${detail ? "\n" + detail : ""}${queueInfo}`);
        await Promise.all([loadUsers(), loadAuditLogs()]);
      } else {
        setLiveStatus("offline");
        Alert.alert("Error", result.error ?? "Sync failed.");
      }
    } catch (e: any) {
      setLiveStatus("offline");
      Alert.alert("Error", e.message ?? "Sync failed.");
    } finally {
      setSyncPending(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          if (session?.sessionId) {
            await CashierService.logout(session.sessionId);
          } else {
            clearSession();
            signOut();
          }
          router.replace("/(auth)");
        },
      },
    ]);
  };

  const handleResetDevice = () => {
    Alert.alert(
      "Reset Device",
      "This will unregister the device and clear all local data. The device will be revoked on the server. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            await DeviceService.notifyServerRevoke();
            await DeviceService.clearRegistration();
            clearSession();
            signOut();
            router.replace("/register");
          },
        },
      ]
    );
  };

  const filteredAuditLogs =
    auditFilter === "ALL"
      ? auditLogs
      : auditLogs.filter((l) => l.eventType === auditFilter);

  // Dark-aware helpers
  const cardBg = dark ? "#141922" : "#ffffff";
  const cardBorder = dark ? "#28303d" : "#dde3ea";
  const sectionTitleColor = dark ? "#e2e8f0" : "#1a202c";
  const sectionDescColor = dark ? "#94a3b8" : "#6b7b8d";
  const fieldLabelColor = dark ? "#94a3b8" : "#6b7b8d";
  const fieldValueColor = dark ? "#e2e8f0" : "#1a202c";
  const borderColor = dark ? "#1e293b" : "#f0f4ff";
  const inputBg = dark ? "#1e293b" : "#f7f9fc";
  const inputBorder = dark ? "#334155" : "#e2e8f0";
  const inputColor = dark ? "#e2e8f0" : "#1a202c";
  const pickerBg = dark ? "#1e293b" : "#f7f9fc";
  const pickerBorder = dark ? "#334155" : "#e2e8f0";
  const pickerTextColor = dark ? "#e2e8f0" : "#1a202c";

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: dark ? "#050a14" : "#f8fbff" }]}>
        <ActivityIndicator size="large" color={dark ? "#60a5fa" : "#17386b"} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: dark ? "#0b0f16" : "#f4f6f8" }]} contentContainerStyle={styles.content}>
      <Text style={[styles.screenTitle, { color: dark ? "#f5f7fa" : "#151a22" }]}>Settings</Text>
      <Text style={[styles.screenSubtitle, { color: dark ? "#8f99a8" : "#667080" }]}>Store, appearance, connections, and device preferences</Text>

      <View style={[styles.twoColRow, isWideColumns && styles.twoColRowWide]}>
        {/* Store Details Card */}
        <Card style={[styles.section, styles.twoColCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Store Details</Text>
        <Text style={[styles.sectionDesc, { color: sectionDescColor }]}>Manage your store information and preferences.</Text>

        <View style={[styles.field, { borderBottomColor: borderColor }]}>
          <Text style={[styles.fieldLabel, { color: fieldLabelColor }]}>Store Name</Text>
          <TextInput
            style={[styles.fieldInput, { backgroundColor: inputBg, borderColor: inputBorder, color: inputColor }]}
            value={storeName}
            onChangeText={setStoreName}
            placeholder="Enter store name"
            placeholderTextColor={dark ? "#475569" : "#b0b8c1"}
          />
        </View>

        <View style={[styles.field, { borderBottomColor: borderColor }]}>
          <Text style={[styles.fieldLabel, { color: fieldLabelColor }]}>Device Name</Text>
          <Text style={[styles.fieldValue, { color: fieldValueColor }]}>{device.deviceName ?? "N/A"}</Text>
        </View>

        <View style={[styles.field, { borderBottomColor: borderColor }]}>
          <Text style={[styles.fieldLabel, { color: fieldLabelColor }]}>Device Code</Text>
          <Text style={[styles.fieldValue, styles.mono, { color: fieldValueColor }]}>{device.deviceCode ?? "N/A"}</Text>
        </View>

        <View style={[styles.field, { borderBottomColor: borderColor }]}>
          <Text style={[styles.fieldLabel, { color: fieldLabelColor }]}>Registration Date</Text>
          <Text style={[styles.fieldValue, { color: fieldValueColor }]}>
            {device.registeredAt ? new Date(device.registeredAt).toLocaleDateString() : "N/A"}
          </Text>
        </View>

        <View style={[styles.field, { borderBottomColor: borderColor }]}>
          <Text style={[styles.fieldLabel, { color: fieldLabelColor }]}>Address</Text>
          <TextInput
            style={[styles.fieldInput, { backgroundColor: inputBg, borderColor: inputBorder, color: inputColor }]}
            value={address}
            onChangeText={setAddress}
            placeholder="Enter address"
            placeholderTextColor={dark ? "#475569" : "#b0b8c1"}
            multiline
          />
        </View>

        <View style={[styles.field, { borderBottomWidth: 0 }]}>
          <Text style={[styles.fieldLabel, { color: fieldLabelColor }]}>Currency</Text>
          <TouchableOpacity
            style={[styles.pickerButton, { backgroundColor: pickerBg, borderColor: pickerBorder }]}
            onPress={() => setShowCurrencyPicker(true)}
          >
            <Text style={[styles.pickerButtonText, { color: pickerTextColor }]}>{currencyCode}</Text>
            <Ionicons name="chevron-down" size={16} color={dark ? "#94a3b8" : "#6b7b8d"} />
          </TouchableOpacity>

        </View>
      </Card>

        {/* Tax Profile Card */}
        <Card style={[styles.section, styles.twoColCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Tax Profile</Text>
        <Text style={[styles.sectionDesc, { color: sectionDescColor }]}>Configure tax settings and receipt footer.</Text>

        <View style={[styles.field, { borderBottomColor: borderColor }]}>
          <Text style={[styles.fieldLabel, { color: fieldLabelColor }]}>Tax Label</Text>
          <TextInput
            style={[styles.fieldInput, { backgroundColor: inputBg, borderColor: inputBorder, color: inputColor }]}
            value={taxLabel}
            onChangeText={setTaxLabel}
            placeholder="e.g. VAT"
            placeholderTextColor={dark ? "#475569" : "#b0b8c1"}
          />
        </View>

        <View style={[styles.field, { borderBottomColor: borderColor }]}>
          <Text style={[styles.fieldLabel, { color: fieldLabelColor }]}>Tax Rate (%)</Text>
          <TextInput
            style={[styles.fieldInput, { backgroundColor: inputBg, borderColor: inputBorder, color: inputColor }]}
            value={taxRatePercent}
            onChangeText={setTaxRatePercent}
            placeholder="0"
            placeholderTextColor={dark ? "#475569" : "#b0b8c1"}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={[styles.fieldColumn, { borderBottomColor: borderColor }]}>
          <Text style={[styles.fieldLabel, { color: fieldLabelColor }]}>Receipt Footer</Text>
          <TextInput
            style={[styles.fieldInput, styles.textArea, { backgroundColor: inputBg, borderColor: inputBorder, color: inputColor }]}
            value={receiptFooter}
            onChangeText={setReceiptFooter}
            placeholder="Thank you for your purchase!"
            placeholderTextColor={dark ? "#475569" : "#b0b8c1"}
            multiline
            numberOfLines={3}
          />
        </View>

        <Button
          title={saving ? "Saving..." : "Save Settings"}
          onPress={handleSaveSettings}
          variant="primary"
          loading={saving}
          icon="checkmark-circle-outline"
          style={styles.saveBtn}
        />
        </Card>
      </View>

      {/* Users Card */}
      <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>
          <Ionicons name="people-outline" size={18} color={sectionTitleColor} /> Users
        </Text>
        <Text style={[styles.sectionDesc, { color: sectionDescColor }]}>Active cashiers synced to this device.</Text>

        {cashiers.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: dark ? "#1e293b" : "#f1f5f9" }]}>
            <Text style={[styles.emptyText, { color: dark ? "#94a3b8" : "#6b7b8d" }]}>
              No users synced yet. Connect to OMS and sync to load users.
            </Text>
          </View>
        ) : (
          cashiers.map((user) => (
            <View key={user.id} style={[styles.userRow, { borderBottomColor: borderColor }]}>
              <View style={[styles.userAvatar, { backgroundColor: dark ? "#1e3a5f" : "#dfeaff" }]}>
                <Text style={[styles.userAvatarText, { color: dark ? "#93c5fd" : "#17386b" }]}>
                  {user.displayName?.substring(0, 2)?.toUpperCase() ?? "U"}
                </Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={[styles.userName, { color: fieldValueColor }]}>{user.displayName}</Text>
                <Text style={[styles.userUsername, { color: fieldLabelColor }]}>@{user.username}</Text>
              </View>
              <View style={[styles.badge, { borderColor: dark ? "#334155" : "#e2e8f0", backgroundColor: dark ? "#1e293b" : "transparent" }]}>
                <Text style={[styles.badgeText, { color: dark ? "#94a3b8" : "#6b7b8d" }]}>{user.roleName || "Cashier"}</Text>
              </View>
              {session?.cashierName === user.displayName && (
                <View style={styles.youBadge}>
                  <Text style={styles.youBadgeText}>You</Text>
                </View>
              )}
            </View>
          ))
        )}
      </Card>

      {/* Audit Logs Card */}
      <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>
          <Ionicons name="document-text-outline" size={18} color={sectionTitleColor} /> Audit Logs
        </Text>
        <Text style={[styles.sectionDesc, { color: sectionDescColor }]}>Recent activity on this device.</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {AUDIT_FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, { backgroundColor: dark ? "#1e293b" : "#f1f5f9" }, auditFilter === f && styles.filterChipActive]}
              onPress={() => setAuditFilter(f)}
            >
              <Text style={[styles.filterChipText, { color: dark ? "#94a3b8" : "#6b7b8d" }, auditFilter === f && styles.filterChipTextActive]}>
                {f === "ALL" ? "ALL" : f.replace("_", " ")}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {filteredAuditLogs.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: dark ? "#1e293b" : "#f1f5f9" }]}>
            <Text style={[styles.emptyText, { color: dark ? "#94a3b8" : "#6b7b8d" }]}>No audit logs recorded yet.</Text>
          </View>
        ) : (
          <View style={styles.auditList}>
            {filteredAuditLogs.map((log) => {
              const colors = EVENT_COLORS[log.eventType] ?? { bg: dark ? "#1e293b" : "#f3f4f6", text: dark ? "#94a3b8" : "#6b7280" };
              return (
                <View key={log.id} style={[styles.auditRow, { borderBottomColor: borderColor }]}>
                  <View style={[styles.eventBadge, { backgroundColor: colors.bg }]}>
                    <Text style={[styles.eventBadgeText, { color: colors.text }]}>
                      {log.eventType}
                    </Text>
                  </View>
                  <View style={styles.auditInfo}>
                    <Text style={[styles.auditDesc, { color: dark ? "#cbd5e1" : "#4a5568" }]} numberOfLines={1}>
                      {log.description || log.cashierName}
                    </Text>
                  </View>
                  <Text style={[styles.auditDate, { color: dark ? "#64748b" : "#94a3b8" }]}>
                    {log.createdAt ? new Date(log.createdAt).toLocaleString() : ""}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </Card>

      {/* OMS Connection Card */}
      <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>OMS Connection</Text>
        <Text style={[styles.sectionDesc, { color: sectionDescColor }]}>
          Connect this device to the NCT OMS server.
        </Text>

        <View style={[styles.fieldColumn, { borderBottomColor: borderColor }]}>
          <Text style={[styles.fieldLabel, { color: fieldLabelColor }]}>Server URL</Text>
          <TextInput
            style={[styles.fieldInput, { backgroundColor: inputBg, borderColor: inputBorder, color: inputColor }]}
            value={omsUrl}
            onChangeText={setOmsUrl}
            placeholder={process.env.EXPO_PUBLIC_OMS_URL ?? "https://staging.nctseafoods.store"}
            placeholderTextColor={dark ? "#475569" : "#b0b8c1"}
            keyboardType="url"
            autoCapitalize="none"
          />
        </View>

        <View style={[styles.fieldColumn, { borderBottomColor: borderColor }]}>
          <Text style={[styles.fieldLabel, { color: fieldLabelColor }]}>API Key</Text>
          <TextInput
            style={[styles.fieldInput, { backgroundColor: inputBg, borderColor: inputBorder, color: inputColor }]}
            value={omsApiKey}
            onChangeText={setOmsApiKey}
            placeholder="Enter API key"
            placeholderTextColor={dark ? "#475569" : "#b0b8c1"}
            secureTextEntry
          />
        </View>

        <View style={styles.omsButtonRow}>
          <Button
            title={connectPending ? "Connecting..." : "Test & Connect"}
            onPress={handleTestConnect}
            variant="primary"
            loading={connectPending}
            icon="wifi-outline"
            style={styles.omsBtn}
          />
          <Button
            title="Scan QR"
            onPress={openQrScanner}
            variant="secondary"
            icon="qr-code-outline"
            style={styles.omsBtn}
          />
          <Button
            title={syncPending ? "Syncing..." : "Sync Now"}
            onPress={handleSyncNow}
            variant="secondary"
            loading={syncPending}
            icon="sync-outline"
            style={styles.omsBtn}
          />
        </View>

        <View style={[styles.statusBar, { backgroundColor: dark ? "#1e293b" : "#f1f5f9" }]}>
          <View
            style={[
              styles.statusDot,
              liveStatus === "connected" && styles.statusConnected,
              liveStatus === "connecting" && styles.statusConnecting,
              liveStatus === "offline" && styles.statusOffline,
              liveStatus === "idle" && styles.statusIdle,
            ]}
          />
          <Text style={[styles.statusText, { color: dark ? "#94a3b8" : "#6b7b8d" }]}>
            {liveStatus === "connected" && "Connected to OMS"}
            {liveStatus === "connecting" && "Connecting to OMS..."}
            {liveStatus === "offline" && "Offline"}
            {liveStatus === "idle" && "Idle"}
          </Text>
          {lastSync && liveStatus === "connected" && (
            <Text style={[styles.syncTime, { color: dark ? "#64748b" : "#94a3b8" }]}>
              Last sync: {new Date(lastSync).toLocaleTimeString()}
            </Text>
          )}
        </View>
      </Card>

      {/* Navigation Style Card */}
      <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Navigation Style</Text>
        <Text style={[styles.sectionDesc, { color: sectionDescColor }]}>Choose how you navigate the app.</Text>

        <View style={styles.navGrid}>
          {([
            { key: "auto" as const, label: "Auto", icon: "phone-portrait-outline" as const, desc: "Auto-detect best layout" },
            { key: "sidebar" as const, label: "Sidebar", icon: "menu-outline" as const, desc: "Floating sidebar" },
            { key: "bottom" as const, label: "Bottom", icon: "grid-outline" as const, desc: "Floating bottom bar" },
          ]).map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.navCard,
                { backgroundColor: dark ? "#1e293b" : "#f8fbff", borderColor: dark ? "#334155" : "#e2e8f0" },
                navigationMode === opt.key && styles.navCardActive,
              ]}
              onPress={() => setNavigationMode(opt.key)}
            >
              <View style={[styles.navIconWrap, navigationMode === opt.key && styles.navIconWrapActive]}>
                <Ionicons name={opt.icon} size={22} color={navigationMode === opt.key ? "#fff" : dark ? "#94a3b8" : "#17386b"} />
              </View>
              <Text style={[styles.navLabel, { color: dark ? "#e2e8f0" : "#1a202c" }, navigationMode === opt.key && styles.navLabelActive]}>
                {opt.label}
              </Text>
              <Text style={[styles.navDesc, { color: dark ? "#94a3b8" : "#6b7b8d" }, navigationMode === opt.key && styles.navDescActive]}>
                {opt.desc}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      {/* Theme Card */}
      <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Theme</Text>
        <Text style={[styles.sectionDesc, { color: sectionDescColor }]}>Select your preferred appearance.</Text>

        <View style={styles.themeGrid}>
          <TouchableOpacity
            style={[
              styles.themeCard,
              { backgroundColor: dark ? "#1e293b" : "#f8fbff", borderColor: dark ? "#334155" : "#e2e8f0" },
              themeMode === "light" && styles.themeCardActive,
            ]}
            onPress={() => setThemeMode("light")}
          >
            <View style={[styles.themeIconWrap, themeMode === "light" && styles.themeIconWrapActive]}>
              <Ionicons name="sunny-outline" size={22} color={themeMode === "light" ? "#fff" : "#f59e0b"} />
            </View>
            <Text style={[styles.themeLabel, { color: dark ? "#e2e8f0" : "#1a202c" }, themeMode === "light" && styles.themeLabelActive]}>
              Light
            </Text>
            <Text style={[styles.themeDesc, { color: dark ? "#94a3b8" : "#6b7b8d" }, themeMode === "light" && styles.themeDescActive]}>
              Bright mode for daytime
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.themeCard,
              { backgroundColor: dark ? "#1e293b" : "#f8fbff", borderColor: dark ? "#334155" : "#e2e8f0" },
              themeMode === "dark" && styles.themeCardActive,
            ]}
            onPress={() => setThemeMode("dark")}
          >
            <View style={[styles.themeIconWrap, themeMode === "dark" && styles.themeIconWrapActive]}>
              <Ionicons name="moon-outline" size={22} color={themeMode === "dark" ? "#fff" : "#6366f1"} />
            </View>
            <Text style={[styles.themeLabel, { color: dark ? "#e2e8f0" : "#1a202c" }, themeMode === "dark" && styles.themeLabelActive]}>
              Dark
            </Text>
            <Text style={[styles.themeDesc, { color: dark ? "#94a3b8" : "#6b7b8d" }, themeMode === "dark" && styles.themeDescActive]}>
              Low-light friendly
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.themeCard,
              { backgroundColor: dark ? "#1e293b" : "#f8fbff", borderColor: dark ? "#334155" : "#e2e8f0" },
              themeMode === "system" && styles.themeCardActive,
            ]}
            onPress={() => setThemeMode("system")}
          >
            <View style={[styles.themeIconWrap, themeMode === "system" && styles.themeIconWrapActive]}>
              <Ionicons name="contrast-outline" size={22} color={themeMode === "system" ? "#fff" : "#0ea5e9"} />
            </View>
            <Text style={[styles.themeLabel, { color: dark ? "#e2e8f0" : "#1a202c" }, themeMode === "system" && styles.themeLabelActive]}>
              Auto
            </Text>
            <Text style={[styles.themeDesc, { color: dark ? "#94a3b8" : "#6b7b8d" }, themeMode === "system" && styles.themeDescActive]}>
              Follow system appearance
            </Text>
          </TouchableOpacity>
        </View>
      </Card>

      <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Application Size</Text>
        <Text style={[styles.sectionDesc, { color: sectionDescColor }]}>Choose the size of text, images, controls, and navigation.</Text>
        <ApplicationSizeButtons value={uiScale} onChange={setUiScale} dark={dark} />
      </Card>

      {/* Device Card */}
      <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Device</Text>
        <Text style={[styles.sectionDesc, { color: sectionDescColor }]}>Session and device management.</Text>

        <View style={[styles.field, { borderBottomColor: borderColor }]}>
          <Text style={[styles.fieldLabel, { color: fieldLabelColor }]}>Registration State</Text>
          <Text style={[styles.fieldValue, { color: fieldValueColor }]}>{device.registrationState}</Text>
        </View>

        <Button
          title="Sign Out"
          onPress={handleSignOut}
          variant="danger"
          icon="log-out-outline"
          style={styles.dangerBtn}
        />
        <Button
          title="Reset Device"
          onPress={handleResetDevice}
          variant="secondary"
          icon="trash-outline"
          style={{ marginTop: 8 }}
        />
      </Card>

      {/* Currency Picker Modal */}
      <Modal visible={showCurrencyPicker} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCurrencyPicker(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: dark ? "#1e293b" : "#fff" }]}>
            <Text style={[styles.modalTitle, { color: dark ? "#e2e8f0" : "#1a202c" }]}>Select Currency</Text>
            {CURRENCY_OPTIONS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.modalOption, currencyCode === c && styles.modalOptionActive, currencyCode === c && dark && { backgroundColor: "#334155" }]}
                onPress={() => {
                  setCurrencyCode(c);
                  setShowCurrencyPicker(false);
                }}
              >
                <Text style={[styles.modalOptionText, { color: dark ? "#cbd5e1" : "#4a5568" }, currencyCode === c && styles.modalOptionTextActive, currencyCode === c && dark && { color: "#60a5fa" }]}>
                  {c}
                </Text>
                {currencyCode === c && (
                  <Ionicons name="checkmark" size={18} color={dark ? "#60a5fa" : "#17386b"} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* QR Scanner Modal */}
      <Modal visible={showQrScanner} animationType="slide" onRequestClose={() => setShowQrScanner(false)}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <CameraView
            style={StyleSheet.absoluteFill}
            onBarcodeScanned={qrScanning ? undefined : ({ data }: { data: string }) => handleScanQr(data)}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          />
          <TouchableOpacity
            style={{ position: "absolute", top: 48, right: 16, zIndex: 10 }}
            onPress={() => setShowQrScanner(false)}
          >
            <Ionicons name="close-circle" size={36} color="#fff" />
          </TouchableOpacity>
          <Text style={{ position: "absolute", bottom: 48, left: 0, right: 0, textAlign: "center", color: "#fff", fontSize: 16, fontWeight: "500", backgroundColor: "rgba(0,0,0,0.5)", paddingVertical: 8 }}>
            Point camera at OMS connection QR code
          </Text>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fbff",
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#151a22",
  },
  screenSubtitle: {
    fontSize: 12,
    marginTop: 3,
    marginBottom: 16,
  },
  twoColRow: {
    flexDirection: "column",
  },
  twoColRowWide: {
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
  },
  twoColCard: {
    flex: 1,
  },
  section: {
    padding: 20,
    marginBottom: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a202c",
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 12,
    color: "#6b7b8d",
    marginBottom: 16,
  },
  field: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f4ff",
  },
  fieldColumn: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f4ff",
  },
  fieldLabel: {
    fontSize: 13,
    color: "#6b7b8d",
  },
  fieldValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a202c",
  },
  mono: {
    fontFamily: "monospace",
  },
  fieldInput: {
    fontSize: 13,
    fontWeight: "500",
    color: "#1a202c",
    textAlign: "right",
    flex: 1,
    marginLeft: 16,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "#f7f9fc",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  textArea: {
    textAlign: "left",
    marginLeft: 0,
    marginTop: 8,
    minHeight: 60,
    textAlignVertical: "top",
  },
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#f7f9fc",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  pickerButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a202c",
  },
  saveBtn: {
    marginTop: 16,
  },
  emptyBox: {
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 16,
  },
  emptyText: {
    fontSize: 13,
    color: "#6b7b8d",
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f4ff",
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#dfeaff",
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#17386b",
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a202c",
  },
  userUsername: {
    fontSize: 11,
    color: "#6b7b8d",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#6b7b8d",
  },
  youBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: "#dcfce7",
  },
  youBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#166534",
  },
  filterRow: {
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: "#17386b",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7b8d",
  },
  filterChipTextActive: {
    color: "#fff",
  },
  auditList: {
    maxHeight: 300,
  },
  auditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f4ff",
  },
  eventBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  eventBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  auditInfo: {
    flex: 1,
    minWidth: 0,
  },
  auditDesc: {
    fontSize: 12,
    color: "#4a5568",
  },
  auditDate: {
    fontSize: 10,
    color: "#94a3b8",
  },
  omsButtonRow: {
    gap: 8,
    marginTop: 4,
  },
  omsBtn: {
    marginBottom: 4,
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#9ca3af",
  },
  statusConnected: {
    backgroundColor: "#22c55e",
  },
  statusConnecting: {
    backgroundColor: "#f59e0b",
  },
  statusOffline: {
    backgroundColor: "#ef4444",
  },
  statusIdle: {
    backgroundColor: "#9ca3af",
  },
  statusText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6b7b8d",
    flex: 1,
  },
  syncTime: {
    fontSize: 11,
    color: "#94a3b8",
  },
  navGrid: {
    flexDirection: "row",
    gap: 10,
  },
  navCard: {
    flex: 1,
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#f8fbff",
    borderWidth: 2,
    borderColor: "#e2e8f0",
  },
  navCardActive: {
    backgroundColor: "#17386b",
    borderColor: "#17386b",
  },
  navIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#dfeaff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  navIconWrapActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  navLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a202c",
    marginBottom: 2,
  },
  navLabelActive: {
    color: "#fff",
  },
  navDesc: {
    fontSize: 10,
    color: "#6b7b8d",
    textAlign: "center",
  },
  navDescActive: {
    color: "rgba(255,255,255,0.7)",
  },
  themeGrid: {
    flexDirection: "row",
    gap: 10,
  },
  themeCard: {
    flex: 1,
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#f8fbff",
    borderWidth: 2,
    borderColor: "#e2e8f0",
  },
  themeCardActive: {
    backgroundColor: "#17386b",
    borderColor: "#17386b",
  },
  themeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#fef3c7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  themeIconWrapActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  themeLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a202c",
    marginBottom: 2,
  },
  themeLabelActive: {
    color: "#fff",
  },
  themeDesc: {
    fontSize: 10,
    color: "#6b7b8d",
    textAlign: "center",
  },
  themeDescActive: {
    color: "rgba(255,255,255,0.7)",
  },
  sizeOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sizeOption: {
    minWidth: 58,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
    borderWidth: 1,
  },
  sizeOptionSelected: {
    backgroundColor: "#17386b",
    borderColor: "#17386b",
  },
  sizeOptionText: {
    fontSize: 12,
    fontWeight: "600",
  },
  sizeOptionTextSelected: {
    color: "#ffffff",
    fontWeight: "700",
  },
  dangerBtn: {
    marginTop: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "80%",
    maxWidth: 300,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a202c",
    marginBottom: 12,
  },
  modalOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  modalOptionActive: {
    backgroundColor: "#dfeaff",
  },
  modalOptionText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4a5568",
  },
  modalOptionTextActive: {
    color: "#17386b",
    fontWeight: "600",
  },
});

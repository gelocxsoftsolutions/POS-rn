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
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { SettingsService } from "@/lib/services/settings.service";
import { OmsSyncService } from "@/lib/services/oms-sync.service";
import { AuditService } from "@/lib/services/audit.service";
import { CashierService } from "@/lib/services/cashier.service";
import { DeviceService } from "@/lib/services/device.service";
import { query } from "@/lib/db/connection";
import { setApiConfig } from "@/lib/api/http";

const CURRENCY_OPTIONS = ["USD", "PHP", "CAD", "EUR", "GBP", "AUD", "JPY"] as const;

const EVENT_COLORS: Record<string, { bg: string; text: string }> = {
  SALE_CREATED: { bg: "#dcfce7", text: "#166534" },
  LOGIN_SUCCESS: { bg: "#d1fae5", text: "#065f46" },
  LOGIN_FAILED: { bg: "#fee2e2", text: "#991b1b" },
  LOGOUT: { bg: "#f3f4f6", text: "#374151" },
  TRANSFER: { bg: "#dbeafe", text: "#1e40af" },
};

const AUDIT_FILTERS = ["ALL", "SALE_CREATED", "LOGIN_SUCCESS", "LOGIN_FAILED", "TRANSFER"] as const;

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
  const { themeMode, setThemeMode, navigationMode, setNavigationMode } = useUiStore();

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
  const [liveStatus, setLiveStatus] = useState<"idle" | "connecting" | "connected" | "offline">("idle");
  const [lastSync, setLastSync] = useState<string | null>(null);

  const [cashiers, setCashiers] = useState<CashierRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditFilter, setAuditFilter] = useState<string>("ALL");

  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

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

  const loadOmsSettings = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(OMS_STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        setOmsUrl(data.url || "");
        setOmsApiKey(data.apiKey || "");
        setLastSync(data.lastSync || null);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const rows = await query<CashierRow>(
        `SELECT c.id, c.displayName, c.username, r.name as roleName
         FROM Cashier c
         LEFT JOIN Role r ON c.roleId = r.id
         WHERE c.active = 1`
      );
      setCashiers(rows);
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
      await AsyncStorage.setItem(
        OMS_STORAGE_KEY,
        JSON.stringify({ ...prev, url, apiKey: key })
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
        setLastSync(new Date().toISOString());
        await saveOmsSettings(url, key);
        Alert.alert("Success", "Connected to OMS successfully!");
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

  const handleScanQr = () => {
    Alert.alert("QR Scanner", "QR scanning requires a barcode scanner library. Install and configure to enable.");
  };

  const handleSyncNow = async () => {
    if (!omsUrl.trim()) {
      Alert.alert("Error", "Enter and connect to an OMS server first.");
      return;
    }
    setSyncPending(true);
    try {
      const result = await OmsSyncService.connect(omsUrl.trim(), omsApiKey.trim());
      if (result.success) {
        setLastSync(new Date().toISOString());
        try {
          const raw = await AsyncStorage.getItem(OMS_STORAGE_KEY);
          const prev = raw ? JSON.parse(raw) : {};
          await AsyncStorage.setItem(
            OMS_STORAGE_KEY,
            JSON.stringify({ ...prev, lastSync: new Date().toISOString() })
          );
        } catch {
          // ignore
        }
        Alert.alert("Success", "Sync completed.");
      } else {
        Alert.alert("Error", result.error ?? "Sync failed.");
      }
    } catch (e: any) {
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
      "This will unregister the device and clear all local data. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#17386b" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.screenTitle}>Settings</Text>

      {/* Store Details Card */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Store Details</Text>
        <Text style={styles.sectionDesc}>Manage your store information and preferences.</Text>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Store Name</Text>
          <TextInput
            style={styles.fieldInput}
            value={storeName}
            onChangeText={setStoreName}
            placeholder="Enter store name"
            placeholderTextColor="#b0b8c1"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Device Name</Text>
          <Text style={styles.fieldValue}>{device.deviceName ?? "N/A"}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Device Code</Text>
          <Text style={[styles.fieldValue, styles.mono]}>{device.deviceCode ?? "N/A"}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Registration Date</Text>
          <Text style={styles.fieldValue}>
            {device.registeredAt ? new Date(device.registeredAt).toLocaleDateString() : "N/A"}
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Address</Text>
          <TextInput
            style={styles.fieldInput}
            value={address}
            onChangeText={setAddress}
            placeholder="Enter address"
            placeholderTextColor="#b0b8c1"
            multiline
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Currency</Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setShowCurrencyPicker(true)}
          >
            <Text style={styles.pickerButtonText}>{currencyCode}</Text>
            <Ionicons name="chevron-down" size={16} color="#6b7b8d" />
          </TouchableOpacity>
        </View>
      </Card>

      {/* Tax Profile Card */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Tax Profile</Text>
        <Text style={styles.sectionDesc}>Configure tax settings and receipt footer.</Text>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Tax Label</Text>
          <TextInput
            style={styles.fieldInput}
            value={taxLabel}
            onChangeText={setTaxLabel}
            placeholder="e.g. VAT"
            placeholderTextColor="#b0b8c1"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Tax Rate (%)</Text>
          <TextInput
            style={styles.fieldInput}
            value={taxRatePercent}
            onChangeText={setTaxRatePercent}
            placeholder="0"
            placeholderTextColor="#b0b8c1"
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.fieldColumn}>
          <Text style={styles.fieldLabel}>Receipt Footer</Text>
          <TextInput
            style={[styles.fieldInput, styles.textArea]}
            value={receiptFooter}
            onChangeText={setReceiptFooter}
            placeholder="Thank you for your purchase!"
            placeholderTextColor="#b0b8c1"
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

      {/* Users Card */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>
          <Ionicons name="people-outline" size={18} color="#1a202c" /> Users
        </Text>
        <Text style={styles.sectionDesc}>Active cashiers synced to this device.</Text>

        {cashiers.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              No users synced yet. Connect to OMS and sync to load users.
            </Text>
          </View>
        ) : (
          cashiers.map((user) => (
            <View key={user.id} style={styles.userRow}>
              <View style={styles.userAvatar}>
                <Text style={styles.userAvatarText}>
                  {user.displayName?.substring(0, 2)?.toUpperCase() ?? "U"}
                </Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{user.displayName}</Text>
                <Text style={styles.userUsername}>@{user.username}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{user.roleName || "Cashier"}</Text>
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
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>
          <Ionicons name="clipboard-list-outline" size={18} color="#1a202c" /> Audit Logs
        </Text>
        <Text style={styles.sectionDesc}>Recent activity on this device.</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {AUDIT_FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, auditFilter === f && styles.filterChipActive]}
              onPress={() => setAuditFilter(f)}
            >
              <Text style={[styles.filterChipText, auditFilter === f && styles.filterChipTextActive]}>
                {f === "ALL" ? "ALL" : f.replace("_", " ")}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {filteredAuditLogs.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No audit logs recorded yet.</Text>
          </View>
        ) : (
          <View style={styles.auditList}>
            {filteredAuditLogs.map((log) => {
              const colors = EVENT_COLORS[log.eventType] ?? { bg: "#f3f4f6", text: "#6b7280" };
              return (
                <View key={log.id} style={styles.auditRow}>
                  <View style={[styles.eventBadge, { backgroundColor: colors.bg }]}>
                    <Text style={[styles.eventBadgeText, { color: colors.text }]}>
                      {log.eventType}
                    </Text>
                  </View>
                  <View style={styles.auditInfo}>
                    <Text style={styles.auditDesc} numberOfLines={1}>
                      {log.description || log.cashierName}
                    </Text>
                  </View>
                  <Text style={styles.auditDate}>
                    {log.createdAt ? new Date(log.createdAt).toLocaleString() : ""}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </Card>

      {/* OMS Connection Card */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>OMS Connection</Text>
        <Text style={styles.sectionDesc}>
          Connect this device to the NCT OMS server.
        </Text>

        <View style={styles.fieldColumn}>
          <Text style={styles.fieldLabel}>Server URL</Text>
          <TextInput
            style={styles.fieldInput}
            value={omsUrl}
            onChangeText={setOmsUrl}
            placeholder={process.env.EXPO_PUBLIC_OMS_URL ?? "https://staging.nctseafoods.store"}
            placeholderTextColor="#b0b8c1"
            keyboardType="url"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.fieldColumn}>
          <Text style={styles.fieldLabel}>API Key</Text>
          <TextInput
            style={styles.fieldInput}
            value={omsApiKey}
            onChangeText={setOmsApiKey}
            placeholder="Enter API key"
            placeholderTextColor="#b0b8c1"
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
            onPress={handleScanQr}
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

        <View style={styles.statusBar}>
          <View
            style={[
              styles.statusDot,
              liveStatus === "connected" && styles.statusConnected,
              liveStatus === "connecting" && styles.statusConnecting,
              liveStatus === "offline" && styles.statusOffline,
              liveStatus === "idle" && styles.statusIdle,
            ]}
          />
          <Text style={styles.statusText}>
            {liveStatus === "connected" && "Connected to OMS"}
            {liveStatus === "connecting" && "Connecting to OMS..."}
            {liveStatus === "offline" && "Offline"}
            {liveStatus === "idle" && "Idle"}
          </Text>
          {lastSync && liveStatus === "connected" && (
            <Text style={styles.syncTime}>
              Last sync: {new Date(lastSync).toLocaleTimeString()}
            </Text>
          )}
        </View>
      </Card>

      {/* Navigation Style Card */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Navigation Style</Text>
        <Text style={styles.sectionDesc}>Choose how you navigate the app.</Text>

        <View style={styles.navGrid}>
          {([
            { key: "auto" as const, label: "Auto", icon: "phone-portrait-outline" as const, desc: "Auto-detect best layout" },
            { key: "sidebar" as const, label: "Sidebar", icon: "menu-outline" as const, desc: "Floating sidebar" },
            { key: "bottom" as const, label: "Bottom", icon: "bar-outline" as const, desc: "Floating bottom bar" },
          ]).map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.navCard, navigationMode === opt.key && styles.navCardActive]}
              onPress={() => setNavigationMode(opt.key)}
            >
              <View style={[styles.navIconWrap, navigationMode === opt.key && styles.navIconWrapActive]}>
                <Ionicons name={opt.icon} size={22} color={navigationMode === opt.key ? "#fff" : "#17386b"} />
              </View>
              <Text style={[styles.navLabel, navigationMode === opt.key && styles.navLabelActive]}>
                {opt.label}
              </Text>
              <Text style={[styles.navDesc, navigationMode === opt.key && styles.navDescActive]}>
                {opt.desc}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      {/* Theme Card */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Theme</Text>
        <Text style={styles.sectionDesc}>Select your preferred appearance.</Text>

        <View style={styles.themeGrid}>
          <TouchableOpacity
            style={[styles.themeCard, themeMode === "light" && styles.themeCardActive]}
            onPress={() => setThemeMode("light")}
          >
            <View style={[styles.themeIconWrap, themeMode === "light" && styles.themeIconWrapActive]}>
              <Ionicons name="sunny-outline" size={22} color={themeMode === "light" ? "#fff" : "#f59e0b"} />
            </View>
            <Text style={[styles.themeLabel, themeMode === "light" && styles.themeLabelActive]}>
              Light
            </Text>
            <Text style={[styles.themeDesc, themeMode === "light" && styles.themeDescActive]}>
              Bright mode for daytime
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.themeCard, themeMode === "dark" && styles.themeCardActive]}
            onPress={() => setThemeMode("dark")}
          >
            <View style={[styles.themeIconWrap, themeMode === "dark" && styles.themeIconWrapActive]}>
              <Ionicons name="moon-outline" size={22} color={themeMode === "dark" ? "#fff" : "#6366f1"} />
            </View>
            <Text style={[styles.themeLabel, themeMode === "dark" && styles.themeLabelActive]}>
              Dark
            </Text>
            <Text style={[styles.themeDesc, themeMode === "dark" && styles.themeDescActive]}>
              Low-light friendly
            </Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* Device Card */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Device</Text>
        <Text style={styles.sectionDesc}>Session and device management.</Text>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Registration State</Text>
          <Text style={styles.fieldValue}>{device.registrationState}</Text>
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
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Currency</Text>
            {CURRENCY_OPTIONS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.modalOption, currencyCode === c && styles.modalOptionActive]}
                onPress={() => {
                  setCurrencyCode(c);
                  setShowCurrencyPicker(false);
                }}
              >
                <Text style={[styles.modalOptionText, currencyCode === c && styles.modalOptionTextActive]}>
                  {c}
                </Text>
                {currencyCode === c && (
                  <Ionicons name="checkmark" size={18} color="#17386b" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
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
    fontSize: 22,
    fontWeight: "700",
    color: "#1a202c",
    marginBottom: 16,
  },
  section: {
    padding: 20,
    marginBottom: 16,
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

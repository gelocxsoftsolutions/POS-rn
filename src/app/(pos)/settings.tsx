import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
  Switch,
  Linking,
  useWindowDimensions,
  Animated,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, type AudioPlayer } from "expo-audio";
import { CameraView, useCameraPermissions } from "expo-camera";
import AsyncStorage from "@/lib/storage/app-storage";
import { File } from "expo-file-system";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useIsDarkTheme, usePosTheme, useUiStore, type FeedbackSound } from "@/lib/stores/ui-store";
import { ThemeColorEditor } from "@/components/ui/theme-color-editor";
import { BarcodeScannerModal } from "@/components/ui/barcode-scanner-modal";
import { UsbBarcodeScannerInput } from "@/components/ui/usb-barcode-scanner-input";
import { useOmsConnectionStore } from "@/lib/stores/oms-connection-store";
import { useAccessSettingsStore } from "@/lib/stores/access-settings-store";
import { usePrinterStore } from "@/lib/stores/printer-store";
import { SettingsService } from "@/lib/services/settings.service";
import { OmsSyncService } from "@/lib/services/oms-sync.service";
import { AuditService } from "@/lib/services/audit.service";
import { CashierService, SUPER_ADMIN_ID } from "@/lib/services/cashier.service";
import { DeviceService } from "@/lib/services/device.service";
import { PermissionService, type PermissionRoleRow, type PermissionUserRow, type UserPermissionOverrides } from "@/lib/services/permission.service";
import { PERMISSION_CATEGORIES, PERMISSION_PRESETS, POS_PERMISSIONS, type PermissionPresetKey } from "@/lib/permissions/catalog";
import { useRolePermissions } from "@/lib/permissions/use-role-permissions";
import { query } from "@/lib/db/connection";
import { playFeedbackSound } from "@/lib/audio/feedback-sound";
import { RecoveryService, type BackupEnvelope } from "@/lib/backup/recovery.service";
import { useBackupListStore } from "@/lib/stores/backup-list-store";
import { useBackupSettingsStore } from "@/lib/stores/backup-settings-store";
import { runAutoBackupNow } from "@/lib/services/auto-backup.service";
import {
  BluetoothPrinter,
  type BluetoothPrinterDevice,
} from "@/lib/printers/bluetooth-printer";

const CURRENCY_OPTIONS = ["USD", "PHP", "CAD", "EUR", "GBP", "AUD", "JPY"] as const;

const formatFileSize = (bytes: number) => {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const AUTO_BACKUP_INTERVAL_PRESETS = [1, 6, 12, 24, 48, 72, 168] as const;
const formatBackupIntervalLabel = (hours: number) => (hours % 24 === 0 ? `${hours / 24}d` : `${hours}h`);

export type SettingsSectionId = "business" | "store" | "tax" | "users" | "permissions" | "security" | "auto_lock" | "audit" | "oms" | "printer" | "hardware_test" | "navigation" | "sales_layout" | "theme" | "sounds" | "display" | "database" | "device";
type SettingsSectionDefinition = {
  id: SettingsSectionId;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  keywords: string;
  adminOnly?: boolean;
};

export const SETTINGS_SECTIONS: SettingsSectionDefinition[] = [
  { id: "business", title: "Business & Receipts", description: "Business identity, branding, OMS connection, and receipt design.", icon: "business-outline", keywords: "business branding company logo OMS dependent receipt designer template" , adminOnly: true },
  { id: "store", title: "Store Details", description: "Store name, device identity, address, and currency.", icon: "storefront-outline", keywords: "store details name address currency device code registration location" },
  { id: "tax", title: "Tax Profile", description: "Tax label, tax rate, and default receipt footer.", icon: "calculator-outline", keywords: "tax profile vat rate percent receipt footer invoice" },
  { id: "users", title: "Users & Shared Sales", description: "Create cashiers, manage accounts, roles, and shared sales.", icon: "people-outline", keywords: "users cashiers roles shared sales create edit delete account", adminOnly: true },
  { id: "permissions", title: "Roles & Permissions", description: "Apply access presets and control what each role can open or change.", icon: "key-outline", keywords: "permissions access roles administrator manager cashier inventory clerk auditor preset pages buttons create edit delete crud", adminOnly: true },
  { id: "security", title: "PIN Security", description: "Failed PIN limit and locked account recovery.", icon: "shield-checkmark-outline", keywords: "security pin failed attempts lock unlock accounts maximum", adminOnly: true },
  { id: "auto_lock", title: "Auto Lock", description: "Automatically sign out an idle POS terminal.", icon: "time-outline", keywords: "security auto lock idle timeout minutes sign out session", adminOnly: true },
  { id: "audit", title: "Audit Logs", description: "Review user, sale, login, and transfer activity.", icon: "document-text-outline", keywords: "audit logs activity events sale login failed logout transfer history", adminOnly: true },
  { id: "oms", title: "OMS & Synchronization", description: "OMS server connection, API key, QR setup, and synchronization.", icon: "cloud-outline", keywords: "oms connection server api key sync synchronization qr online offline" , adminOnly: true },
  { id: "printer", title: "Bluetooth Printer", description: "Pair, connect, and test the thermal receipt printer.", icon: "print-outline", keywords: "bluetooth thermal printer jk-5802h receipt esc pos paired device test print", adminOnly: true },
  { id: "hardware_test", title: "Hardware Test", description: "Test the cash drawer, camera scanner, and USB barcode scanner.", icon: "hardware-chip-outline", keywords: "test open cash register drawer bluetooth printer camera usb barcode scanner hardware", adminOnly: true },
  { id: "navigation", title: "Navigation Style", description: "Choose automatic, sidebar, or bottom navigation.", icon: "grid-outline", keywords: "navigation style sidebar bottom auto menu" },
  { id: "sales_layout", title: "Sales Layout", description: "Choose a left- or right-handed checkout layout.", icon: "swap-horizontal-outline", keywords: "sales layout handed left right cart dominant hand checkout" },
  { id: "theme", title: "Theme & Colors", description: "Light, dark, and custom colors throughout the POS.", icon: "color-palette-outline", keywords: "theme appearance light dark auto system color palette primary accent background navigation text border" },
  { id: "sounds", title: "Sounds", description: "Checkout, transfer, connection sounds, and volume.", icon: "volume-high-outline", keywords: "sounds audio volume mute notifications feedback checkout transfer connected failed" },
  { id: "display", title: "Application Size", description: "Scale text, images, controls, and navigation.", icon: "resize-outline", keywords: "application size zoom scale text images controls accessibility display" },
  { id: "database", title: "Database & Recovery", description: "List, restore, or delete backups and configure automatic backups.", icon: "server-outline", keywords: "database backup export import recovery restore checksum schema sqlite file data auto automatic schedule interval hours list delete remove local files", adminOnly: true },
  { id: "device", title: "Device & Session", description: "Registration status, sign out, and device reset.", icon: "tablet-portrait-outline", keywords: "device session sign out logout reset registration terminal" },
];

const SECTION_MATCHERS: Record<SettingsSectionId, string[]> = {
  business: ["business branding receipt designer"],
  store: ["store details"],
  tax: ["tax profile"],
  users: ["users cashiers roles"],
  permissions: ["permissions access roles presets"],
  security: ["security pin"],
  auto_lock: ["security auto lock"],
  audit: ["audit logs"],
  oms: ["oms connection"],
  printer: ["bluetooth thermal printer"],
  hardware_test: ["test open cash register"],
  navigation: ["navigation style"],
  sales_layout: ["sales layout"],
  theme: ["theme appearance"],
  sounds: ["sounds audio"],
  display: ["application size"],
  database: ["database backup export import recovery restore"],
  device: ["device session"],
};

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
  const theme = usePosTheme();
  return (
    <View style={styles.sizeOptions}>
      {APPLICATION_SIZES.map((size) => {
        const selected = Math.round(value * 100) === size;
        return (
          <TouchableOpacity
            key={size}
            style={[
              styles.sizeOption,
              { backgroundColor: selected ? theme.primary : theme.surfaceAlt, borderColor: selected ? theme.primary : theme.border },
            ]}
            onPress={() => onChange(size / 100)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.sizeOptionText, { color: selected ? theme.onPrimary : theme.text }]}>
              {size}%
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function SoundVolumeControl({
  title,
  icon,
  value,
  muted,
  dark,
  onChange,
  onPreview,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  muted: boolean;
  dark: boolean;
  onChange: (value: number) => void;
  onPreview: () => void;
}) {
  const theme = usePosTheme();
  const percent = Math.round(value * 100);
  const adjust = (delta: number) => onChange(Math.round((value + delta) * 10) / 10);
  const buttonColor = theme.accent;

  return (
    <View style={[styles.soundItem, { borderBottomColor: theme.border }]}>
      <View style={styles.soundItemHeader}>
        <View style={[styles.soundItemIcon, { backgroundColor: theme.surfaceAlt }]}>
          <Ionicons name={icon} size={18} color={theme.accent} />
        </View>
        <Text style={[styles.soundItemTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.soundItemPercent, { color: muted ? theme.muted : buttonColor }]}>{percent}%</Text>
        <TouchableOpacity
          style={[
            styles.soundItemPreview,
            { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
            (muted || value <= 0) && styles.volumeButtonDisabled,
          ]}
          onPress={onPreview}
          disabled={muted || value <= 0}
          accessibilityLabel={`Preview ${title} sound`}
        >
          <Ionicons name="play" size={15} color={buttonColor} />
        </TouchableOpacity>
      </View>
      <View style={styles.volumeControl}>
        <TouchableOpacity
          style={[styles.soundStepButton, { borderColor: theme.border }, value <= 0 && styles.volumeButtonDisabled]}
          onPress={() => adjust(-0.1)}
          disabled={value <= 0}
          accessibilityLabel={`Lower ${title} volume`}
        >
          <Ionicons name="remove" size={17} color={buttonColor} />
        </TouchableOpacity>
        <View style={[styles.volumeTrack, { backgroundColor: theme.surfaceAlt }]}>
          <View style={[styles.volumeFill, { width: `${percent}%`, opacity: muted ? 0.45 : 1, backgroundColor: theme.accent }]} />
        </View>
        <TouchableOpacity
          style={[styles.soundStepButton, { borderColor: theme.border }, value >= 1 && styles.volumeButtonDisabled]}
          onPress={() => adjust(0.1)}
          disabled={value >= 1}
          accessibilityLabel={`Raise ${title} volume`}
        >
          <Ionicons name="add" size={17} color={buttonColor} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface CashierRow {
  id: string;
  displayName: string;
  username: string | null;
  roleName: string;
  roleId: string | null;
  failedPinAttempts: number;
  accountLocked: number;
  accountLockedAt: string | null;
}

interface AuditLogEntry {
  id: string;
  eventType: string;
  description: string;
  cashierName: string;
  createdAt: string;
}

const OMS_STORAGE_KEY = "nct-pos-oms";
const LAST_SETTINGS_SECTION_KEY = "nct-pos-last-settings-section";

export default function SettingsScreen() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("store");
  const settingsSectionRestoredRef = useRef(false);
  const detailAnimation = useRef(new Animated.Value(1)).current;
  const detailScrollRef = useRef<ScrollView | null>(null);
  const activeSectionDefinition = SETTINGS_SECTIONS.find((item) => item.id === activeSection) ?? null;
  const checkoutPreviewPlayer = useAudioPlayer(
    require("../../../assets/sounds/cash-register-sound.wav")
  );
  const transferPreviewPlayer = useAudioPlayer(
    require("../../../assets/sounds/transfer-received.wav")
  );
  const omsConnectedPlayer = useAudioPlayer(
    require("../../../assets/sounds/oms-connected.wav")
  );
  const omsConnectionFailedPlayer = useAudioPlayer(
    require("../../../assets/sounds/oms-connection-failed.wav")
  );
  const device = useDeviceStore((s) => s.device);
  const clearDevice = useDeviceStore((s) => s.clearDevice);
  const session = useCashierStore((s) => s.session);
  const clearSession = useCashierStore((s) => s.clearSession);
  const signOut = useAuthStore((s) => s.signOut);
  const {
    themeMode,
    setThemeMode,
    navigationMode,
    setNavigationMode,
    salesHandedness,
    setSalesHandedness,
    uiScale,
    setUiScale,
    soundMuted,
    setSoundMuted,
    soundVolume,
    setSoundVolume,
    soundVolumes,
    setFeedbackSoundVolume,
  } = useUiStore();
  const dark = useIsDarkTheme();
  const posTheme = usePosTheme();
  const autoLockMinutes = useAccessSettingsStore((state) => state.autoLockMinutes);
  const setAutoLockMinutes = useAccessSettingsStore((state) => state.setAutoLockMinutes);
  const maxPinAttempts = useAccessSettingsStore((state) => state.maxPinAttempts);
  const setMaxPinAttempts = useAccessSettingsStore((state) => state.setMaxPinAttempts);
  const salesGroupCashierIds = useAccessSettingsStore((state) => state.salesGroupCashierIds);
  const toggleCashierLink = useAccessSettingsStore((state) => state.toggleCashierLink);
  const removeCashierFromGroup = useAccessSettingsStore((state) => state.removeCashierFromGroup);
  const { width: windowWidth } = useWindowDimensions();
  const isWideColumns = windowWidth >= 900;
  const [settingsSearch, setSettingsSearch] = useState("");
  const [backupBusy, setBackupBusy] = useState<"export" | "import" | null>(null);
  const [selectedBackup, setSelectedBackup] = useState<{ file: File; envelope: BackupEnvelope } | null>(null);
  const [busyBackupUri, setBusyBackupUri] = useState<string | null>(null);
  const [restorePinVisible, setRestorePinVisible] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<{ uri: string; label: string } | null>(null);
  const [restorePin, setRestorePin] = useState("");
  const [restorePinError, setRestorePinError] = useState<string | null>(null);
  const [restorePinBusy, setRestorePinBusy] = useState(false);
  const restoreLockRef = useRef(false);
  const [backupIntervalInput, setBackupIntervalInput] = useState(() => String(useBackupSettingsStore.getState().autoBackupIntervalHours));
  const backupItems = useBackupListStore((state) => state.items);
  const backupListLoading = useBackupListStore((state) => state.loading);
  const refreshBackupList = useBackupListStore((state) => state.refresh);
  const autoBackupEnabled = useBackupSettingsStore((state) => state.autoBackupEnabled);
  const autoBackupIntervalHours = useBackupSettingsStore((state) => state.autoBackupIntervalHours);
  const lastAutoBackupAt = useBackupSettingsStore((state) => state.lastAutoBackupAt);
  const setAutoBackupEnabled = useBackupSettingsStore((state) => state.setAutoBackupEnabled);
  const setAutoBackupIntervalHours = useBackupSettingsStore((state) => state.setAutoBackupIntervalHours);
  const nextAutoBackupLabel = useMemo(() => {
    if (!autoBackupEnabled) return "";
    const nowMs = Date.now();
    const baseMs = lastAutoBackupAt ? new Date(lastAutoBackupAt).valueOf() : nowMs;
    const diffHours = Math.max(0, (baseMs + autoBackupIntervalHours * 3_600_000 - nowMs) / 3_600_000);
    if (!lastAutoBackupAt) return "right away on the next check";
    if (diffHours < 1) return `in ${Math.max(1, Math.round(diffHours * 60))} min`;
    if (diffHours < 48) return `in ${Math.max(1, Math.round(diffHours))} hours`;
    return `in ${Math.max(1, Math.round(diffHours / 24))} days`;
  }, [autoBackupEnabled, autoBackupIntervalHours, lastAutoBackupAt]);

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
  const selectedPrinter = usePrinterStore((state) => state.selectedPrinter);
  const setSelectedPrinter = usePrinterStore((state) => state.setSelectedPrinter);
  const [pairedPrinters, setPairedPrinters] = useState<BluetoothPrinterDevice[]>([]);
  const [connectedPrinterId, setConnectedPrinterId] = useState<string | null>(null);
  const [printerAction, setPrinterAction] = useState<"refresh" | "connect" | "test" | "drawer" | "disconnect" | null>(null);

  const [cashiers, setCashiers] = useState<CashierRow[]>([]);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [editingUser, setEditingUser] = useState<CashierRow | null>(null);
  const [newUserName, setNewUserName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newUserPin, setNewUserPin] = useState("");
  const [newUserPinConfirm, setNewUserPinConfirm] = useState("");
  const [newUserRoleId, setNewUserRoleId] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [permissionRoles, setPermissionRoles] = useState<PermissionRoleRow[]>([]);
  const [selectedPermissionRoleId, setSelectedPermissionRoleId] = useState("");
  const selectedPermissionRoleIdRef = useRef("");
  const [selectedRolePermissions, setSelectedRolePermissions] = useState<string[]>([]);
  const [permissionUsers, setPermissionUsers] = useState<PermissionUserRow[]>([]);
  const [selectedPermissionUserId, setSelectedPermissionUserId] = useState("");
  const selectedPermissionUserIdRef = useRef("");
  const [selectedUserOverrides, setSelectedUserOverrides] = useState<UserPermissionOverrides>({});
  const [showPermissionRolePicker, setShowPermissionRolePicker] = useState(false);
  const [hardwareScannerVisible, setHardwareScannerVisible] = useState(false);
  const [hardwareScanResult, setHardwareScanResult] = useState("");
  const [permissionsBusy, setPermissionsBusy] = useState(false);
  const [autoLockValue, setAutoLockValue] = useState(() => String(autoLockMinutes >= 60 && autoLockMinutes % 60 === 0 ? autoLockMinutes / 60 : autoLockMinutes || 15));
  const [autoLockUnit, setAutoLockUnit] = useState<"minutes" | "hours">(() => autoLockMinutes >= 60 && autoLockMinutes % 60 === 0 ? "hours" : "minutes");
  const [maxPinAttemptsValue, setMaxPinAttemptsValue] = useState(() => String(maxPinAttempts || 5));
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditFilter, setAuditFilter] = useState<string>("ALL");

  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [qrScanning, setQrScanning] = useState(false);
  const isSuperAdmin = Boolean(session?.isSuperAdmin);
  const roleAccess = useRolePermissions();
  const canManageSettings = isSuperAdmin || roleAccess.has("POS_SETTINGS");
  const canManageUsers = isSuperAdmin || roleAccess.has("POS_USERS");
  const canViewAudit = isSuperAdmin || roleAccess.has("POS_AUDIT");
  const canManageBackups = isSuperAdmin || roleAccess.has("POS_BACKUP");
  const isBuiltInSuperAdmin = session?.cashierId === SUPER_ADMIN_ID;

  useFocusEffect(useCallback(() => {
    if (canManageBackups) void refreshBackupList();
  }, [canManageBackups, refreshBackupList]));

  useEffect(() => {
    const normalizedScale = Math.min(1.5, Math.max(0.5, Math.round(uiScale * 10) / 10));
    if (normalizedScale !== uiScale) setUiScale(normalizedScale);
  }, [setUiScale, uiScale]);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(LAST_SETTINGS_SECTION_KEY)
      .then((saved) => {
        if (active && saved && SETTINGS_SECTIONS.some((section) => section.id === saved)) setActiveSection(saved as SettingsSectionId);
      })
      .finally(() => { settingsSectionRestoredRef.current = true; });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (settingsSectionRestoredRef.current) void AsyncStorage.setItem(LAST_SETTINGS_SECTION_KEY, activeSection);
  }, [activeSection]);

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
        `SELECT c.id, c.displayName, c.username, c.roleId, c.failedPinAttempts, c.accountLocked, c.accountLockedAt,
                COALESCE(r.name, (SELECT r2.name FROM Role r2 WHERE r2.id = c.roleId), 'Cashier') as roleName
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

  const loadPermissionSettings = useCallback(async () => {
    try {
      await PermissionService.ensureDefaults();
      const roles = await PermissionService.getRoles();
      setPermissionRoles(roles);
      const currentRoleId = selectedPermissionRoleIdRef.current;
      const nextRoleId = currentRoleId && roles.some((role) => role.id === currentRoleId)
        ? currentRoleId
        : roles.find((role) => role.name.toLowerCase() !== "admin")?.id ?? roles[0]?.id ?? "";
      selectedPermissionRoleIdRef.current = nextRoleId;
      setSelectedPermissionRoleId(nextRoleId);
      setSelectedRolePermissions(nextRoleId ? await PermissionService.getRolePermissions(nextRoleId) : []);
      const users = nextRoleId ? await PermissionService.getUsersByRole(nextRoleId) : [];
      setPermissionUsers(users);
      const currentUserId = selectedPermissionUserIdRef.current;
      const nextUserId = users.some((user) => user.id === currentUserId)
        ? currentUserId
        : users[0]?.id ?? "";
      selectedPermissionUserIdRef.current = nextUserId;
      setSelectedPermissionUserId(nextUserId);
      setSelectedUserOverrides(nextUserId ? await PermissionService.getUserPermissionOverrides(nextUserId) : {});
    } catch {
      setPermissionRoles([]);
      setSelectedRolePermissions([]);
      setPermissionUsers([]);
      selectedPermissionRoleIdRef.current = "";
      selectedPermissionUserIdRef.current = "";
      setSelectedPermissionUserId("");
      setSelectedUserOverrides({});
    }
  }, []);

  const applyPinSecurity = useCallback(() => {
    const attempts = Number(maxPinAttemptsValue);
    if (!Number.isFinite(attempts) || attempts < 1 || attempts > 20) {
      Alert.alert("Security", "Failed PIN attempts must be between 1 and 20.");
      return;
    }
    setMaxPinAttempts(attempts);
    setMaxPinAttemptsValue(String(Math.floor(attempts)));
    Alert.alert("Security Updated", `Accounts will lock after ${Math.floor(attempts)} failed PIN attempts.`);
  }, [maxPinAttemptsValue, setMaxPinAttempts]);

  const handleUnlockUser = useCallback(async (user: CashierRow) => {
    try {
      await CashierService.unlockManagedUser(user.id);
      await loadUsers();
      Alert.alert("Account Unlocked", `${user.displayName} can sign in again.`);
    } catch (error: any) {
      Alert.alert("Unlock Failed", error?.message ?? "Unable to unlock this account.");
    }
  }, [loadUsers]);

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
      await Promise.all([loadSettings(), loadOmsSettings(), loadUsers(), loadAuditLogs(), loadPermissionSettings()]);
      setLoading(false);
    })();
  }, [loadSettings, loadOmsSettings, loadUsers, loadAuditLogs, loadPermissionSettings]);

  useFocusEffect(useCallback(() => {
    loadOmsSettings();
    loadUsers();
    loadAuditLogs();
    loadPermissionSettings();
  }, [loadOmsSettings, loadUsers, loadAuditLogs, loadPermissionSettings]));

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!selectedPrinter) {
      setConnectedPrinterId(null);
      return () => { active = false; };
    }
    BluetoothPrinter.isConnected(selectedPrinter.address)
      .then((connected) => {
        if (active) setConnectedPrinterId(connected ? selectedPrinter.id : null);
      })
      .catch(() => {
        if (active) setConnectedPrinterId(null);
      });
    return () => { active = false; };
  }, [selectedPrinter]));

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

  const playOmsConnectionSound = useCallback(async (connected: boolean) => {
    const player = connected ? omsConnectedPlayer : omsConnectionFailedPlayer;
    const individualVolume = connected
      ? soundVolumes?.omsConnected ?? 1
      : soundVolumes?.omsConnectionFailed ?? 1;
    await playFeedbackSound(player, {
      muted: soundMuted,
      volume: soundVolume * individualVolume,
    });
  }, [omsConnectedPlayer, omsConnectionFailedPlayer, soundMuted, soundVolume, soundVolumes]);

  const playSoundPreview = useCallback(async (player: AudioPlayer, sound: FeedbackSound) => {
    await playFeedbackSound(player, {
      muted: soundMuted,
      volume: soundVolume * (soundVolumes?.[sound] ?? 1),
    });
  }, [soundMuted, soundVolume, soundVolumes]);

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
        void playOmsConnectionSound(true);
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
        void playOmsConnectionSound(false);
        setLiveStatus("offline");
        Alert.alert("Error", result.error ?? "Connection failed.");
      }
    } catch {
      void playOmsConnectionSound(false);
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

  const handleSelectBackup = async () => {
    setBackupBusy("import");
    try {
      const picked = await File.pickFileAsync({ mimeTypes: ["application/octet-stream", "application/json", "*/*"] });
      if (picked.canceled || !picked.result) return;
      const envelope = await RecoveryService.validate(picked.result.uri);
      setSelectedBackup({ file: picked.result, envelope });
    } catch (error: any) {
      Alert.alert("Import database", error?.message ?? "The selected file is not a valid POS backup.");
      setSelectedBackup(null);
    } finally { setBackupBusy(null); }
  };

  const handleCreateLocalBackup = async () => {
    setBackupBusy("export");
    try {
      const { envelope } = await RecoveryService.createBackup();
      await refreshBackupList();
      Alert.alert("Local backup created", `${envelope.totals.sales} sales, ${envelope.totals.products} active products, and ${envelope.totals.inventoryQuantity} inventory units were saved and verified.`);
    } catch (error: any) {
      Alert.alert("Create backup", error?.message ?? "Unable to create the database backup.");
    } finally { setBackupBusy(null); }
  };

  const handleDeleteBackup = (uri: string, name: string) => {
    Alert.alert(
      "Delete backup",
      `Are you sure you want to delete ${name}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void (async () => {
          setBusyBackupUri(uri);
          try {
            await RecoveryService.deleteBackup(uri);
            await refreshBackupList();
          } catch (error: any) {
            Alert.alert("Delete backup", error?.message ?? "Unable to delete the backup file.");
          } finally {
            setBusyBackupUri(null);
          }
        })() }
      ]
    );
  };

  const handleRunAutoBackup = async () => {
    setBackupBusy("export");
    try {
      await runAutoBackupNow();
      await refreshBackupList();
      Alert.alert("Auto backup created", "A checksum-verified local backup was created.");
    } catch (error: any) {
      Alert.alert("Auto backup", error?.message ?? "Unable to create the auto backup.");
    } finally {
      setBackupBusy(null);
    }
  };

  const handleApplyBackupInterval = () => {
    const parsed = Number(backupIntervalInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      Alert.alert("Auto backup", "Enter a valid number of hours (at least 1).");
      setBackupIntervalInput(String(autoBackupIntervalHours));
      return;
    }
    const value = Math.min(168, Math.max(1, Math.round(parsed)));
    setAutoBackupIntervalHours(value);
    setBackupIntervalInput(String(value));
  };

  const handleBackupIntervalPreset = (hours: number) => {
    const value = Math.min(168, Math.max(1, Math.round(hours)));
    setAutoBackupIntervalHours(value);
    setBackupIntervalInput(String(value));
  };

  const requestRestore = (uri: string, label: string) => {
    setRestoreTarget({ uri, label });
    setRestorePin("");
    setRestorePinError(null);
    setRestorePinVisible(true);
  };

  const handleRestoreBackup = (uri?: string, label?: string) => {
    const target = uri ?? selectedBackup?.file.uri;
    if (!target) return;
    requestRestore(target, label ?? selectedBackup?.file.name ?? "");
  };

  const confirmRestoreWithPin = () => {
    if (!restoreTarget || restoreLockRef.current) return;
    if (!restorePin.trim()) {
      setRestorePinError("Enter your PIN to continue.");
      return;
    }
    restoreLockRef.current = true;
    setRestorePinBusy(true);
    (async () => {
      try {
        const verification = await CashierService.verifyCurrentUserPin(restorePin.trim());
        if (!verification.success) {
          setRestorePinError(verification.error ?? "Incorrect PIN.");
          return;
        }
        const target = restoreTarget.uri;
        setRestorePinVisible(false);
        setRestoreTarget(null);
        setBackupBusy("import");
        try {
          await RecoveryService.restoreBackup(target);
          setSelectedBackup(null);
          await refreshBackupList();
          Alert.alert("Database restored", "The database and branding assets were restored and verified. Return to sign-in before continuing.", [
            { text: "Continue", onPress: () => router.replace("/(auth)") },
          ]);
        } catch (error: any) {
          Alert.alert("Restore database", error?.message ?? "The backup could not be restored.");
        } finally { setBackupBusy(null); }
      } catch (error: any) {
        setRestorePinError(error?.message ?? "Unable to verify your PIN.");
      } finally {
        restoreLockRef.current = false;
        setRestorePinBusy(false);
      }
    })().catch(() => { restoreLockRef.current = false; setRestorePinBusy(false); });
  };

  const loadPairedPrinters = async () => {
    setPrinterAction("refresh");
    try {
      const devices = await BluetoothPrinter.getPairedDevices();
      setPairedPrinters(devices);
      const connected = devices.find((item) => item.connected);
      setConnectedPrinterId(connected?.id ?? null);
      if (devices.length === 0) {
        Alert.alert(
          "No Paired Printers",
          "Pair the JK-5802H in Android Bluetooth settings, then refresh this list."
        );
      }
    } catch (error: any) {
      Alert.alert("Bluetooth Printer", error?.message ?? "Unable to load paired devices.");
    } finally {
      setPrinterAction(null);
    }
  };

  const handleConnectPrinter = async () => {
    if (!selectedPrinter) {
      Alert.alert("Bluetooth Printer", "Select the JK-5802H from the paired devices first.");
      return;
    }
    setPrinterAction("connect");
    try {
      await BluetoothPrinter.connect(selectedPrinter.address);
      setConnectedPrinterId(selectedPrinter.id);
      Alert.alert("Printer Connected", `${selectedPrinter.name} is ready for ESC/POS printing.`);
    } catch (error: any) {
      setConnectedPrinterId(null);
      Alert.alert("Connection Failed", error?.message ?? "Unable to connect to the printer.");
    } finally {
      setPrinterAction(null);
    }
  };

  const handleDisconnectPrinter = async () => {
    setPrinterAction("disconnect");
    try {
      await BluetoothPrinter.disconnect();
      setConnectedPrinterId(null);
    } catch (error: any) {
      Alert.alert("Bluetooth Printer", error?.message ?? "Unable to disconnect the printer.");
    } finally {
      setPrinterAction(null);
    }
  };

  const handlePrinterTest = async () => {
    setPrinterAction("test");
    try {
      await BluetoothPrinter.printTest();
      Alert.alert("Test Sent", "A short 58mm test slip was sent to the printer.");
    } catch (error: any) {
      setConnectedPrinterId(null);
      Alert.alert("Test Print Failed", error?.message ?? "Unable to print the test slip.");
    } finally {
      setPrinterAction(null);
    }
  };

  const handleCashRegisterTest = async () => {
    if (!isSuperAdmin) return;
    if (!selectedPrinter) {
      Alert.alert("Open Cash Register", "Select a Bluetooth thermal printer first.");
      return;
    }

    setPrinterAction("drawer");
    try {
      await BluetoothPrinter.openCashDrawer(selectedPrinter.address);
      setConnectedPrinterId(selectedPrinter.id);
      Alert.alert("Command Sent", "The open cash register command was sent to the selected printer.");
    } catch (error: any) {
      setConnectedPrinterId(null);
      Alert.alert(
        "Cash Register Test Failed",
        error?.message ?? "Unable to open the cash register. Check its cable and printer connection."
      );
    } finally {
      setPrinterAction(null);
    }
  };

  const resetUserForm = () => {
    setNewUserName("");
    setNewUsername("");
    setNewUserPin("");
    setNewUserPinConfirm("");
    setNewUserRoleId(permissionRoles.find((role) => role.name.toLowerCase() === "cashier")?.id ?? "");
    setEditingUser(null);
  };

  const openCreateUser = () => {
    resetUserForm();
    setShowCreateUser(true);
  };

  const openEditUser = (user: CashierRow) => {
    setEditingUser(user);
    setNewUserName(user.displayName);
    setNewUsername(user.username ?? "");
    setNewUserPin("");
    setNewUserPinConfirm("");
    setNewUserRoleId(user.roleId ?? permissionRoles.find((role) => role.name.toLowerCase() === "cashier")?.id ?? "");
    setShowCreateUser(true);
  };

  const closeUserModal = () => {
    setShowCreateUser(false);
    resetUserForm();
  };

  const handleSaveUser = async () => {
    if (newUserPin !== newUserPinConfirm) {
      Alert.alert(editingUser ? "Edit User" : "Create User", "The PIN confirmation does not match.");
      return;
    }
    if (!editingUser && !newUserPin) {
      Alert.alert("Create User", "Enter a 6-digit PIN for the new user.");
      return;
    }
    setCreatingUser(true);
    try {
      if (editingUser) {
        await CashierService.updateManagedUser(editingUser.id, {
          displayName: newUserName,
          username: newUsername,
          pin: newUserPin || undefined,
          roleId: newUserRoleId || undefined,
        });
      } else {
        await CashierService.createLocalUser({
          displayName: newUserName,
          username: newUsername,
          pin: newUserPin,
          roleId: newUserRoleId || permissionRoles.find((role) => role.name.toLowerCase() === "cashier")?.id,
        });
      }
      const wasEditing = Boolean(editingUser);
      closeUserModal();
      await loadUsers();
      Alert.alert(wasEditing ? "User Updated" : "User Created", wasEditing ? "The user's details have been saved." : "The new user can now sign in with their PIN.");
    } catch (error: any) {
      Alert.alert(editingUser ? "Edit User" : "Create User", error?.message ?? "Unable to save the user.");
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDeleteUser = (user: CashierRow) => {
    if (user.id === session?.cashierId) {
      Alert.alert("Delete User", "You cannot delete the account currently signed in.");
      return;
    }
    Alert.alert(
      "Delete User",
      `Delete ${user.displayName}'s login from this device? Existing receipts and sales will be kept.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await CashierService.deleteLocalUser(user.id);
              removeCashierFromGroup(user.id);
              await loadUsers();
            } catch (error: any) {
              Alert.alert("Delete User", error?.message ?? "Unable to delete the user.");
            }
          },
        },
      ]
    );
  };

  const selectPermissionRole = async (roleId: string) => {
    selectedPermissionRoleIdRef.current = roleId;
    setSelectedPermissionRoleId(roleId);
    setShowPermissionRolePicker(false);
    setPermissionsBusy(true);
    try {
      const [rolePermissions, users] = await Promise.all([
        PermissionService.getRolePermissions(roleId),
        PermissionService.getUsersByRole(roleId),
      ]);
      setSelectedRolePermissions(rolePermissions);
      setPermissionUsers(users);
      const userId = users[0]?.id ?? "";
      selectedPermissionUserIdRef.current = userId;
      setSelectedPermissionUserId(userId);
      setSelectedUserOverrides(userId ? await PermissionService.getUserPermissionOverrides(userId) : {});
    } catch {
      setSelectedRolePermissions([]);
      setPermissionUsers([]);
      selectedPermissionUserIdRef.current = "";
      setSelectedPermissionUserId("");
      setSelectedUserOverrides({});
    }
    finally { setPermissionsBusy(false); }
  };

  const selectPermissionUser = async (cashierId: string) => {
    selectedPermissionUserIdRef.current = cashierId;
    setSelectedPermissionUserId(cashierId);
    setPermissionsBusy(true);
    try { setSelectedUserOverrides(await PermissionService.getUserPermissionOverrides(cashierId)); }
    catch { setSelectedUserOverrides({}); }
    finally { setPermissionsBusy(false); }
  };

  const applyPermissionPreset = async (presetKey: PermissionPresetKey) => {
    if (!selectedPermissionUserId) return;
    const selectedUser = permissionUsers.find((user) => user.id === selectedPermissionUserId);
    setPermissionsBusy(true);
    try {
      await PermissionService.applyPresetToUser(selectedPermissionUserId, presetKey);
      setSelectedUserOverrides(await PermissionService.getUserPermissionOverrides(selectedPermissionUserId));
      Alert.alert("User permissions updated", `${PERMISSION_PRESETS[presetKey].name} access was applied only to ${selectedUser?.displayName ?? "this user"}.`);
    } catch (error: any) { Alert.alert("Permissions", error?.message ?? "Unable to apply the permission preset."); }
    finally { setPermissionsBusy(false); }
  };

  const toggleUserPermission = async (code: string) => {
    if (!selectedPermissionUserId) return;
    const inherited = selectedRolePermissions.includes(code);
    const current = selectedUserOverrides[code] ?? inherited;
    const next = !current;
    const storedOverride = next === inherited ? null : next;
    setPermissionsBusy(true);
    try {
      await PermissionService.setUserPermission(selectedPermissionUserId, code, storedOverride);
      setSelectedUserOverrides((currentOverrides) => {
        const updated = { ...currentOverrides };
        if (storedOverride === null) delete updated[code];
        else updated[code] = storedOverride;
        return updated;
      });
    } catch (error: any) { Alert.alert("Permissions", error?.message ?? "Unable to update this permission."); }
    finally { setPermissionsBusy(false); }
  };

  const resetUserPermissions = async () => {
    if (!selectedPermissionUserId) return;
    setPermissionsBusy(true);
    try {
      await PermissionService.clearUserPermissionOverrides(selectedPermissionUserId);
      setSelectedUserOverrides({});
      Alert.alert("Role defaults restored", "This user now inherits every permission from the selected role.");
    } catch (error: any) { Alert.alert("Permissions", error?.message ?? "Unable to restore role defaults."); }
    finally { setPermissionsBusy(false); }
  };

  const applyAutoLock = () => {
    const amount = Number(autoLockValue);
    if (!Number.isInteger(amount) || amount < 1) {
      Alert.alert("Auto Lock", "Enter a whole number greater than zero.");
      return;
    }
    const minutes = autoLockUnit === "hours" ? amount * 60 : amount;
    if (minutes > 10080) {
      Alert.alert("Auto Lock", "Choose a timeout no longer than 7 days.");
      return;
    }
    setAutoLockMinutes(minutes);
  };

  const filteredAuditLogs =
    auditFilter === "ALL"
      ? auditLogs
      : auditLogs.filter((l) => l.eventType === auditFilter);
  const normalizedSettingsSearch = settingsSearch.trim().toLowerCase();
  const showSettingsSection = (...keywords: string[]) => {
    if (!activeSection) return false;
    const requested = keywords.join(" ").toLowerCase();
    return SECTION_MATCHERS[activeSection].some((matcher) => requested.includes(matcher) || matcher.includes(requested));
  };
  const canOpenSettingsSection = (item: SettingsSectionDefinition) => {
    if (isSuperAdmin) return true;
    if (item.id === "store" || item.id === "tax" || item.id === "auto_lock") return canManageSettings;
    if (!item.adminOnly) return true;
    if (item.id === "users" || item.id === "security") return canManageUsers;
    if (item.id === "audit") return canViewAudit;
    if (item.id === "database") return canManageBackups;
    if (item.id === "permissions") return false;
    return canManageSettings;
  };
  const visibleSettingsSections = SETTINGS_SECTIONS.filter((item) => {
    if (!canOpenSettingsSection(item)) return false;
    if (!normalizedSettingsSearch) return true;
    return `${item.title} ${item.description} ${item.keywords}`.toLowerCase().includes(normalizedSettingsSearch);
  });
  const selectedPermissionRole = permissionRoles.find((role) => role.id === selectedPermissionRoleId);
  const selectedPermissionUser = permissionUsers.find((user) => user.id === selectedPermissionUserId);
  const accessibleSettingsSectionIds = SETTINGS_SECTIONS.filter(canOpenSettingsSection).map((item) => item.id).join("|");
  useEffect(() => {
    const accessible = accessibleSettingsSectionIds.split("|").filter(Boolean) as SettingsSectionId[];
    if (!accessible.includes(activeSection) && accessible[0]) setActiveSection(accessible[0]);
  }, [accessibleSettingsSectionIds, activeSection]);
  const openSettingsSection = (section: SettingsSectionId) => {
    if (section === activeSection) return;
    setActiveSection(section);
    detailScrollRef.current?.scrollTo({ y: 0, animated: false });
    detailAnimation.stopAnimation();
    detailAnimation.setValue(0);
    Animated.spring(detailAnimation, { toValue: 1, useNativeDriver: true, tension: 85, friction: 11 }).start();
  };
  const soundVolumePercent = Math.round(soundVolume * 100);
  const adjustSoundVolume = (delta: number) => {
    const next = Math.round((soundVolume + delta) * 10) / 10;
    setSoundVolume(next);
  };

  // Dark-aware helpers
  const cardBg = posTheme.surface;
  const cardBorder = posTheme.border;
  const sectionTitleColor = posTheme.text;
  const sectionDescColor = posTheme.muted;
  const fieldLabelColor = posTheme.muted;
  const fieldValueColor = posTheme.text;
  const borderColor = posTheme.border;
  const inputBg = posTheme.surfaceAlt;
  const inputBorder = posTheme.border;
  const inputColor = posTheme.text;
  const pickerBg = posTheme.surfaceAlt;
  const pickerBorder = posTheme.border;
  const pickerTextColor = posTheme.text;

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: posTheme.background }]}>
        <ActivityIndicator size="large" color={posTheme.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.settingsSplit, { backgroundColor: posTheme.background }]}>
      <View style={[styles.settingsSidebar, { width: isWideColumns ? 228 : 154, backgroundColor: posTheme.surface, borderRightColor: posTheme.border }]}>
        <Text style={[styles.settingsSidebarTitle, { color: posTheme.text }]}>Settings</Text>
        <View style={[styles.settingsSidebarSearch, { backgroundColor: inputBg, borderColor: inputBorder }]}><Ionicons name="search" size={15} color={posTheme.muted} /><TextInput style={[styles.settingsSidebarSearchInput, { color: inputColor }]} placeholder="Search..." placeholderTextColor={posTheme.muted} value={settingsSearch} onChangeText={setSettingsSearch} />{settingsSearch ? <TouchableOpacity onPress={() => setSettingsSearch("")}><Ionicons name="close-circle" size={16} color={posTheme.muted} /></TouchableOpacity> : null}</View>
        {normalizedSettingsSearch ? <Text style={[styles.settingsSidebarCount, { color: posTheme.muted }]}>{visibleSettingsSections.length} matching sections</Text> : null}
        <ScrollView style={styles.settingsLinksScroll} contentContainerStyle={styles.settingsLinks} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          {visibleSettingsSections.map((item) => { const selected = activeSection === item.id; return <TouchableOpacity key={item.id} onPress={() => openSettingsSection(item.id)} style={[styles.settingsLink, { borderColor: selected ? posTheme.accent : "transparent", backgroundColor: selected ? posTheme.surfaceAlt : "transparent" }]} activeOpacity={0.72}><View style={[styles.settingsLinkIcon, { backgroundColor: selected ? posTheme.primary : posTheme.surfaceAlt }]}><Ionicons name={item.icon} size={17} color={selected ? posTheme.onPrimary : posTheme.accent} /></View><Text numberOfLines={2} style={[styles.settingsLinkText, { color: selected ? posTheme.text : posTheme.muted }, selected && { fontWeight: "900" }]}>{item.title}</Text></TouchableOpacity>; })}
          {visibleSettingsSections.length === 0 ? <View style={styles.settingsSidebarEmpty}><Ionicons name="search-outline" size={24} color={posTheme.muted} /><Text style={{ color: posTheme.muted, fontSize: 11, textAlign: "center" }}>No matching setting</Text></View> : null}
        </ScrollView>
      </View>
      <Animated.View style={[styles.settingsDetailPane, { opacity: detailAnimation, transform: [{ translateX: detailAnimation.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
        <ScrollView ref={detailScrollRef} style={{ flex: 1 }} contentContainerStyle={styles.settingsDetailContent} keyboardShouldPersistTaps="handled">
      <View style={styles.settingsDetailHeader}><View style={{ flex: 1 }}><Text style={[styles.screenTitle, { color: posTheme.text, marginBottom: 2 }]}>{activeSectionDefinition?.title ?? "Settings"}</Text><Text style={[styles.screenSubtitle, { color: posTheme.muted, marginBottom: 0 }]}>{activeSectionDefinition?.description}</Text></View></View>

      {canManageSettings && showSettingsSection("business branding receipt designer") && (
        <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Business & Receipts</Text>
          <Text style={[styles.sectionDesc, { color: sectionDescColor }]}>Configure stable business identity, offline branding, operating capabilities, and the thermal receipt template.</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
            <Button title="Business & Branding" icon="business-outline" onPress={() => router.push("/(pos)/business-settings" as any)} />
            <Button title="Receipt Designer" icon="receipt-outline" variant="secondary" onPress={() => router.push("/(pos)/receipt-designer" as any)} />
          </View>
        </Card>
      )}

      <View style={[styles.twoColRow, isWideColumns && styles.twoColRowWide]}>
        {/* Store Details Card */}
        <Card style={[styles.section, styles.twoColCard, { backgroundColor: cardBg, borderColor: cardBorder }, !showSettingsSection("store details name address currency device code registration") && styles.hidden]}>
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
        <Card style={[styles.section, styles.twoColCard, { backgroundColor: cardBg, borderColor: cardBorder }, !showSettingsSection("tax profile vat rate receipt footer") && styles.hidden]}>
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
      <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }, !showSettingsSection("users cashiers roles") && styles.hidden]}>
        <View style={styles.sectionHeadingRow}>
          <View style={styles.sectionHeadingCopy}>
            <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>
              <Ionicons name="people-outline" size={18} color={sectionTitleColor} /> Users and Shared Sales
            </Text>
            <Text style={[styles.sectionDesc, { color: sectionDescColor }]}>Create device users and choose which accounts share sales, receipts, and reports.</Text>
          </View>
          <TouchableOpacity style={[styles.addUserButton, { backgroundColor: posTheme.primary }]} onPress={openCreateUser}>
            <Ionicons name="person-add-outline" size={17} color={posTheme.onPrimary} />
            <Text style={[styles.addUserButtonText, { color: posTheme.onPrimary }]}>Add user</Text>
          </TouchableOpacity>
        </View>

        {cashiers.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: posTheme.surfaceAlt }]}>
            <Text style={[styles.emptyText, { color: posTheme.muted }]}>
              No users synced yet. Connect to OMS and sync to load users.
            </Text>
          </View>
        ) : (
          cashiers.map((user) => (
            <View key={user.id} style={[styles.userRow, { borderBottomColor: borderColor }]}>
              <View style={[styles.userAvatar, { backgroundColor: posTheme.surfaceAlt }]}>
                <Text style={[styles.userAvatarText, { color: posTheme.accent }]}>
                  {user.displayName?.substring(0, 2)?.toUpperCase() ?? "U"}
                </Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={[styles.userName, { color: fieldValueColor }]}>{user.displayName}</Text>
                <Text style={[styles.userUsername, { color: fieldLabelColor }]}>{user.username ? `@${user.username}` : "PIN login"}</Text>
              </View>
              <View style={[styles.badge, { borderColor: posTheme.border, backgroundColor: posTheme.surfaceAlt }]}>
                <Text style={[styles.badgeText, { color: posTheme.muted }]}>{user.roleName || "Cashier"}</Text>
              </View>
              {Boolean(user.accountLocked) && (
                <View style={styles.lockedBadge}>
                  <Ionicons name="lock-closed" size={12} color="#ffffff" />
                  <Text style={styles.lockedBadgeText}>Locked</Text>
                </View>
              )}
              {session?.cashierId === user.id && (
                <View style={styles.youBadge}>
                  <Text style={styles.youBadgeText}>You</Text>
                </View>
              )}
              {session?.cashierId && !isSuperAdmin && user.id !== session.cashierId && (
                <TouchableOpacity
                  style={[
                    styles.linkUserButton,
                    { borderColor: salesGroupCashierIds.includes(session.cashierId) && salesGroupCashierIds.includes(user.id) ? posTheme.primary : posTheme.border, backgroundColor: salesGroupCashierIds.includes(session.cashierId) && salesGroupCashierIds.includes(user.id) ? posTheme.primary : posTheme.surfaceAlt },
                  ]}
                  onPress={() => toggleCashierLink(session.cashierId, user.id)}
                >
                  <Ionicons
                    name={salesGroupCashierIds.includes(session.cashierId) && salesGroupCashierIds.includes(user.id) ? "link" : "unlink-outline"}
                    size={15}
                    color={salesGroupCashierIds.includes(session.cashierId) && salesGroupCashierIds.includes(user.id) ? posTheme.onPrimary : fieldLabelColor}
                  />
                  <Text style={[
                    styles.linkUserButtonText,
                    { color: salesGroupCashierIds.includes(session.cashierId) && salesGroupCashierIds.includes(user.id) ? posTheme.onPrimary : fieldLabelColor },
                  ]}>
                    {salesGroupCashierIds.includes(session.cashierId) && salesGroupCashierIds.includes(user.id) ? "Shared" : "Separate"}
                  </Text>
                </TouchableOpacity>
              )}
              <View style={styles.userActions}>
                <TouchableOpacity
                  style={[styles.userActionButton, { borderColor: dark ? "#334155" : "#cbd5e1" }]}
                  onPress={() => openEditUser(user)}
                  accessibilityLabel={`Edit ${user.displayName}`}
                >
                  <Ionicons name="create-outline" size={16} color={fieldLabelColor} />
                </TouchableOpacity>
                {user.id !== session?.cashierId ? (
                  <TouchableOpacity
                    style={[styles.userActionButton, { borderColor: dark ? "#5b2930" : "#fecdd3" }]}
                    onPress={() => handleDeleteUser(user)}
                    accessibilityLabel={`Delete ${user.displayName}`}
                  >
                    <Ionicons name="trash-outline" size={16} color="#dc3545" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ))
        )}
      </Card>

      {isSuperAdmin && (
        <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }, !showSettingsSection("permissions access roles presets") && styles.hidden]}>
          <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Roles & Permissions</Text>
          <Text style={[styles.sectionDesc, { color: sectionDescColor }]}>Choose a role to find its users, then customize access for one person. Role permissions remain the default until a user override is added.</Text>
          <Text style={[styles.fieldLabel, { color: fieldLabelColor }]}>Role to configure</Text>
          <TouchableOpacity style={[styles.permissionSelect, { backgroundColor: posTheme.surfaceAlt, borderColor: posTheme.border }]} onPress={() => setShowPermissionRolePicker(true)}>
            <View><Text style={[styles.permissionSelectValue, { color: posTheme.text }]}>{selectedPermissionRole?.name ?? "Select a role"}</Text><Text style={[styles.permissionSelectHint, { color: posTheme.muted }]}>{selectedPermissionRole?.description ?? "Choose which role's users to display"}</Text></View>
            <Ionicons name="chevron-down" size={20} color={posTheme.accent} />
          </TouchableOpacity>

          <Text style={[styles.fieldLabel, { color: fieldLabelColor, marginTop: 16 }]}>Users in {selectedPermissionRole?.name ?? "role"}</Text>
          {permissionUsers.length === 0 ? <View style={[styles.permissionNotice, { backgroundColor: posTheme.surfaceAlt, borderColor: posTheme.border }]}><Ionicons name="people-outline" size={19} color={posTheme.accent} /><Text style={{ color: posTheme.muted, flex: 1 }}>No active users are assigned to this role.</Text></View> : <View style={styles.permissionUserGrid}>{permissionUsers.map((user) => { const selected = user.id === selectedPermissionUserId; return <TouchableOpacity key={user.id} style={[styles.permissionUser, { backgroundColor: selected ? posTheme.primary : posTheme.surfaceAlt, borderColor: selected ? posTheme.primary : posTheme.border }]} onPress={() => void selectPermissionUser(user.id)}><Ionicons name="person-circle-outline" size={22} color={selected ? posTheme.onPrimary : posTheme.accent} /><View style={{ flex: 1 }}><Text style={[styles.permissionUserName, { color: selected ? posTheme.onPrimary : posTheme.text }]}>{user.displayName}</Text><Text style={[styles.permissionUserHandle, { color: selected ? posTheme.onPrimary : posTheme.muted }]}>{user.username ? `@${user.username}` : "PIN account"}</Text></View>{Object.keys(selectedUserOverrides).length > 0 && selected ? <View style={[styles.overrideBadge, { backgroundColor: posTheme.accent }]}><Text style={[styles.overrideBadgeText, { color: posTheme.onPrimary }]}>CUSTOM</Text></View> : null}</TouchableOpacity>; })}</View>}

          {selectedPermissionUser ? <>
            <View style={styles.permissionHeadingRow}><View><Text style={[styles.fieldLabel, { color: fieldLabelColor, marginTop: 16 }]}>Access for {selectedPermissionUser.displayName}</Text><Text style={[styles.permissionSelectHint, { color: posTheme.muted }]}>Switches show effective access. “Override” differs from the {selectedPermissionRole?.name} default.</Text></View><TouchableOpacity disabled={permissionsBusy || Object.keys(selectedUserOverrides).length === 0} onPress={() => void resetUserPermissions()} style={[styles.resetPermissionButton, { borderColor: posTheme.border, opacity: Object.keys(selectedUserOverrides).length === 0 ? 0.5 : 1 }]}><Ionicons name="refresh" size={16} color={posTheme.accent} /><Text style={{ color: posTheme.text, fontSize: 11, fontWeight: "800" }}>Use role defaults</Text></TouchableOpacity></View>
            <Text style={[styles.fieldLabel, { color: fieldLabelColor, marginTop: 16 }]}>Apply a preset to this user</Text>
            <View style={styles.permissionPresetGrid}>{(Object.entries(PERMISSION_PRESETS) as Array<[PermissionPresetKey, typeof PERMISSION_PRESETS[PermissionPresetKey]]>).map(([key, preset]) => <TouchableOpacity key={key} disabled={permissionsBusy} style={[styles.permissionPreset, { backgroundColor: posTheme.surfaceAlt, borderColor: posTheme.border }]} onPress={() => void applyPermissionPreset(key)}><Text style={[styles.permissionPresetTitle, { color: posTheme.text }]}>{preset.name}</Text><Text style={[styles.permissionPresetDesc, { color: posTheme.muted }]}>{preset.description}</Text></TouchableOpacity>)}</View>
            {PERMISSION_CATEGORIES.map((category) => <View key={category} style={[styles.permissionCategory, { borderColor: posTheme.border }]}><View style={[styles.permissionCategoryHeader, { backgroundColor: posTheme.surfaceAlt }]}><Ionicons name={category === "Pages" ? "documents-outline" : category === "Buttons & Actions" ? "hand-left-outline" : "create-outline"} size={18} color={posTheme.accent} /><View><Text style={[styles.permissionCategoryTitle, { color: posTheme.text }]}>{category}</Text><Text style={[styles.permissionCategoryHint, { color: posTheme.muted }]}>{category === "Pages" ? "Controls which screens this user can open." : category === "Buttons & Actions" ? "Controls operational buttons and sensitive actions." : "Controls creating, updating, and removing records."}</Text></View></View>{POS_PERMISSIONS.filter((permission) => permission.category === category).map((permission) => { const inherited = selectedRolePermissions.includes(permission.code); const overridden = Object.prototype.hasOwnProperty.call(selectedUserOverrides, permission.code); const enabled = selectedUserOverrides[permission.code] ?? inherited; return <TouchableOpacity key={permission.code} disabled={permissionsBusy} style={[styles.permissionItem, { borderBottomColor: posTheme.border }]} onPress={() => void toggleUserPermission(permission.code)}><View style={{ flex: 1 }}><View style={styles.permissionItemTitleRow}><Text style={[styles.permissionItemTitle, { color: posTheme.text }]}>{permission.name}</Text><View style={[styles.permissionSourceBadge, { backgroundColor: overridden ? posTheme.primary : posTheme.surfaceAlt, borderColor: posTheme.border }]}><Text style={{ color: overridden ? posTheme.onPrimary : posTheme.muted, fontSize: 9, fontWeight: "900" }}>{overridden ? "USER OVERRIDE" : "ROLE DEFAULT"}</Text></View></View><Text style={[styles.permissionItemDesc, { color: posTheme.muted }]}>{permission.description}</Text><Text style={[styles.permissionItemGroup, { color: posTheme.accent }]}>{permission.group}</Text></View><Switch value={enabled} disabled={permissionsBusy} onValueChange={() => void toggleUserPermission(permission.code)} trackColor={{ false: posTheme.surfaceAlt, true: posTheme.primary }} thumbColor={enabled ? posTheme.onPrimary : posTheme.muted} /></TouchableOpacity>; })}</View>)}
          </> : null}
        </Card>
      )}

      {canManageUsers && (
        <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }, !showSettingsSection("security pin failed attempts lock unlock accounts") && styles.hidden]}>
          <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Security</Text>
          <Text style={[styles.sectionDesc, { color: sectionDescColor }]}>Set the failed PIN limit and unlock cashier accounts.</Text>

          <View style={styles.securitySettingRow}>
            <View style={styles.sectionHeadingCopy}>
              <Text style={[styles.fieldValue, { color: fieldValueColor }]}>Failed PIN attempts</Text>
              <Text style={[styles.securityHelp, { color: sectionDescColor }]}>Lock an account after this many consecutive incorrect PINs.</Text>
            </View>
            <TextInput
              style={[styles.securityNumberInput, { backgroundColor: inputBg, borderColor: inputBorder, color: inputColor }]}
              value={maxPinAttemptsValue}
              onChangeText={(value) => setMaxPinAttemptsValue(value.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              maxLength={2}
              accessibilityLabel="Maximum failed PIN attempts"
            />
            <TouchableOpacity style={[styles.securityApplyButton, { backgroundColor: posTheme.primary }]} onPress={applyPinSecurity}>
              <Ionicons name="checkmark" size={17} color={posTheme.onPrimary} />
              <Text style={[styles.securityApplyText, { color: posTheme.onPrimary }]}>Apply</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.securityListTitle, { color: fieldValueColor }]}>Locked accounts</Text>
          {cashiers.filter((user) => Boolean(user.accountLocked)).length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: posTheme.surfaceAlt, borderColor: posTheme.border }]}>
              <Text style={[styles.emptyText, { color: sectionDescColor }]}>No accounts are locked.</Text>
            </View>
          ) : (
            cashiers.filter((user) => Boolean(user.accountLocked)).map((user) => (
              <View key={`locked-${user.id}`} style={[styles.lockedUserRow, { borderBottomColor: borderColor }]}>
                <View style={styles.lockedUserCopy}>
                  <Text style={[styles.userName, { color: fieldValueColor }]}>{user.displayName}</Text>
                  <Text style={[styles.userUsername, { color: fieldLabelColor }]}>
                    {user.failedPinAttempts} failed attempts{user.accountLockedAt ? ` · ${new Date(user.accountLockedAt).toLocaleString()}` : ""}
                  </Text>
                </View>
                <TouchableOpacity style={styles.unlockButton} onPress={() => void handleUnlockUser(user)}>
                  <Ionicons name="lock-open-outline" size={16} color="#ffffff" />
                  <Text style={styles.unlockButtonText}>Unlock</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </Card>
      )}

      <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }, !showSettingsSection("security auto lock idle timeout pin") && styles.hidden]}>
        <View style={styles.autoLockHeading}>
          <View style={styles.sectionHeadingCopy}>
            <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Auto Lock</Text>
            <Text style={[styles.sectionDesc, { color: sectionDescColor }]}>Sign out after this device has not been touched. A PIN is required to return.</Text>
          </View>
          <Switch
            value={autoLockMinutes > 0}
            onValueChange={(enabled) => enabled ? applyAutoLock() : setAutoLockMinutes(0)}
            trackColor={{ false: posTheme.border, true: posTheme.accent }}
            thumbColor={autoLockMinutes > 0 ? posTheme.primary : posTheme.surface}
          />
        </View>
        <View style={styles.autoLockEditor}>
          <TextInput
            style={[styles.autoLockInput, { backgroundColor: inputBg, borderColor: inputBorder, color: inputColor }]}
            value={autoLockValue}
            onChangeText={(value) => setAutoLockValue(value.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            maxLength={4}
            accessibilityLabel="Auto lock timeout"
          />
          <View style={[styles.autoLockUnits, { borderColor: inputBorder }]}>
            {(["minutes", "hours"] as const).map((unit) => (
              <TouchableOpacity
                key={unit}
                style={[styles.autoLockUnit, autoLockUnit === unit && { backgroundColor: posTheme.primary }]}
                onPress={() => setAutoLockUnit(unit)}
                accessibilityState={{ selected: autoLockUnit === unit }}
              >
                <Text style={[styles.autoLockUnitText, { color: autoLockUnit === unit ? posTheme.onPrimary : fieldLabelColor }]}>{unit === "minutes" ? "Minutes" : "Hours"}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[styles.autoLockApply, { backgroundColor: posTheme.primary }]} onPress={applyAutoLock}>
            <Ionicons name="checkmark" size={17} color={posTheme.onPrimary} />
            <Text style={[styles.autoLockApplyText, { color: posTheme.onPrimary }]}>Apply</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.autoLockStatus, { color: sectionDescColor }]}>
          {autoLockMinutes > 0 ? `Currently locks after ${autoLockMinutes >= 60 && autoLockMinutes % 60 === 0 ? `${autoLockMinutes / 60} ${autoLockMinutes === 60 ? "hour" : "hours"}` : `${autoLockMinutes} ${autoLockMinutes === 1 ? "minute" : "minutes"}`}.` : "Auto lock is off."}
        </Text>
      </Card>

      {/* Audit Logs Card */}
      <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }, !showSettingsSection("audit logs activity events") && styles.hidden]}>
        <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>
          <Ionicons name="document-text-outline" size={18} color={sectionTitleColor} /> Audit Logs
        </Text>
        <Text style={[styles.sectionDesc, { color: sectionDescColor }]}>Recent activity on this device.</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {AUDIT_FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, { backgroundColor: auditFilter === f ? posTheme.primary : posTheme.surfaceAlt, borderColor: auditFilter === f ? posTheme.primary : posTheme.border }]}
              onPress={() => setAuditFilter(f)}
            >
              <Text style={[styles.filterChipText, { color: auditFilter === f ? posTheme.onPrimary : posTheme.muted }]}>
                {f === "ALL" ? "ALL" : f.replace("_", " ")}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {filteredAuditLogs.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: posTheme.surfaceAlt, borderColor: posTheme.border }]}>
            <Text style={[styles.emptyText, { color: dark ? "#94a3b8" : "#6b7b8d" }]}>No audit logs recorded yet.</Text>
          </View>
        ) : (
          <View style={styles.auditList}>
            {filteredAuditLogs.map((log) => {
              const colors = EVENT_COLORS[log.eventType] ?? { bg: posTheme.surfaceAlt, text: posTheme.accent };
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
      {canManageSettings && (
      <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }, !showSettingsSection("oms connection server api key sync qr") && styles.hidden]}>
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

        <View style={[styles.statusBar, { backgroundColor: posTheme.surfaceAlt, borderColor: posTheme.border }]}>
          <View
            style={[
              styles.statusDot,
              liveStatus === "connected" && styles.statusConnected,
              liveStatus === "connecting" && styles.statusConnecting,
              liveStatus === "offline" && styles.statusOffline,
              liveStatus === "idle" && styles.statusIdle,
            ]}
          />
          <Text style={[styles.statusText, { color: posTheme.muted }]}>
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
      )}

      {/* Bluetooth Thermal Printer Card */}
      <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }, !showSettingsSection("bluetooth thermal printer jk-5802h receipt esc pos paired device") && styles.hidden]}>
        <View style={styles.printerHeadingRow}>
          <View style={styles.sectionHeadingCopy}>
            <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Bluetooth Thermal Printer</Text>
            <Text style={[styles.sectionDesc, { color: sectionDescColor }]}>Select a paired 58mm ESC/POS printer for receipts.</Text>
          </View>
          <View style={[styles.printerStatusBadge, { backgroundColor: connectedPrinterId ? (dark ? "#123524" : "#dcfce7") : posTheme.surfaceAlt, borderColor: connectedPrinterId ? "#22c55e" : posTheme.border }]}>
            <View style={[styles.printerStatusDot, { backgroundColor: connectedPrinterId ? "#22c55e" : "#94a3b8" }]} />
            <Text style={[styles.printerStatusText, { color: connectedPrinterId ? (dark ? "#86efac" : "#166534") : fieldLabelColor }]}>
              {connectedPrinterId ? "Connected" : "Not connected"}
            </Text>
          </View>
        </View>

        {selectedPrinter && (
          <View style={[styles.selectedPrinterSummary, { backgroundColor: inputBg, borderColor: inputBorder }]}>
            <View style={[styles.printerIcon, { backgroundColor: posTheme.surfaceAlt }]}>
              <Ionicons name="print-outline" size={22} color={posTheme.accent} />
            </View>
            <View style={styles.printerDeviceCopy}>
              <Text style={[styles.printerDeviceName, { color: fieldValueColor }]} numberOfLines={1}>{selectedPrinter.name}</Text>
              <Text style={[styles.printerDeviceAddress, { color: fieldLabelColor }]}>{selectedPrinter.address}</Text>
            </View>
            <Ionicons name="checkmark-circle" size={21} color="#22a447" />
          </View>
        )}

        <View style={styles.printerToolbar}>
          <TouchableOpacity
            style={[styles.printerToolButton, { backgroundColor: inputBg, borderColor: inputBorder }]}
            onPress={() => void loadPairedPrinters()}
            disabled={printerAction !== null}
          >
            {printerAction === "refresh" ? (
              <ActivityIndicator size="small" color={posTheme.accent} />
            ) : (
              <Ionicons name="refresh" size={17} color={posTheme.accent} />
            )}
            <Text style={[styles.printerToolText, { color: fieldValueColor }]}>Refresh paired devices</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.printerToolButton, { backgroundColor: inputBg, borderColor: inputBorder }]}
            onPress={() => void Linking.sendIntent("android.settings.BLUETOOTH_SETTINGS")}
          >
            <Ionicons name="bluetooth" size={17} color={posTheme.accent} />
            <Text style={[styles.printerToolText, { color: fieldValueColor }]}>Bluetooth settings</Text>
          </TouchableOpacity>
        </View>

        {pairedPrinters.length > 0 ? (
          <View style={[styles.printerDeviceList, { borderColor: inputBorder }]}>
            {pairedPrinters.map((printer, index) => {
              const selected = selectedPrinter?.id === printer.id;
              return (
                <TouchableOpacity
                  key={printer.id}
                  style={[
                    styles.printerDeviceRow,
                    { borderBottomColor: inputBorder },
                    index === pairedPrinters.length - 1 && styles.printerDeviceRowLast,
                    selected && { backgroundColor: posTheme.surfaceAlt },
                  ]}
                  onPress={() => setSelectedPrinter(printer)}
                >
                  <View style={[styles.printerRadio, { borderColor: selected ? posTheme.accent : posTheme.muted }]}>
                    {selected && <View style={[styles.printerRadioSelected, { backgroundColor: posTheme.accent }]} />}
                  </View>
                  <View style={styles.printerDeviceCopy}>
                    <Text style={[styles.printerDeviceName, { color: fieldValueColor }]} numberOfLines={1}>{printer.name}</Text>
                    <Text style={[styles.printerDeviceAddress, { color: fieldLabelColor }]}>{printer.address}</Text>
                  </View>
                  {connectedPrinterId === printer.id && <Text style={styles.connectedDeviceLabel}>Connected</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={[styles.printerEmpty, { backgroundColor: posTheme.surfaceAlt, borderColor: inputBorder }]}>
            <Ionicons name="bluetooth-outline" size={20} color={posTheme.accent} />
            <Text style={[styles.printerEmptyText, { color: fieldLabelColor }]}>Pair the JK-5802H in Android settings, then refresh this list.</Text>
          </View>
        )}

        <View style={styles.printerButtonRow}>
          {connectedPrinterId === selectedPrinter?.id ? (
            <Button
              title="Disconnect"
              onPress={handleDisconnectPrinter}
              variant="secondary"
              loading={printerAction === "disconnect"}
              disabled={printerAction !== null && printerAction !== "disconnect"}
              icon="close-circle-outline"
              style={styles.printerActionButton}
            />
          ) : (
            <Button
              title="Connect"
              onPress={handleConnectPrinter}
              loading={printerAction === "connect"}
              disabled={!selectedPrinter || (printerAction !== null && printerAction !== "connect")}
              icon="bluetooth-outline"
              style={styles.printerActionButton}
            />
          )}
          <Button
            title="Test Print"
            onPress={handlePrinterTest}
            variant="secondary"
            loading={printerAction === "test"}
            disabled={!selectedPrinter || connectedPrinterId !== selectedPrinter.id || (printerAction !== null && printerAction !== "test")}
            icon="print-outline"
            style={styles.printerActionButton}
          />
        </View>
      </Card>

      {canManageSettings && (
        <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }, !showSettingsSection("test open cash register drawer bluetooth printer camera usb barcode scanner hardware") && styles.hidden]}>
          <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Hardware Diagnostics</Text>
          <Text style={[styles.sectionDesc, { color: sectionDescColor }]}>Verify the cash drawer and both supported barcode input methods before serving customers.</Text>
          <View style={styles.hardwareTestGrid}>
            <View style={[styles.hardwareTestItem, { backgroundColor: posTheme.surfaceAlt, borderColor: posTheme.border }]}>
              <Ionicons name="cash-outline" size={24} color={posTheme.accent} />
              <Text style={[styles.hardwareTestTitle, { color: posTheme.text }]}>Cash drawer</Text>
              <Text style={[styles.hardwareTestHelp, { color: posTheme.muted }]}>Sends the drawer-open command through the selected printer.</Text>
              <Button title="Open Cash Register" onPress={handleCashRegisterTest} loading={printerAction === "drawer"} disabled={!selectedPrinter || (printerAction !== null && printerAction !== "drawer")} icon="cash-outline" style={styles.hardwareTestButton} />
            </View>
            <View style={[styles.hardwareTestItem, { backgroundColor: posTheme.surfaceAlt, borderColor: posTheme.border }]}>
              <Ionicons name="camera-outline" size={24} color={posTheme.accent} />
              <Text style={[styles.hardwareTestTitle, { color: posTheme.text }]}>Camera barcode scanner</Text>
              <Text style={[styles.hardwareTestHelp, { color: posTheme.muted }]}>Open the in-app scanner and scan any supported product barcode.</Text>
              <Button title="Test Camera Scanner" onPress={() => setHardwareScannerVisible(true)} icon="scan-outline" style={styles.hardwareTestButton} />
            </View>
            <View style={[styles.hardwareTestItem, { backgroundColor: posTheme.surfaceAlt, borderColor: posTheme.border }]}>
              <Ionicons name="barcode-outline" size={24} color={posTheme.accent} />
              <Text style={[styles.hardwareTestTitle, { color: posTheme.text }]}>USB barcode scanner</Text>
              <Text style={[styles.hardwareTestHelp, { color: posTheme.muted }]}>Tap USB Ready, then scan a barcode with the connected scanner.</Text>
              <UsbBarcodeScannerInput onScan={(code) => setHardwareScanResult(code)} dark={dark} disabled={activeSection !== "hardware_test"} />
            </View>
          </View>
          {hardwareScanResult ? <View style={[styles.hardwareScanSuccess, { backgroundColor: posTheme.surfaceAlt, borderColor: posTheme.accent }]}><Ionicons name="checkmark-circle" size={22} color={posTheme.accent} /><View style={{ flex: 1 }}><Text style={[styles.hardwareTestTitle, { color: posTheme.text }]}>Scanner is working</Text><Text selectable style={[styles.hardwareTestHelp, { color: posTheme.muted }]}>Received: {hardwareScanResult}</Text></View><TouchableOpacity onPress={() => setHardwareScanResult("")}><Ionicons name="close-circle" size={20} color={posTheme.muted} /></TouchableOpacity></View> : null}
        </Card>
      )}

      {/* Navigation Style Card */}
      <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }, !showSettingsSection("navigation style sidebar bottom auto") && styles.hidden]}>
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
                { backgroundColor: navigationMode === opt.key ? posTheme.primary : posTheme.surfaceAlt, borderColor: navigationMode === opt.key ? posTheme.primary : posTheme.border },
              ]}
              onPress={() => setNavigationMode(opt.key)}
            >
              <View style={[styles.navIconWrap, { backgroundColor: navigationMode === opt.key ? posTheme.accent : posTheme.surface }]}>
                <Ionicons name={opt.icon} size={22} color={navigationMode === opt.key ? posTheme.onPrimary : posTheme.accent} />
              </View>
              <Text style={[styles.navLabel, { color: navigationMode === opt.key ? posTheme.onPrimary : posTheme.text }]}>
                {opt.label}
              </Text>
              <Text style={[styles.navDesc, { color: navigationMode === opt.key ? posTheme.onPrimary : posTheme.muted }]}>
                {opt.desc}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      {/* Sales Layout Card */}
      <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }, !showSettingsSection("sales layout handed left right cart dominant hand") && styles.hidden]}>
        <View style={styles.autoLockHeading}>
          <View style={styles.sectionHeadingCopy}>
            <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Sales Layout</Text>
            <Text style={[styles.sectionDesc, { color: sectionDescColor }]}>Move the cart to the left side for left-handed use, or keep it on the right.</Text>
          </View>
          <Switch
            value={salesHandedness === "left"}
            onValueChange={(enabled) => setSalesHandedness(enabled ? "left" : "right")}
            trackColor={{ false: posTheme.border, true: posTheme.accent }}
            thumbColor={salesHandedness === "left" ? posTheme.primary : posTheme.surface}
            accessibilityLabel="Left-handed sales layout"
          />
        </View>

        <View style={styles.navGrid}>
          {([
            { key: "right" as const, label: "Right-handed", icon: "arrow-forward-circle-outline" as const, desc: "Products left, cart right" },
            { key: "left" as const, label: "Left-handed", icon: "arrow-back-circle-outline" as const, desc: "Cart left, products right" },
          ]).map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.navCard,
                { backgroundColor: salesHandedness === opt.key ? posTheme.primary : posTheme.surfaceAlt, borderColor: salesHandedness === opt.key ? posTheme.primary : posTheme.border },
              ]}
              onPress={() => setSalesHandedness(opt.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: salesHandedness === opt.key }}
            >
              <View style={[styles.navIconWrap, { backgroundColor: salesHandedness === opt.key ? posTheme.accent : posTheme.surface }]}>
                <Ionicons name={opt.icon} size={22} color={salesHandedness === opt.key ? posTheme.onPrimary : posTheme.accent} />
              </View>
              <Text style={[styles.navLabel, { color: salesHandedness === opt.key ? posTheme.onPrimary : posTheme.text }]}>
                {opt.label}
              </Text>
              <Text style={[styles.navDesc, { color: salesHandedness === opt.key ? posTheme.onPrimary : posTheme.muted }]}>
                {opt.desc}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      {/* Theme Card */}
      <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }, !showSettingsSection("theme appearance light dark auto system color palette primary accent background navigation") && styles.hidden]}>
        <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Theme</Text>
        <Text style={[styles.sectionDesc, { color: sectionDescColor }]}>Choose an appearance and customize the colors shared by login, registration, navigation, and the main POS.</Text>

        <View style={styles.themeGrid}>
          <TouchableOpacity
            style={[
              styles.themeCard,
              { backgroundColor: posTheme.surfaceAlt, borderColor: posTheme.border },
              themeMode === "light" && styles.themeCardActive,
              themeMode === "light" && { backgroundColor: posTheme.primary, borderColor: posTheme.primary },
            ]}
            onPress={() => setThemeMode("light")}
          >
            <View style={[styles.themeIconWrap, themeMode === "light" && styles.themeIconWrapActive, themeMode === "light" && { backgroundColor: posTheme.accent }]}>
              <Ionicons name="sunny-outline" size={22} color={themeMode === "light" ? posTheme.onPrimary : "#f59e0b"} />
            </View>
            <Text style={[styles.themeLabel, { color: themeMode === "light" ? posTheme.onPrimary : posTheme.text }, themeMode === "light" && styles.themeLabelActive]}>
              Light
            </Text>
            <Text style={[styles.themeDesc, { color: themeMode === "light" ? posTheme.onPrimary : posTheme.muted }, themeMode === "light" && styles.themeDescActive]}>
              Bright mode for daytime
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.themeCard,
              { backgroundColor: posTheme.surfaceAlt, borderColor: posTheme.border },
              themeMode === "dark" && styles.themeCardActive,
              themeMode === "dark" && { backgroundColor: posTheme.primary, borderColor: posTheme.primary },
            ]}
            onPress={() => setThemeMode("dark")}
          >
            <View style={[styles.themeIconWrap, themeMode === "dark" && styles.themeIconWrapActive, themeMode === "dark" && { backgroundColor: posTheme.accent }]}>
              <Ionicons name="moon-outline" size={22} color={themeMode === "dark" ? posTheme.onPrimary : "#6366f1"} />
            </View>
            <Text style={[styles.themeLabel, { color: themeMode === "dark" ? posTheme.onPrimary : posTheme.text }, themeMode === "dark" && styles.themeLabelActive]}>
              Dark
            </Text>
            <Text style={[styles.themeDesc, { color: themeMode === "dark" ? posTheme.onPrimary : posTheme.muted }, themeMode === "dark" && styles.themeDescActive]}>
              Low-light friendly
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.themeCard,
              { backgroundColor: posTheme.surfaceAlt, borderColor: posTheme.border },
              themeMode === "system" && styles.themeCardActive,
              themeMode === "system" && { backgroundColor: posTheme.primary, borderColor: posTheme.primary },
            ]}
            onPress={() => setThemeMode("system")}
          >
            <View style={[styles.themeIconWrap, themeMode === "system" && styles.themeIconWrapActive, themeMode === "system" && { backgroundColor: posTheme.accent }]}>
              <Ionicons name="contrast-outline" size={22} color={themeMode === "system" ? posTheme.onPrimary : "#0ea5e9"} />
            </View>
            <Text style={[styles.themeLabel, { color: themeMode === "system" ? posTheme.onPrimary : posTheme.text }, themeMode === "system" && styles.themeLabelActive]}>
              Auto
            </Text>
            <Text style={[styles.themeDesc, { color: themeMode === "system" ? posTheme.onPrimary : posTheme.muted }, themeMode === "system" && styles.themeDescActive]}>
              Follow system appearance
            </Text>
          </TouchableOpacity>
        </View>
        <ThemeColorEditor />
      </Card>

      <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }, !showSettingsSection("sounds audio volume mute notifications feedback") && styles.hidden]}>
        <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Sounds</Text>
        <Text style={[styles.sectionDesc, { color: sectionDescColor }]}>Control checkout, transfer, and connection feedback.</Text>

        <View style={[styles.soundToggleRow, { borderBottomColor: borderColor }]}>
          <View style={[styles.soundIcon, { backgroundColor: posTheme.surfaceAlt }]}>
            <Ionicons
              name={soundMuted ? "volume-mute-outline" : "volume-high-outline"}
              size={22}
              color={posTheme.accent}
            />
          </View>
          <View style={styles.soundToggleCopy}>
            <Text style={[styles.soundControlTitle, { color: fieldValueColor }]}>Sound effects</Text>
            <Text style={[styles.soundControlDesc, { color: fieldLabelColor }]}>
              {soundMuted ? "Muted" : "Played after important actions"}
            </Text>
          </View>
          <Switch
            value={!soundMuted}
            onValueChange={(enabled) => setSoundMuted(!enabled)}
            trackColor={{ false: posTheme.border, true: posTheme.accent }}
            thumbColor={!soundMuted ? posTheme.primary : posTheme.surface}
            accessibilityLabel="Sound effects"
          />
        </View>

        <View style={styles.volumeHeader}>
          <Text style={[styles.soundControlTitle, { color: fieldValueColor }]}>Master volume</Text>
          <Text style={[styles.volumePercent, { color: soundMuted ? fieldLabelColor : fieldValueColor }]}>{soundVolumePercent}%</Text>
        </View>
        <View style={styles.volumeControl}>
          <TouchableOpacity
            style={[styles.volumeButton, { backgroundColor: inputBg, borderColor: inputBorder }, soundVolume <= 0 && styles.volumeButtonDisabled]}
            onPress={() => adjustSoundVolume(-0.1)}
            disabled={soundVolume <= 0}
            accessibilityLabel="Lower sound volume"
          >
            <Ionicons name="remove" size={20} color={posTheme.accent} />
          </TouchableOpacity>
          <View style={[styles.volumeTrack, { backgroundColor: posTheme.surfaceAlt }]}>
            <View style={[styles.volumeFill, { width: `${soundVolumePercent}%`, opacity: soundMuted ? 0.45 : 1, backgroundColor: posTheme.accent }]} />
          </View>
          <TouchableOpacity
            style={[styles.volumeButton, { backgroundColor: inputBg, borderColor: inputBorder }, soundVolume >= 1 && styles.volumeButtonDisabled]}
            onPress={() => adjustSoundVolume(0.1)}
            disabled={soundVolume >= 1}
            accessibilityLabel="Raise sound volume"
          >
            <Ionicons name="add" size={20} color={posTheme.accent} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.individualSoundsTitle, { color: fieldLabelColor }]}>Individual sound levels</Text>
        <View style={styles.soundItems}>
          <SoundVolumeControl
            title="Checkout"
            icon="cash-outline"
            value={soundVolumes?.checkout ?? 1}
            muted={soundMuted || soundVolume <= 0}
            dark={dark}
            onChange={(value) => setFeedbackSoundVolume("checkout", value)}
            onPreview={() => void playSoundPreview(checkoutPreviewPlayer, "checkout")}
          />
          <SoundVolumeControl
            title="Transfer received"
            icon="cube-outline"
            value={soundVolumes?.transferReceived ?? 1}
            muted={soundMuted || soundVolume <= 0}
            dark={dark}
            onChange={(value) => setFeedbackSoundVolume("transferReceived", value)}
            onPreview={() => void playSoundPreview(transferPreviewPlayer, "transferReceived")}
          />
          <SoundVolumeControl
            title="OMS connected"
            icon="cloud-done-outline"
            value={soundVolumes?.omsConnected ?? 1}
            muted={soundMuted || soundVolume <= 0}
            dark={dark}
            onChange={(value) => setFeedbackSoundVolume("omsConnected", value)}
            onPreview={() => void playSoundPreview(omsConnectedPlayer, "omsConnected")}
          />
          <SoundVolumeControl
            title="OMS connection failed"
            icon="cloud-offline-outline"
            value={soundVolumes?.omsConnectionFailed ?? 1}
            muted={soundMuted || soundVolume <= 0}
            dark={dark}
            onChange={(value) => setFeedbackSoundVolume("omsConnectionFailed", value)}
            onPreview={() => void playSoundPreview(omsConnectionFailedPlayer, "omsConnectionFailed")}
          />
        </View>
      </Card>

      <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }, !showSettingsSection("application size zoom scale text images controls") && styles.hidden]}>
        <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Application Size</Text>
        <Text style={[styles.sectionDesc, { color: sectionDescColor }]}>Choose the size of text, images, controls, and navigation.</Text>
        <ApplicationSizeButtons value={uiScale} onChange={setUiScale} dark={dark} />
      </Card>

      {canManageBackups && <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }, !showSettingsSection("database backup export import recovery restore auto automatic schedule interval hours list delete remove local files") && styles.hidden]}>
        <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Database & Recovery</Text>
        <Text style={[styles.sectionDesc, { color: sectionDescColor }]}>Create a checksum-verified backup containing the complete local database, branding assets, theme palettes, and device UI preferences, or validate and restore a compatible backup.</Text>
        <View style={[styles.backupNotice, { backgroundColor: posTheme.surfaceAlt, borderColor: cardBorder }]}><Ionicons name="shield-checkmark-outline" size={22} color={posTheme.accent} /><View style={{ flex: 1 }}><Text style={{ color: posTheme.text, fontWeight: "800" }}>Restore policy</Text><Text style={{ color: posTheme.muted, fontSize: 12, lineHeight: 18, marginTop: 2 }}>Restore can be performed at any time. The format, schema version, checksum, business identity, and totals are always validated, and you must enter your POS login {isBuiltInSuperAdmin ? "password" : "PIN"} to confirm. Restoring replaces the current database, so create a backup first if the existing data matters.</Text></View></View>

        <View style={[styles.backupAutoPanel, { borderColor: cardBorder, backgroundColor: posTheme.surfaceAlt }]}>
          <View style={styles.autoBackupHeading}>
            <View style={styles.sectionHeadingCopy}>
              <Text style={{ color: posTheme.text, fontWeight: "900" }}>Auto backup</Text>
              <Text style={{ color: posTheme.muted, fontSize: 12, lineHeight: 18, marginTop: 2 }}>Create a checksum-verified local backup automatically on a schedule.</Text>
            </View>
            <Switch
              value={autoBackupEnabled}
              onValueChange={setAutoBackupEnabled}
              trackColor={{ false: posTheme.border, true: posTheme.accent }}
              thumbColor={autoBackupEnabled ? posTheme.primary : posTheme.surface}
            />
          </View>
          <View style={styles.autoBackupControls}>
            <Text style={{ color: posTheme.text, fontWeight: "700", fontSize: 13 }}>Back up every</Text>
            <TextInput
              style={[styles.autoBackupInput, { backgroundColor: inputBg, borderColor: inputBorder, color: inputColor }]}
              value={backupIntervalInput}
              onChangeText={(value) => setBackupIntervalInput(value.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              maxLength={3}
              accessibilityLabel="Auto backup interval in hours"
            />
            <Text style={{ color: posTheme.muted, fontSize: 12 }}>hours</Text>
            <TouchableOpacity style={[styles.autoBackupApply, { backgroundColor: posTheme.primary }]} onPress={handleApplyBackupInterval}>
              <Ionicons name="checkmark" size={16} color={posTheme.onPrimary} />
              <Text style={{ color: posTheme.onPrimary, fontWeight: "800", fontSize: 12 }}>Apply</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.autoBackupPresets}>
            {AUTO_BACKUP_INTERVAL_PRESETS.map((hours) => {
              const active = autoBackupIntervalHours === hours;
              return (
                <TouchableOpacity
                  key={hours}
                  style={[styles.autoBackupPreset, { borderColor: active ? posTheme.primary : posTheme.border, backgroundColor: active ? posTheme.primary : "transparent" }]}
                  onPress={() => handleBackupIntervalPreset(hours)}
                  accessibilityState={{ selected: active }}
                >
                  <Text style={{ color: active ? posTheme.onPrimary : posTheme.muted, fontWeight: "800", fontSize: 11 }}>{formatBackupIntervalLabel(hours)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.autoBackupStatus}>
            <Ionicons name="time-outline" size={15} color={posTheme.muted} />
            <Text style={{ color: posTheme.muted, fontSize: 12, flex: 1 }}>
              {autoBackupEnabled
                ? `Every ${formatBackupIntervalLabel(autoBackupIntervalHours)} · Last: ${lastAutoBackupAt ? new Date(lastAutoBackupAt).toLocaleString() : "never"} · Next: ${nextAutoBackupLabel}`
                : "Auto backup is off. Turn it on to keep a scheduled recovery copy."}
            </Text>
          </View>
          <Button title={backupBusy === "export" ? "Backing up..." : "Back Up Now"} icon="cloud-upload-outline" onPress={() => void handleRunAutoBackup()} loading={backupBusy === "export"} disabled={backupBusy !== null} style={styles.backupButton} />
        </View>

        <View style={styles.backupActions}>
          <Button title={backupBusy === "export" ? "Exporting backup..." : "Export Backup Locally"} icon="download-outline" onPress={() => void handleCreateLocalBackup()} loading={backupBusy === "export"} disabled={backupBusy !== null} style={styles.backupButton} />
          <Button title={backupBusy === "import" ? "Reading backup..." : "Select Backup File"} icon="folder-open-outline" variant="secondary" onPress={() => void handleSelectBackup()} loading={backupBusy === "import" && !selectedBackup} disabled={backupBusy !== null} style={styles.backupButton} />
        </View>
        {selectedBackup ? <View style={[styles.backupManifest, { borderColor: posTheme.accent, backgroundColor: posTheme.surfaceAlt }]}>
          <View style={styles.backupManifestTitle}><Ionicons name="checkmark-circle" size={21} color="#16a34a" /><Text style={{ color: posTheme.text, fontWeight: "900" }}>Verified backup selected</Text></View>
          <Text style={[styles.backupFileName, { color: posTheme.text }]} numberOfLines={2}>{selectedBackup.file.name}</Text>
          <View style={styles.backupTotals}><Text style={{ color: posTheme.muted }}>Created</Text><Text style={{ color: posTheme.text, fontWeight: "700" }}>{new Date(selectedBackup.envelope.createdAt).toLocaleString()}</Text><Text style={{ color: posTheme.muted }}>Schema</Text><Text style={{ color: posTheme.text, fontWeight: "700" }}>v{selectedBackup.envelope.schemaVersion}</Text><Text style={{ color: posTheme.muted }}>Business ID</Text><Text selectable style={{ color: posTheme.text, fontWeight: "700" }}>{selectedBackup.envelope.businessId}</Text><Text style={{ color: posTheme.muted }}>Theme & UI preferences</Text><Text style={{ color: posTheme.text, fontWeight: "700" }}>{selectedBackup.envelope.uiPreferences ? "Included" : "Legacy backup — database only"}</Text><Text style={{ color: posTheme.muted }}>Records</Text><Text style={{ color: posTheme.text, fontWeight: "700" }}>{selectedBackup.envelope.totals.sales} sales · {selectedBackup.envelope.totals.products} products · {selectedBackup.envelope.totals.inventoryQuantity} stock</Text></View>
          <View style={styles.backupActions}><Button title="Choose Another" variant="secondary" icon="folder-open-outline" onPress={() => void handleSelectBackup()} disabled={backupBusy !== null} style={styles.backupButton} /><Button title="Restore Backup" variant="danger" icon="refresh-outline" onPress={() => handleRestoreBackup()} loading={backupBusy === "import"} disabled={backupBusy !== null} style={styles.backupButton} /></View>
        </View> : null}

        <View style={styles.backupListHeader}>
          <Text style={{ color: sectionTitleColor, fontWeight: "900", fontSize: 15 }}>Local backups</Text>
          <View style={styles.backupListMeta}>
            <Text style={{ color: sectionDescColor, fontSize: 12 }}>{backupItems.length} {backupItems.length === 1 ? "file" : "files"}</Text>
            <TouchableOpacity style={[styles.backupRefreshButton, { borderColor: posTheme.border }]} onPress={() => void refreshBackupList()} disabled={backupListLoading} accessibilityLabel="Refresh backup list">
              <Ionicons name="refresh-outline" size={16} color={posTheme.accent} />
            </TouchableOpacity>
          </View>
        </View>
        {backupListLoading && backupItems.length === 0 ? (
          <View style={styles.backupListEmpty}><ActivityIndicator size="small" color={posTheme.accent} /></View>
        ) : backupItems.length === 0 ? (
          <View style={[styles.backupListEmpty, { borderColor: cardBorder, backgroundColor: posTheme.surfaceAlt }]}>
            <Ionicons name="folder-open-outline" size={22} color={posTheme.muted} />
            <Text style={{ color: posTheme.muted, fontSize: 12, textAlign: "center" }}>No local backups yet. Export a backup or turn on auto backup to create one.</Text>
          </View>
        ) : (
          <View style={styles.backupList}>
            {backupItems.map((backup) => (
              <View key={backup.uri} style={[styles.backupFileRow, { borderColor: cardBorder, backgroundColor: posTheme.surfaceAlt }]}>
                <Ionicons name="document-text-outline" size={19} color={posTheme.accent} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: posTheme.text, fontWeight: "700", fontSize: 12 }} numberOfLines={2}>{backup.name}</Text>
                  <Text style={{ color: posTheme.muted, fontSize: 11, marginTop: 3 }}>{new Date(backup.createdAt).toLocaleString()} · {formatFileSize(backup.size)}</Text>
                </View>
                <View style={styles.backupFileActions}>
                  {busyBackupUri === backup.uri ? <ActivityIndicator size="small" color={posTheme.accent} /> : <>
                    <TouchableOpacity style={[styles.backupFileAction, { borderColor: posTheme.primary }]} onPress={() => handleRestoreBackup(backup.uri, backup.name)} disabled={backupBusy !== null} accessibilityLabel={`Restore ${backup.name}`}>
                      <Ionicons name="refresh-outline" size={15} color={posTheme.primary} />
                      <Text style={{ color: posTheme.primary, fontWeight: "800", fontSize: 11 }}>Restore</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.backupFileAction, { borderColor: "#dc3545" }]} onPress={() => handleDeleteBackup(backup.uri, backup.name)} disabled={backupBusy !== null} accessibilityLabel={`Delete ${backup.name}`}>
                      <Ionicons name="trash-outline" size={15} color="#dc3545" />
                      <Text style={{ color: "#dc3545", fontWeight: "800", fontSize: 11 }}>Delete</Text>
                    </TouchableOpacity>
                  </>}
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>}

      {/* Device Card */}
      <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }, !showSettingsSection("device session sign out reset registration") && styles.hidden]}>
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

      <Modal visible={showCreateUser} transparent animationType="fade" onRequestClose={closeUserModal}>
        <View style={styles.modalOverlay}>
          <View style={[styles.createUserModal, { backgroundColor: posTheme.surface, borderColor: cardBorder }]}>
            <View style={styles.createUserHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: sectionTitleColor }]}>{editingUser ? "Edit User" : "Create User"}</Text>
                <Text style={[styles.createUserHelp, { color: sectionDescColor }]}>{editingUser ? "Update the account details. Leave the PIN empty to keep it." : "This user starts with a separate sales history."}</Text>
              </View>
              <TouchableOpacity style={styles.modalCloseButton} onPress={closeUserModal}>
                <Ionicons name="close" size={20} color={fieldLabelColor} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.createUserLabel, { color: fieldLabelColor }]}>Display name</Text>
            <TextInput style={[styles.createUserInput, { backgroundColor: inputBg, borderColor: inputBorder, color: inputColor }]} value={newUserName} onChangeText={setNewUserName} placeholder="Cashier name" placeholderTextColor={fieldLabelColor} />
            <Text style={[styles.createUserLabel, { color: fieldLabelColor }]}>Username (optional)</Text>
            <TextInput style={[styles.createUserInput, { backgroundColor: inputBg, borderColor: inputBorder, color: inputColor }]} value={newUsername} onChangeText={setNewUsername} placeholder="Username" placeholderTextColor={fieldLabelColor} autoCapitalize="none" />
            <Text style={[styles.createUserLabel, { color: fieldLabelColor }]}>Access role</Text>
            <View style={styles.permissionRoleRow}>{permissionRoles.filter((role) => role.name.toLowerCase() !== "admin" || editingUser?.roleId === role.id).map((role) => { const selected = newUserRoleId === role.id; return <TouchableOpacity key={`user-role-${role.id}`} onPress={() => setNewUserRoleId(role.id)} style={[styles.permissionRole, { backgroundColor: selected ? posTheme.primary : posTheme.surfaceAlt, borderColor: selected ? posTheme.primary : posTheme.border }]}><Text style={[styles.permissionRoleText, { color: selected ? posTheme.onPrimary : posTheme.text }]}>{role.name}</Text></TouchableOpacity>; })}</View>
            <Text style={[styles.createUserLabel, { color: fieldLabelColor }]}>{editingUser ? "New 6-digit PIN (optional)" : "6-digit PIN"}</Text>
            <TextInput style={[styles.createUserInput, { backgroundColor: inputBg, borderColor: inputBorder, color: inputColor }]} value={newUserPin} onChangeText={setNewUserPin} placeholder={editingUser ? "Keep current PIN" : "Enter PIN"} placeholderTextColor={fieldLabelColor} keyboardType="number-pad" secureTextEntry maxLength={6} />
            <Text style={[styles.createUserLabel, { color: fieldLabelColor }]}>Confirm PIN</Text>
            <TextInput style={[styles.createUserInput, { backgroundColor: inputBg, borderColor: inputBorder, color: inputColor }]} value={newUserPinConfirm} onChangeText={setNewUserPinConfirm} placeholder="Enter PIN again" placeholderTextColor={fieldLabelColor} keyboardType="number-pad" secureTextEntry maxLength={6} />
            <Button title={creatingUser ? "Saving..." : editingUser ? "Save User" : "Create User"} onPress={handleSaveUser} loading={creatingUser} icon={editingUser ? "checkmark-circle-outline" : "person-add-outline"} style={styles.createUserSubmit} />
          </View>
        </View>
      </Modal>

      <Modal visible={showPermissionRolePicker} transparent animationType="fade" onRequestClose={() => setShowPermissionRolePicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowPermissionRolePicker(false)}>
          <View style={[styles.permissionRolePicker, { backgroundColor: posTheme.surface, borderColor: posTheme.border }]}>
            <Text style={[styles.modalTitle, { color: posTheme.text }]}>Select role</Text>
            <Text style={[styles.permissionSelectHint, { color: posTheme.muted, marginBottom: 8 }]}>The user list will be filtered to this role.</Text>
            {permissionRoles.map((role) => {
              const selected = role.id === selectedPermissionRoleId;
              return <TouchableOpacity key={`permission-role-option-${role.id}`} style={[styles.permissionRoleOption, { backgroundColor: selected ? posTheme.surfaceAlt : "transparent", borderBottomColor: posTheme.border }]} onPress={() => void selectPermissionRole(role.id)}><View style={{ flex: 1 }}><Text style={[styles.permissionRoleOptionTitle, { color: posTheme.text }]}>{role.name}</Text><Text style={[styles.permissionSelectHint, { color: posTheme.muted }]}>{role.description || "POS access role"}</Text></View>{selected ? <Ionicons name="checkmark-circle" size={21} color={posTheme.accent} /> : null}</TouchableOpacity>;
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      <BarcodeScannerModal
        visible={hardwareScannerVisible}
        dark={dark}
        onClose={() => setHardwareScannerVisible(false)}
        onScan={(code) => {
          setHardwareScanResult(code);
          setHardwareScannerVisible(false);
        }}
      />

      {/* Currency Picker Modal */}
      <Modal visible={showCurrencyPicker} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCurrencyPicker(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: posTheme.surface, borderColor: posTheme.border }]}>
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
                  <Ionicons name="checkmark" size={18} color={posTheme.accent} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Restore PIN Confirmation Modal */}
      <Modal visible={restorePinVisible} transparent animationType="fade" onRequestClose={() => { if (!restorePinBusy) { setRestorePinVisible(false); setRestoreTarget(null); } }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.restorePinModal, { backgroundColor: posTheme.surface, borderColor: posTheme.border }]}>
            <View style={styles.backupManifestTitle}><Ionicons name="lock-closed-outline" size={20} color={posTheme.primary} /><Text style={{ color: posTheme.text, fontWeight: "900", fontSize: 16 }}>Confirm restore</Text></View>
            <Text style={{ color: posTheme.muted, fontSize: 12, lineHeight: 18 }}>Restoring replaces the entire local database with the selected backup. This cannot be undone.</Text>
            {restoreTarget?.label ? <Text style={[styles.backupFileName, { color: posTheme.text, marginTop: 10, marginBottom: 0 }]} numberOfLines={2}>{restoreTarget.label}</Text> : null}
            <Text style={{ color: posTheme.text, fontWeight: "700", fontSize: 12, marginTop: 12, marginBottom: 6 }}>{isBuiltInSuperAdmin ? "Enter your password" : "Enter your PIN"} to continue</Text>
            <TextInput
              style={[styles.restorePinInput, { backgroundColor: inputBg, borderColor: restorePinError ? "#dc3545" : inputBorder, color: inputColor }]}
              value={restorePin}
              onChangeText={(value) => { setRestorePin(isBuiltInSuperAdmin ? value : value.replace(/[^0-9]/g, "")); if (restorePinError) setRestorePinError(null); }}
              secureTextEntry
              autoFocus
              keyboardType={isBuiltInSuperAdmin ? "default" : "number-pad"}
              maxLength={isBuiltInSuperAdmin ? 64 : 6}
              placeholder={isBuiltInSuperAdmin ? "Password" : "6-digit PIN"}
              placeholderTextColor={posTheme.muted}
              editable={!restorePinBusy}
              onSubmitEditing={confirmRestoreWithPin}
            />
            {restorePinError ? <Text style={{ color: "#dc3545", fontSize: 12, marginTop: 8 }}>{restorePinError}</Text> : null}
            <View style={styles.restorePinActions}>
              <TouchableOpacity style={[styles.restorePinCancel, { borderColor: posTheme.border }]} onPress={() => { if (!restorePinBusy) { setRestorePinVisible(false); setRestoreTarget(null); } }} disabled={restorePinBusy}>
                <Text style={{ color: posTheme.muted, fontWeight: "800", fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.restorePinConfirm, { backgroundColor: "#dc3545" }]} onPress={confirmRestoreWithPin} disabled={restorePinBusy}>
                {restorePinBusy ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name="refresh-outline" size={16} color="#ffffff" />}
                <Text style={{ color: "#ffffff", fontWeight: "900", fontSize: 13 }}>{backupBusy === "import" ? "Restoring..." : "Restore database"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  settingsSplit: { flex: 1, flexDirection: "row", overflow: "hidden" },
  settingsSidebar: { height: "100%", borderRightWidth: 1, paddingTop: 14, paddingHorizontal: 9 },
  settingsSidebarTitle: { fontSize: 19, fontWeight: "900", paddingHorizontal: 5, marginBottom: 10 },
  settingsSidebarSearch: { minHeight: 38, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 5 },
  settingsSidebarSearchInput: { flex: 1, minWidth: 0, paddingVertical: 7, fontSize: 12 },
  settingsSidebarCount: { fontSize: 10, paddingHorizontal: 4, marginTop: 7 },
  settingsLinksScroll: { flex: 1, marginTop: 8 },
  settingsLinks: { paddingBottom: 18, gap: 3 },
  settingsLink: { minHeight: 45, borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 7 },
  settingsLinkIcon: { width: 30, height: 30, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  settingsLinkText: { flex: 1, fontSize: 11, lineHeight: 14 },
  settingsSidebarEmpty: { alignItems: "center", paddingVertical: 30, gap: 7 },
  settingsDetailPane: { flex: 1, minWidth: 0 },
  settingsDetailContent: { padding: 18, paddingBottom: 56 },
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
  settingsSearch: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  settingsSearchInput: {
    flex: 1,
    paddingVertical: 9,
    fontSize: 14,
  },
  searchResultCount: { fontSize: 12, marginTop: -7, marginBottom: 13 },
  settingsHubGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  settingsHubCard: { width: "100%", maxWidth: 560, minHeight: 96, borderWidth: 1, borderRadius: 12, padding: 15, flexDirection: "row", alignItems: "center", gap: 12 },
  settingsHubIcon: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  settingsHubTitle: { fontSize: 16, fontWeight: "900" },
  settingsHubDescription: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  settingsHubMatch: { fontSize: 11, fontWeight: "800", marginTop: 6 },
  noSettingsResults: { minHeight: 180, borderWidth: 1, borderRadius: 12, borderStyle: "dashed", alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  settingsDetailHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 },
  settingsBackButton: { width: 44, height: 44, borderWidth: 1, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  hidden: {
    display: "none",
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
  backupNotice: { borderWidth: 1, borderRadius: 10, padding: 13, flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 14 },
  backupActions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  backupButton: { flexGrow: 1, minWidth: 190 },
  backupManifest: { borderWidth: 1, borderRadius: 10, padding: 14, marginTop: 15 },
  backupManifestTitle: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 },
  backupFileName: { fontFamily: "monospace", fontSize: 12, marginBottom: 12 },
  backupTotals: { gap: 4, marginBottom: 14 },
  backupAutoPanel: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 15, gap: 12 },
  autoBackupHeading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14 },
  autoBackupControls: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  autoBackupInput: { width: 74, minHeight: 40, borderWidth: 1, borderRadius: 7, paddingHorizontal: 12, fontSize: 14, fontWeight: "700", textAlign: "center" },
  autoBackupApply: { minHeight: 40, borderRadius: 7, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  autoBackupPresets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  autoBackupPreset: { minHeight: 34, borderWidth: 1, borderRadius: 7, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  autoBackupStatus: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  backupListHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 18, marginBottom: 10 },
  backupListMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  backupRefreshButton: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  backupList: { gap: 10 },
  backupListEmpty: { borderWidth: 1, borderRadius: 10, padding: 18, alignItems: "center", justifyContent: "center", gap: 8 },
  backupFileRow: { borderWidth: 1, borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  backupFileActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  backupFileAction: { minHeight: 32, borderWidth: 1, borderRadius: 7, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  sectionHeadingCopy: {
    flex: 1,
  },
  addUserButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 7,
    backgroundColor: "#17386b",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  addUserButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  linkUserButton: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 7,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  linkUserButtonActive: {
    backgroundColor: "#17386b",
    borderColor: "#17386b",
  },
  linkUserButtonText: {
    fontSize: 11,
    fontWeight: "700",
  },
  linkUserButtonTextActive: {
    color: "#ffffff",
  },
  autoLockHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  autoLockEditor: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  autoLockInput: {
    width: 90,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: "700",
  },
  autoLockUnits: {
    minHeight: 40,
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 7,
    overflow: "hidden",
  },
  autoLockUnit: {
    minWidth: 76,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  autoLockUnitSelected: {
    backgroundColor: "#17386b",
  },
  autoLockUnitText: {
    fontSize: 12,
    fontWeight: "700",
  },
  autoLockApply: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 7,
    backgroundColor: "#17386b",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  autoLockApplyText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  autoLockStatus: {
    fontSize: 11,
    marginTop: 10,
  },
  createUserModal: {
    width: "90%",
    maxWidth: 440,
    borderRadius: 8,
    borderWidth: 1,
    padding: 20,
  },
  createUserHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  createUserHelp: {
    fontSize: 11,
    marginTop: 4,
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  createUserLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  createUserInput: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 12,
    marginBottom: 13,
    fontSize: 13,
  },
  createUserSubmit: {
    marginTop: 5,
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
  lockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#dc3545",
  },
  lockedBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
  },
  securitySettingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    marginBottom: 18,
  },
  securityHelp: {
    fontSize: 11,
    marginTop: 3,
  },
  securityNumberInput: {
    width: 64,
    height: 42,
    borderWidth: 1,
    borderRadius: 7,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
  },
  securityApplyButton: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 7,
    backgroundColor: "#17386b",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  securityApplyText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  securityListTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  lockedUserRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  lockedUserCopy: {
    flex: 1,
    minWidth: 0,
  },
  unlockButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 7,
    backgroundColor: "#17386b",
  },
  unlockButtonText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
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
  userActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  userActionButton: {
    width: 32,
    height: 32,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
  soundToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 14,
    marginBottom: 14,
    borderBottomWidth: 1,
  },
  soundIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  soundToggleCopy: {
    flex: 1,
    minWidth: 0,
  },
  soundControlTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  soundControlDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  volumeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  volumePercent: {
    fontSize: 13,
    fontWeight: "700",
    minWidth: 42,
    textAlign: "right",
  },
  volumeControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  volumeButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  volumeButtonDisabled: {
    opacity: 0.4,
  },
  volumeTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
  },
  volumeFill: {
    height: "100%",
    borderRadius: 5,
    backgroundColor: "#2563a6",
  },
  individualSoundsTitle: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 20,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  soundItems: {
    width: "100%",
  },
  soundItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  soundItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 9,
  },
  soundItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  soundItemTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "600",
  },
  soundItemPercent: {
    width: 42,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },
  soundItemPreview: {
    width: 34,
    height: 34,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  soundStepButton: {
    width: 34,
    height: 34,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  printerHeadingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  printerStatusBadge: {
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  printerStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  printerStatusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  selectedPrinterSummary: {
    minHeight: 62,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginBottom: 12,
  },
  printerIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  printerToolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  printerToolButton: {
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  printerToolText: {
    fontSize: 11,
    fontWeight: "600",
  },
  printerDeviceList: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  printerDeviceRow: {
    minHeight: 58,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderBottomWidth: 1,
  },
  printerDeviceRowLast: {
    borderBottomWidth: 0,
  },
  printerRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  printerRadioSelected: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2563a6",
  },
  printerDeviceCopy: {
    flex: 1,
    minWidth: 0,
  },
  printerDeviceName: {
    fontSize: 13,
    fontWeight: "700",
  },
  printerDeviceAddress: {
    fontSize: 10,
    marginTop: 2,
  },
  connectedDeviceLabel: {
    color: "#22a447",
    fontSize: 10,
    fontWeight: "700",
  },
  printerEmpty: {
    minHeight: 58,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  printerEmptyText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },
  printerButtonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  printerActionButton: {
    flexGrow: 1,
    minWidth: 150,
  },
  testActionButton: {
    alignSelf: "flex-start",
    minWidth: 220,
  },
  hardwareTestGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  hardwareTestItem: { width: "31%", minWidth: 220, flexGrow: 1, borderWidth: 1, borderRadius: 10, padding: 14, gap: 7 },
  hardwareTestTitle: { fontSize: 13, fontWeight: "900" },
  hardwareTestHelp: { fontSize: 11, lineHeight: 16 },
  hardwareTestButton: { marginTop: 5 },
  hardwareScanSuccess: { marginTop: 12, borderWidth: 1, borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  permissionRoleRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  permissionRole: { minHeight: 40, borderWidth: 1, borderRadius: 8, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" },
  permissionRoleText: { fontSize: 12, fontWeight: "800" },
  permissionSelect: { minHeight: 64, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  permissionSelectValue: { fontSize: 14, fontWeight: "900" },
  permissionSelectHint: { fontSize: 10, lineHeight: 15, marginTop: 2 },
  permissionUserGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  permissionUser: { width: "48%", minWidth: 220, flexGrow: 1, minHeight: 58, borderWidth: 1, borderRadius: 10, padding: 10, flexDirection: "row", alignItems: "center", gap: 9 },
  permissionUserName: { fontSize: 12, fontWeight: "900" },
  permissionUserHandle: { fontSize: 10, marginTop: 2 },
  overrideBadge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4 },
  overrideBadgeText: { fontSize: 8, fontWeight: "900" },
  permissionHeadingRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  resetPermissionButton: { minHeight: 36, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  permissionPresetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  permissionPreset: { width: "48%", minWidth: 210, flexGrow: 1, borderWidth: 1, borderRadius: 9, padding: 12 },
  permissionPresetTitle: { fontSize: 13, fontWeight: "900" },
  permissionPresetDesc: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  permissionNotice: { borderWidth: 1, borderRadius: 9, padding: 11, flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 12 },
  permissionCategory: { borderWidth: 1, borderRadius: 10, overflow: "hidden", marginTop: 14 },
  permissionCategoryHeader: { paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 9 },
  permissionCategoryTitle: { fontSize: 13, fontWeight: "900" },
  permissionCategoryHint: { fontSize: 10, lineHeight: 14, marginTop: 1 },
  permissionItem: { minHeight: 66, borderBottomWidth: 1, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  permissionItemTitleRow: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" },
  permissionSourceBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  permissionItemTitle: { fontSize: 13, fontWeight: "800" },
  permissionItemDesc: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  permissionItemGroup: { fontSize: 10, fontWeight: "800", marginTop: 4, textTransform: "uppercase" },
  permissionRolePicker: { width: "86%", maxWidth: 520, maxHeight: "80%", borderWidth: 1, borderRadius: 14, padding: 16 },
  permissionRoleOption: { minHeight: 58, borderBottomWidth: 1, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  permissionRoleOptionTitle: { fontSize: 13, fontWeight: "900" },
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
  restorePinModal: { width: "90%", maxWidth: 420, borderWidth: 1, borderRadius: 16, padding: 20 },
  restorePinInput: { minHeight: 46, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, fontSize: 16, fontWeight: "700", letterSpacing: 2 },
  restorePinActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  restorePinCancel: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  restorePinConfirm: { flex: 1.4, minHeight: 44, borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
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

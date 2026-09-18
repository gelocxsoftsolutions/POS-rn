import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TextInput,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { DeviceService } from "@/lib/services/device.service";
import { CashierService } from "@/lib/services/cashier.service";
import { CashierRepository } from "@/lib/repositories/cashier.repository";
import { OmsSyncService } from "@/lib/services/oms-sync.service";
import { AuthenticationService } from "@/lib/services/authentication.service";
import { sha256 } from "@/lib/crypto/ed25519";
import { generateEd25519Keypair } from "@/lib/crypto/ed25519";
import { useDeviceStore } from "@/lib/stores/device-store";
import * as Constants from "expo-constants";

type Step = "choose" | "qr" | "manual" | "set-pins" | "success";

interface CashierPin {
  id: string;
  username: string;
  displayName: string;
  pin: string;
}

export default function RegisterDevice() {
  const [step, setStep] = useState<Step>("choose");
  const [token, setToken] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [cashierPins, setCashierPins] = useState<CashierPin[]>([]);
  const [pinErrors, setPinErrors] = useState<Record<string, string>>({});
  const router = useRouter();
  const device = useDeviceStore((s) => s.device);
  const setDevice = useDeviceStore((s) => s.setDevice);
  const registering = useRef(false);

  const doRegister = useCallback(async (activationToken: string, url?: string) => {
    if (registering.current) return;
    registering.current = true;
    setLoading(true);
    try {
      const serverUrl = url || process.env.EXPO_PUBLIC_OMS_URL || "https://staging.nctseafoods.store";
      const keys = generateEd25519Keypair();
      const result = await DeviceService.register({
        activationToken,
        publicKey: keys.publicKey,
        privateKey: keys.privateKey,
        machineIdentifier: Constants.default?.sessionId ?? "unknown",
        computerName: Constants.default?.deviceName ?? "POS Terminal",
        appVersion: Constants.default?.expoConfig?.version ?? "1.0.0",
        osVersion: "Android",
        serverUrl,
      });

      if (result.success && result.device) {
        const deviceState = useDeviceStore.getState().device;
        const deviceSecret = deviceState.deviceSecret || "";
        const privateKey = deviceState.privateKey || "";
        const deviceId = deviceState.deviceId || "";

        if (privateKey && deviceSecret && deviceId) {
          try {
            console.log("[Register] attempting auth login with deviceId:", deviceId);
            const authResult = await AuthenticationService.login(privateKey, deviceSecret, deviceId);
            console.log("[Register] auth login result:", authResult);
          } catch (e: any) { console.warn("[Register] auth login error:", e?.message); }
        }

        if (result.device.branchId) {
          const device = useDeviceStore.getState().device;
          if (device.branchId) {
            try {
              await OmsSyncService.syncBranchProducts(device.branchId);
            } catch { /* non-blocking */ }
          }
        }

        if (serverUrl) {
          const apiKey = useDeviceStore.getState().device.posApiKey || "";
          try {
            await OmsSyncService.connect(serverUrl, apiKey);
          } catch { /* non-blocking */ }
        }

        const cashiers = await CashierRepository.findAll();
        if (cashiers.length > 0) {
          setCashierPins(cashiers.map((c) => ({
            id: c.id,
            username: c.username ?? "",
            displayName: c.displayName,
            pin: "",
          })));
          setStep("set-pins");
        } else {
          setStep("success");
        }
      } else {
        setScanned(false);
        Alert.alert("Error", result.error ?? "Registration failed.");
      }
    } catch (e: any) {
      setScanned(false);
      console.error("[Register] unexpected error:", e);
      Alert.alert("Error", e?.message ?? "An unexpected error occurred during registration.");
    } finally {
      registering.current = false;
      setLoading(false);
    }
  }, [setDevice]);

  const handleManualRegister = useCallback(async () => {
    if (!token.trim()) {
      Alert.alert("Error", "Please enter an activation token.");
      return;
    }
    await doRegister(token.trim(), serverUrl.trim() || undefined);
  }, [token, serverUrl, doRegister]);

  const handleQRScan = useCallback(async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert("Permission Required", "Camera access is needed to scan QR codes.");
        return;
      }
    }
    setStep("qr");
  }, [permission, requestPermission]);

  const handleBarcodeScanned = useCallback(async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    try {
      let activationToken: string | undefined;
      let url: string | undefined;

      try {
        const parsed = JSON.parse(data);
        activationToken = parsed.activationToken ?? parsed.token;
        url = parsed.serverUrl ?? parsed.url;
      } catch {
        activationToken = data.trim();
      }

      if (!activationToken) {
        Alert.alert("Invalid QR", "QR code does not contain an activation token.");
        setScanned(false);
        return;
      }

      await doRegister(activationToken, url);
    } catch (e: any) {
      console.error("[Register] QR scan error:", e);
      Alert.alert("Invalid QR", e?.message ?? "Could not process QR code.");
      setScanned(false);
    }
  }, [scanned, doRegister]);

  if (step === "success") {
    return (
      <View style={styles.successContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8fbff" />
        <ScrollView contentContainerStyle={styles.successScroll} bounces={false} showsVerticalScrollIndicator={false}>
          <View style={styles.successCard}>
            <View style={styles.successIconCircle}>
              <Ionicons name="checkmark-circle" size={56} color="#22c55e" />
            </View>
            <Text style={styles.successTitle}>Device Registered</Text>
            <Text style={styles.successSubtitle}>
              This POS terminal is now provisioned and ready to use. You can sign in with your cashier credentials.
            </Text>

            <View style={styles.deviceDetails}>
              {device.deviceCode && (
                <View style={styles.detailRow}>
                  <View style={styles.detailLabelRow}>
                    <Ionicons name="barcode-outline" size={12} color="#6b7b8d" />
                    <Text style={styles.detailLabel}>Device Code</Text>
                  </View>
                  <Text style={styles.detailValue}>{device.deviceCode}</Text>
                </View>
              )}
              {device.publicIdentifier && (
                <View style={styles.detailRow}>
                  <View style={styles.detailLabelRow}>
                    <Ionicons name="finger-print-outline" size={12} color="#6b7b8d" />
                    <Text style={styles.detailLabel}>Identifier</Text>
                  </View>
                  <Text style={styles.detailValueMono} numberOfLines={1}>{device.publicIdentifier}</Text>
                </View>
              )}
              {device.branchName && (
                <View style={styles.detailRow}>
                  <View style={styles.detailLabelRow}>
                    <Ionicons name="storefront-outline" size={12} color="#6b7b8d" />
                    <Text style={styles.detailLabel}>Branch</Text>
                  </View>
                  <Text style={styles.detailValue}>{device.branchName}</Text>
                </View>
              )}
              {device.deviceName && (
                <View style={[styles.detailRow, { marginBottom: 0 }]}>
                  <View style={styles.detailLabelRow}>
                    <Ionicons name="phone-portrait-outline" size={12} color="#6b7b8d" />
                    <Text style={styles.detailLabel}>Terminal</Text>
                  </View>
                  <Text style={styles.detailValue}>{device.deviceName}</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.continueBtn}
              onPress={() => router.replace("/(auth)")}
              activeOpacity={0.85}
            >
              <Text style={styles.continueBtnText}>Continue to Sign In</Text>
              <Ionicons name="arrow-forward" size={16} color="#ffffff" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </View>
          <View style={styles.brandFooter}>
            <View style={styles.brandFooterIcon}>
              <Ionicons name="fish" size={14} color="#17386b" />
            </View>
            <Text style={styles.brandFooterText}>NCT Seafoods  •  Point of Sale</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (step === "set-pins") {
    const handlePinChange = (id: string, pin: string) => {
      setCashierPins((prev) =>
        prev.map((c) => (c.id === id ? { ...c, pin } : c))
      );
      setPinErrors((prev) => ({ ...prev, [id]: "" }));
    };

    const handleSavePins = async () => {
      const errors: Record<string, string> = {};
      let hasError = false;
      for (const c of cashierPins) {
        if (c.pin.length < 4) {
          errors[c.id] = "PIN must be at least 4 digits";
          hasError = true;
        }
      }
      if (hasError) {
        setPinErrors(errors);
        return;
      }

      setLoading(true);
      try {
        for (const c of cashierPins) {
          await CashierRepository.update(c.id, {
            pinHash: sha256(c.pin),
          });
        }
        setStep("success");
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? "Failed to save PINs.");
      } finally {
        setLoading(false);
      }
    };

    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "#f8fbff" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <StatusBar barStyle="dark-content" backgroundColor="#f8fbff" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep("success")} style={styles.backButton}>
            <Ionicons name="arrow-back" size={20} color="#17386b" />
          </TouchableOpacity>
          <View style={styles.headerBrand}>
            <View style={styles.headerBrandIcon}>
              <Ionicons name="fish" size={16} color="#17386b" />
            </View>
            <Text style={styles.headerBrandText}>NCT POS</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          <View style={styles.formHeader}>
            <View style={styles.formIconCircle}>
              <Ionicons name="key-outline" size={28} color="#17386b" />
            </View>
            <Text style={styles.formTitle}>Set Cashier PINs</Text>
            <Text style={styles.formSubtitle}>
              Assign a PIN for each cashier to sign in quickly on this terminal
            </Text>
          </View>

          <View style={styles.formCard}>
            {cashierPins.map((c) => (
              <View key={c.id} style={styles.inputGroup}>
                <Text style={styles.label}>{c.displayName}</Text>
                {c.username ? <Text style={styles.labelHint}>@{c.username}</Text> : null}
                <TextInput
                  style={[styles.input, pinErrors[c.id] ? { borderColor: "#dc3545", backgroundColor: "#fff5f5" } : null]}
                  placeholder="Enter 6-digit PIN"
                  placeholderTextColor="#b0b8c1"
                  value={c.pin}
                  onChangeText={(pin) => handlePinChange(c.id, pin)}
                  keyboardType="number-pad"
                  maxLength={6}
                  secureTextEntry
                />
                {pinErrors[c.id] ? (
                  <Text style={styles.fieldError}>{pinErrors[c.id]}</Text>
                ) : null}
              </View>
            ))}

            <TouchableOpacity
              style={[styles.registerBtn, loading && styles.registerBtnDisabled]}
              onPress={handleSavePins}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Text style={styles.registerBtnText}>Save PINs</Text>
                  <Ionicons name="checkmark" size={16} color="#ffffff" style={{ marginLeft: 8 }} />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modeToggle}
              onPress={() => setStep("success")}
            >
              <Text style={styles.modeToggleText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (step === "choose") {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8fbff" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={20} color="#17386b" />
          </TouchableOpacity>
          <View style={styles.headerBrand}>
            <View style={styles.headerBrandIcon}>
              <Ionicons name="fish" size={16} color="#17386b" />
            </View>
            <Text style={styles.headerBrandText}>NCT POS</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.chooseScroll} bounces={false} showsVerticalScrollIndicator={false}>
          <View style={styles.brandBlock}>
            <View style={styles.logoCircle}>
              <Ionicons name="fish" size={44} color="#17386b" />
            </View>
            <Text style={styles.brandTitle}>NCT Seafoods</Text>
            <Text style={styles.brandSubtitle}>Point of Sale Terminal</Text>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <View style={styles.dividerDot} />
              <View style={styles.dividerLine} />
            </View>
          </View>

          <Text style={styles.title}>Register this device</Text>
          <Text style={styles.subtitle}>
            Choose how you want to provision this terminal with your OMS
          </Text>

          <View style={styles.optionsWrap}>
            <TouchableOpacity style={styles.option} onPress={handleQRScan} activeOpacity={0.7}>
              <View style={styles.optionIcon}>
                <Ionicons name="qr-code" size={26} color="#17386b" />
              </View>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Scan QR Code</Text>
                <Text style={styles.optionDesc}>Scan the activation QR from your OMS dashboard</Text>
              </View>
              <View style={styles.optionChevron}>
                <Ionicons name="chevron-forward" size={18} color="#9fb0c8" />
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.option} onPress={() => setStep("manual")} activeOpacity={0.7}>
              <View style={styles.optionIcon}>
                <Ionicons name="create-outline" size={26} color="#17386b" />
              </View>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Enter Token Manually</Text>
                <Text style={styles.optionDesc}>Type the activation token and server URL</Text>
              </View>
              <View style={styles.optionChevron}>
                <Ionicons name="chevron-forward" size={18} color="#9fb0c8" />
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.helpCard}>
            <Ionicons name="information-circle-outline" size={16} color="#6b7b8d" />
            <Text style={styles.helpText}>You can generate an activation token in OMS → POS → Devices → Add Device</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (step === "qr") {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8fbff" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { setStep("choose"); setScanned(false); }} style={styles.backButton}>
            <Ionicons name="arrow-back" size={20} color="#17386b" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan QR</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={styles.qrScroll} bounces={false} showsVerticalScrollIndicator={false}>
          <View style={styles.qrContainer}>
            {permission?.granted ? (
              <View style={styles.cameraCard}>
                <View style={styles.cameraWrapper}>
                  <CameraView
                    style={styles.camera}
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                    onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                  />
                  {/* scanning corner brackets */}
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                  {loading && (
                    <View style={styles.cameraOverlay}>
                      <ActivityIndicator size="large" color="#ffffff" />
                      <Text style={styles.cameraOverlayText}>Registering device…</Text>
                    </View>
                  )}
                </View>
              </View>
            ) : (
              <View style={styles.permissionCard}>
                <View style={styles.permissionIcon}>
                  <Ionicons name="camera-outline" size={48} color="#17386b" />
                </View>
                <Text style={styles.qrTitle}>Camera permission needed</Text>
                <Text style={styles.qrSubtitle}>
                  Allow camera access to scan the OMS activation QR
                </Text>
                <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission} activeOpacity={0.8}>
                  <Ionicons name="camera" size={16} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.permissionBtnText}>Grant Permission</Text>
                </TouchableOpacity>
              </View>
            )}
            <Text style={styles.qrTitle}>Scan QR Code</Text>
            <Text style={styles.qrSubtitleCenter}>
              Point your camera at the QR code displayed on your OMS dashboard
            </Text>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => { setStep("choose"); setScanned(false); }}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Back</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#f8fbff" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#f8fbff" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setStep("choose")} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color="#17386b" />
        </TouchableOpacity>
        <View style={styles.headerBrand}>
          <View style={styles.headerBrandIcon}>
            <Ionicons name="fish" size={16} color="#17386b" />
          </View>
          <Text style={styles.headerBrandText}>NCT POS</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
        <View style={styles.formHeader}>
          <View style={styles.formIconCircle}>
            <Ionicons name="keypad-outline" size={28} color="#17386b" />
          </View>
          <Text style={styles.formTitle}>Enter details manually</Text>
          <Text style={styles.formSubtitle}>
            Input the activation token and server URL from your administrator
          </Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Activation Token</Text>
            <TextInput
              style={styles.input}
              placeholder="Paste activation token"
              placeholderTextColor="#b0b8c1"
              value={token}
              onChangeText={setToken}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Server URL</Text>
            <Text style={styles.labelHint}>Leave empty to use the default staging server</Text>
            <TextInput
              style={styles.input}
              placeholder="https://oms.example.com"
              placeholderTextColor="#b0b8c1"
              value={serverUrl}
              onChangeText={setServerUrl}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            style={[styles.registerBtn, loading && styles.registerBtnDisabled]}
            onPress={handleManualRegister}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Text style={styles.registerBtnText}>Register Device</Text>
                <Ionicons name="arrow-forward" size={16} color="#ffffff" style={{ marginLeft: 8 }} />
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fbff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: "#f8fbff",
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7",
  },
  headerBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerBrandIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#f0f4ff",
    borderWidth: 1,
    borderColor: "#e8edf3",
    alignItems: "center",
    justifyContent: "center",
  },
  headerBrandText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#17386b",
    letterSpacing: 0.6,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1a202c",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e8edf3",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  // choose step
  chooseScroll: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
    alignItems: "center",
  },
  brandBlock: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 12,
    width: "100%",
    maxWidth: 420,
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e8edf3",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    shadowColor: "#17386b",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#17386b",
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7b8d",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 4,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    width: 120,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#e8edf3",
  },
  dividerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#cbd5e1",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1a202c",
    marginTop: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    color: "#6b7b8d",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  optionsWrap: {
    width: "100%",
    maxWidth: 420,
    gap: 12,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    width: "100%",
    borderWidth: 1,
    borderColor: "#e8edf3",
    shadowColor: "#17386b",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#f0f4ff",
    borderWidth: 1,
    borderColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  optionInfo: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1a202c",
  },
  optionDesc: {
    fontSize: 12,
    color: "#6b7b8d",
    marginTop: 3,
    lineHeight: 16,
  },
  optionChevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f8fbff",
    borderWidth: 1,
    borderColor: "#eef2f7",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  helpCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#f0f4ff",
    borderWidth: 1,
    borderColor: "#e0e7ff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
    width: "100%",
    maxWidth: 420,
  },
  helpText: {
    flex: 1,
    fontSize: 12,
    color: "#5a6b84",
    lineHeight: 16,
  },
  qrScroll: {
    flexGrow: 1,
  },
  qrContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  cameraCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e8edf3",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    marginBottom: 20,
  },
  cameraWrapper: {
    width: 280,
    height: 280,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#0f1729",
  },
  camera: {
    flex: 1,
  },
  corner: {
    position: "absolute",
    width: 28,
    height: 28,
    borderColor: "#ffffff",
  },
  cornerTL: { top: 14, left: 14, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 10 },
  cornerTR: { top: 14, right: 14, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 10 },
  cornerBL: { bottom: 14, left: 14, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 10 },
  cornerBR: { bottom: 14, right: 14, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 10 },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,41,0.62)",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraOverlayText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 10,
  },
  permissionCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e8edf3",
    paddingHorizontal: 24,
    paddingVertical: 28,
    width: "100%",
    maxWidth: 360,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  permissionIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: "#f0f4ff",
    borderWidth: 1,
    borderColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  permissionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#17386b",
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
    marginTop: 16,
  },
  permissionBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  qrTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1a202c",
    marginTop: 4,
    textAlign: "center",
  },
  qrSubtitle: {
    fontSize: 13,
    color: "#6b7b8d",
    textAlign: "center",
    marginTop: 6,
  },
  qrSubtitleCenter: {
    fontSize: 13,
    color: "#6b7b8d",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  cancelButton: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  formContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
  },
  formHeader: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 16,
  },
  formIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e8edf3",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    shadowColor: "#17386b",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1a202c",
    textAlign: "center",
  },
  formSubtitle: {
    fontSize: 13,
    color: "#6b7b8d",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  formCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e8edf3",
    padding: 20,
    marginTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  labelHint: {
    fontSize: 11,
    color: "#94a3b8",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#f8fbff",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    color: "#1a202c",
  },
  fieldError: {
    color: "#dc3545",
    fontSize: 12,
    marginTop: 6,
    fontWeight: "500",
  },
  registerBtn: {
    flexDirection: "row",
    backgroundColor: "#17386b",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    shadowColor: "#17386b",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  registerBtnDisabled: {
    opacity: 0.6,
  },
  registerBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 0.2,
  },
  modeToggle: {
    marginTop: 14,
    alignItems: "center",
    paddingVertical: 6,
  },
  modeToggleText: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  successContainer: {
    flex: 1,
    backgroundColor: "#f8fbff",
  },
  successScroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  successCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#e8edf3",
    shadowColor: "#17386b",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 5,
    alignItems: "center",
  },
  successIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#dcfce7",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  successTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#1a202c",
    marginBottom: 6,
  },
  successSubtitle: {
    fontSize: 13,
    color: "#6b7b8d",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  deviceDetails: {
    backgroundColor: "#f8fbff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#eef2f7",
    padding: 14,
    width: "100%",
    marginBottom: 20,
  },
  detailRow: {
    marginBottom: 10,
  },
  detailLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 3,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1e293b",
  },
  detailValueMono: {
    fontSize: 11,
    fontWeight: "600",
    color: "#1e293b",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  },
  continueBtn: {
    flexDirection: "row",
    backgroundColor: "#17386b",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#17386b",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  continueBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
  brandFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
    opacity: 0.9,
  },
  brandFooterIcon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e8edf3",
    alignItems: "center",
    justifyContent: "center",
  },
  brandFooterText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
});

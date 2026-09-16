import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TextInput,
  ActivityIndicator,
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

const { width } = Dimensions.get("window");

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

  const doRegister = useCallback(async (activationToken: string, url?: string) => {
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
            const authResult = await AuthenticationService.login(privateKey, deviceId, deviceSecret);
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
          try {
            await OmsSyncService.connect(serverUrl, deviceSecret);
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
        Alert.alert("Error", result.error ?? "Registration failed.");
      }
    } catch (e: any) {
      console.error("[Register] unexpected error:", e);
      Alert.alert("Error", e?.message ?? "An unexpected error occurred during registration.");
    } finally {
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
        <View style={styles.successCard}>
          <View style={styles.successIconCircle}>
            <Ionicons name="checkmark-circle" size={64} color="#28a745" />
          </View>
          <Text style={styles.successTitle}>Device Registered</Text>
          <Text style={styles.successSubtitle}>
            This POS device is now registered and ready for use.
          </Text>

          <View style={styles.deviceDetails}>
            {device.deviceCode && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Device Code</Text>
                <Text style={styles.detailValue}>{device.deviceCode}</Text>
              </View>
            )}
            {device.publicIdentifier && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Identifier</Text>
                <Text style={styles.detailValueMono}>{device.publicIdentifier}</Text>
              </View>
            )}
            {device.branchName && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Branch</Text>
                <Text style={styles.detailValue}>{device.branchName}</Text>
              </View>
            )}
            {device.deviceName && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Name</Text>
                <Text style={styles.detailValue}>{device.deviceName}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.continueBtn}
            onPress={() => router.replace("/(auth)")}
          >
            <Text style={styles.continueBtnText}>Continue to Sign In</Text>
          </TouchableOpacity>
        </View>
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
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.formTitle}>Set Cashier PINs</Text>
            <Text style={styles.formSubtitle}>
              Assign a 6-digit PIN for each cashier to sign in
            </Text>
          </View>

          <ScrollView contentContainerStyle={styles.formContent}>
            {cashierPins.map((c) => (
              <View key={c.id} style={styles.inputGroup}>
                <Text style={styles.label}>{c.displayName}</Text>
                <TextInput
                  style={[styles.input, pinErrors[c.id] ? { borderColor: "#dc3545" } : null]}
                  placeholder="Enter 6-digit PIN"
                  placeholderTextColor="#b0b8c1"
                  value={c.pin}
                  onChangeText={(pin) => handlePinChange(c.id, pin)}
                  keyboardType="number-pad"
                  maxLength={6}
                  secureTextEntry
                />
                {pinErrors[c.id] ? (
                  <Text style={{ color: "#dc3545", fontSize: 12, marginTop: 4 }}>
                    {pinErrors[c.id]}
                  </Text>
                ) : null}
              </View>
            ))}

            <TouchableOpacity
              style={[styles.registerBtn, loading && styles.registerBtnDisabled]}
              onPress={handleSavePins}
              disabled={loading}
              activeOpacity={0.7}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.registerBtnText}>Save PINs</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modeToggle}
              onPress={() => setStep("success")}
            >
              <Text style={styles.modeToggleText}>Skip for now</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    );
  }

  if (step === "choose") {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#17386b" />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Ionicons name="phone-portrait-outline" size={48} color="#17386b" />
          </View>
          <Text style={styles.title}>Register Device</Text>
          <Text style={styles.subtitle}>
            Choose how you'd like to register this POS terminal
          </Text>

          <TouchableOpacity style={styles.option} onPress={handleQRScan} activeOpacity={0.7}>
            <View style={styles.optionIcon}>
              <Ionicons name="qr-code" size={28} color="#17386b" />
            </View>
            <View style={styles.optionInfo}>
              <Text style={styles.optionTitle}>Scan QR Code</Text>
              <Text style={styles.optionDesc}>Scan a QR code from your OMS dashboard</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#c1c9d4" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.option} onPress={() => setStep("manual")} activeOpacity={0.7}>
            <View style={styles.optionIcon}>
              <Ionicons name="keypad" size={28} color="#17386b" />
            </View>
            <View style={styles.optionInfo}>
              <Text style={styles.optionTitle}>Enter Token Manually</Text>
              <Text style={styles.optionDesc}>Type your activation token and server URL</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#c1c9d4" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (step === "qr") {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { setStep("choose"); setScanned(false); }} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#17386b" />
          </TouchableOpacity>
        </View>
        <View style={styles.qrContainer}>
          {permission?.granted ? (
            <View style={styles.cameraWrapper}>
              <CameraView
                style={styles.camera}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
              />
              {loading && (
                <View style={styles.cameraOverlay}>
                  <ActivityIndicator size="large" color="#ffffff" />
                  <Text style={styles.cameraOverlayText}>Registering...</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.permissionContainer}>
              <Ionicons name="camera-outline" size={80} color="#17386b" />
              <Text style={styles.qrTitle}>Camera Permission Needed</Text>
              <Text style={styles.qrSubtitle}>
                Allow camera access to scan QR codes
              </Text>
              <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
                <Text style={styles.permissionBtnText}>Grant Permission</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text style={styles.qrTitle}>Scan QR Code</Text>
          <Text style={styles.qrSubtitle}>
            Point your camera at the QR code displayed on your OMS dashboard
          </Text>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => { setStep("choose"); setScanned(false); }}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep("choose")} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#17386b" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.formContent}>
          <Text style={styles.formTitle}>Enter Details Manually</Text>
          <Text style={styles.formSubtitle}>
            Input the activation token and server URL provided by your administrator
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Activation Token</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter activation token"
              placeholderTextColor="#b0b8c1"
              value={token}
              onChangeText={setToken}
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Server URL</Text>
            <TextInput
              style={styles.input}
              placeholder="https://oms.example.com"
              placeholderTextColor="#b0b8c1"
              value={serverUrl}
              onChangeText={setServerUrl}
              keyboardType="url"
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity
            style={[styles.registerBtn, loading && styles.registerBtnDisabled]}
            onPress={handleManualRegister}
            disabled={loading}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.registerBtnText}>Register Device</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fbff",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f0f4ff",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#f0f4ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#17386b",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7b8d",
    textAlign: "center",
    marginBottom: 40,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#f0f4ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  optionInfo: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1a202c",
  },
  optionDesc: {
    fontSize: 12,
    color: "#6b7b8d",
    marginTop: 2,
  },
  qrContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  cameraWrapper: {
    width: 280,
    height: 280,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 20,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraOverlayText: {
    color: "#ffffff",
    fontSize: 14,
    marginTop: 8,
  },
  permissionContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  permissionBtn: {
    backgroundColor: "#17386b",
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 16,
  },
  permissionBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  qrTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#17386b",
    marginTop: 20,
  },
  qrSubtitle: {
    fontSize: 14,
    color: "#6b7b8d",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 32,
  },
  cancelButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#17386b",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#17386b",
  },
  formContent: {
    padding: 32,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#17386b",
    marginBottom: 8,
  },
  formSubtitle: {
    fontSize: 13,
    color: "#6b7b8d",
    marginBottom: 32,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4a5568",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#f7f9fc",
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    color: "#1a202c",
  },
  registerBtn: {
    backgroundColor: "#17386b",
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
  },
  registerBtnDisabled: {
    opacity: 0.6,
  },
  registerBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ffffff",
  },
  successContainer: {
    flex: 1,
    backgroundColor: "#f8fbff",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  successCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 32,
    width: "100%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
    alignItems: "center",
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#d4edda",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a202c",
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    color: "#6b7b8d",
    textAlign: "center",
    marginBottom: 24,
  },
  deviceDetails: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 16,
    width: "100%",
    marginBottom: 24,
  },
  detailRow: {
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 11,
    color: "#6b7b8d",
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1a202c",
  },
  detailValueMono: {
    fontSize: 12,
    fontWeight: "500",
    color: "#1a202c",
    fontFamily: "monospace",
  },
  continueBtn: {
    backgroundColor: "#17386b",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: "100%",
    alignItems: "center",
  },
  continueBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ffffff",
  },
});

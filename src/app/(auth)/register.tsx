import React, { useState } from "react";
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
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useDeviceStore } from "@/lib/stores/device-store";

const { width } = Dimensions.get("window");

export default function RegisterDevice() {
  const [mode, setMode] = useState<"choose" | "qr" | "manual">("choose");
  const [token, setToken] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const setDevice = useDeviceStore((s) => s.setDevice);
  const setRegistrationState = useDeviceStore((s) => s.setRegistrationState);

  const handleManualRegister = async () => {
    if (!token.trim()) {
      Alert.alert("Error", "Please enter an activation token.");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setDevice({
        deviceId: "device-" + Date.now(),
        deviceCode: "POS-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
        publicIdentifier: token,
        branchId: 1,
        branchName: "Main Branch",
        branchAddress: "123 Seafood Ave",
        deviceName: "POS Terminal 1",
        registeredAt: new Date().toISOString(),
      });
      setRegistrationState("registered");
      setLoading(false);
      Alert.alert("Success", "Device registered successfully!", [
        { text: "OK", onPress: () => router.replace("/(auth)") },
      ]);
    }, 1500);
  };

  const handleQRScan = () => {
    setMode("qr");
  };

  if (mode === "choose") {
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

          <TouchableOpacity style={styles.option} onPress={() => setMode("manual")} activeOpacity={0.7}>
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

  if (mode === "qr") {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setMode("choose")} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#17386b" />
          </TouchableOpacity>
        </View>
        <View style={styles.qrContainer}>
          <Ionicons name="camera-outline" size={80} color="#17386b" />
          <Text style={styles.qrTitle}>Scan QR Code</Text>
          <Text style={styles.qrSubtitle}>
            Point your camera at the QR code displayed on your OMS dashboard
          </Text>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setMode("choose")}
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
          <TouchableOpacity onPress={() => setMode("choose")} style={styles.backButton}>
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
            <Text style={styles.registerBtnText}>
              {loading ? "Registering..." : "Register Device"}
            </Text>
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
});

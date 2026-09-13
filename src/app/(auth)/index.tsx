import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useDeviceStore } from "@/lib/stores/device-store";

const { width } = Dimensions.get("window");
const PIN_LENGTH = 6;

export default function PINPadLogin() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const signIn = useAuthStore((s) => s.signIn);
  const device = useDeviceStore((s) => s.device);

  const handleDigit = useCallback(
    (digit: string) => {
      if (pin.length >= PIN_LENGTH) return;
      const newPin = pin + digit;
      setPin(newPin);
      setError("");
      if (newPin.length === PIN_LENGTH) {
        setLoading(true);
        setTimeout(() => {
          if (newPin === "1234") {
            signIn({
              id: "cashier-001",
              name: "Cashier",
              pin: newPin,
              role: "Cashier",
            });
            router.replace("/(pos)");
          } else {
            setError("Invalid PIN");
            setPin("");
          }
          setLoading(false);
        }, 300);
      }
    },
    [pin, signIn, router]
  );

  const handleBackspace = useCallback(() => {
    setPin((p) => p.slice(0, -1));
    setError("");
  }, []);

  const renderDot = (index: number) => {
    const filled = index < pin.length;
    return (
      <View
        key={index}
        style={[
          styles.dot,
          filled && styles.dotFilled,
          error ? styles.dotError : null,
        ]}
      >
        {filled && <View style={styles.dotInner} />}
      </View>
    );
  };

  const renderKey = (digit: string) => (
    <TouchableOpacity
      key={digit}
      style={styles.key}
      onPress={() => handleDigit(digit)}
      activeOpacity={0.6}
      disabled={loading}
    >
      <Text style={styles.keyText}>{digit}</Text>
    </TouchableOpacity>
  );

  if (device.registrationState === "unregistered") {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#17386b" />
        <View style={styles.unregisteredContainer}>
          <Ionicons name="phone-portrait-outline" size={64} color="#ffffff" />
          <Text style={styles.unregisteredTitle}>Device Not Registered</Text>
          <Text style={styles.unregisteredSubtitle}>
            Please register this device before logging in.
          </Text>
          <TouchableOpacity
            style={styles.registerButton}
            onPress={() => router.push("/(auth)/register")}
          >
            <Text style={styles.registerButtonText}>Register Device</Text>
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
        <StatusBar barStyle="light-content" backgroundColor="#17386b" />

        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Ionicons name="fish" size={48} color="#17386b" />
          </View>
          <Text style={styles.title}>NCT Seafoods</Text>
          <Text style={styles.subtitle}>POS System</Text>
        </View>

        <View style={styles.dotsRow}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => renderDot(i))}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : <View style={{ height: 20 }} />}

        <View style={styles.pad}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(renderKey)}
          <View style={styles.keySpacer} />
          {renderKey("0")}
          <TouchableOpacity
            style={styles.key}
            onPress={handleBackspace}
            activeOpacity={0.6}
            disabled={loading}
          >
            <Ionicons name="backspace-outline" size={24} color="#17386b" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.registerLink}
          onPress={() => router.push("/(auth)/register")}
        >
          <Text style={styles.registerLinkText}>Register Device</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fbff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  unregisteredContainer: {
    alignItems: "center",
    padding: 40,
  },
  unregisteredTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#ffffff",
    marginTop: 20,
  },
  unregisteredSubtitle: {
    fontSize: 14,
    color: "#a3b8d6",
    marginTop: 8,
    textAlign: "center",
  },
  registerButton: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginTop: 24,
  },
  registerButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#17386b",
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#17386b",
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7b8d",
    marginTop: 4,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 8,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#d1d9e6",
    alignItems: "center",
    justifyContent: "center",
  },
  dotFilled: {
    borderColor: "#17386b",
  },
  dotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#17386b",
  },
  dotError: {
    borderColor: "#dc3545",
  },
  errorText: {
    color: "#dc3545",
    fontSize: 13,
    marginBottom: 8,
  },
  pad: {
    width: width * 0.75,
    maxWidth: 320,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginTop: 24,
  },
  key: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  keyText: {
    fontSize: 26,
    fontWeight: "600",
    color: "#17386b",
  },
  keySpacer: {
    width: 68,
    height: 68,
  },
  registerLink: {
    marginTop: 32,
  },
  registerLinkText: {
    fontSize: 13,
    color: "#6b7b8d",
    textDecorationLine: "underline",
  },
});

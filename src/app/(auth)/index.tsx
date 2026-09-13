import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { CashierService } from "@/lib/services/cashier.service";
import { DeviceService } from "@/lib/services/device.service";

const { width } = Dimensions.get("window");
const PIN_LENGTH = 6;

type LoginMode = "pin" | "password";

export default function SignInScreen() {
  const [mode, setMode] = useState<LoginMode>("pin");
  const [pin, setPin] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
        (async () => {
          try {
            const result = await CashierService.loginPin(newPin);
            if (result.success && result.session) {
              router.replace("/(pos)");
            } else {
              setError(result.error ?? "Invalid PIN");
              setPin("");
            }
          } catch {
            setError("Login failed. Please try again.");
            setPin("");
          } finally {
            setLoading(false);
          }
        })();
      }
    },
    [pin, signIn, router]
  );

  const handleBackspace = useCallback(() => {
    setPin((p) => p.slice(0, -1));
    setError("");
  }, []);

  const handlePasswordLogin = useCallback(async () => {
    if (!username.trim() || !password.trim()) {
      setError("Please enter username and password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await CashierService.loginPassword(username.trim(), password);
      if (result.success && result.session) {
        router.replace("/(pos)");
      } else {
        setError(result.error ?? "Invalid credentials");
      }
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [username, password, router]);

  const handleReRegister = useCallback(async () => {
    await DeviceService.clearRegistration();
    router.replace("/(auth)/register");
  }, [router]);

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

        {mode === "pin" ? (
          <>
            <Text style={styles.modeTitle}>Enter PIN</Text>
            <View style={styles.dotsRow}>
              {Array.from({ length: PIN_LENGTH }).map((_, i) => renderDot(i))}
            </View>

            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : (
              <View style={{ height: 20 }} />
            )}

            {loading && (
              <ActivityIndicator size="small" color="#17386b" style={{ marginBottom: 8 }} />
            )}

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
              style={styles.modeToggle}
              onPress={() => { setMode("password"); setError(""); }}
            >
              <Text style={styles.modeToggleText}>Sign in with password instead</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.modeTitle}>Sign In</Text>

            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter username"
                placeholderTextColor="#b0b8c1"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoFocus
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter password"
                placeholderTextColor="#b0b8c1"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                onSubmitEditing={handlePasswordLogin}
              />
            </View>

            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handlePasswordLogin}
              disabled={loading}
              activeOpacity={0.7}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.loginBtnText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modeToggle}
              onPress={() => { setMode("pin"); setError(""); }}
            >
              <Text style={styles.modeToggleText}>Sign in with PIN instead</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={styles.reRegisterLink}
          onPress={handleReRegister}
        >
          <Text style={styles.reRegisterText}>Re-register device</Text>
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
    marginBottom: 32,
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
  modeTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a202c",
    marginBottom: 16,
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
  modeToggle: {
    marginTop: 20,
  },
  modeToggleText: {
    fontSize: 13,
    color: "#6b7b8d",
    textDecorationLine: "underline",
  },
  inputGroup: {
    width: "100%",
    marginBottom: 16,
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
  loginBtn: {
    width: "100%",
    backgroundColor: "#17386b",
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ffffff",
  },
  reRegisterLink: {
    marginTop: 32,
  },
  reRegisterText: {
    fontSize: 12,
    color: "#6b7b8d",
    textDecorationLine: "underline",
  },
});

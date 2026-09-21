import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  TextInput,
  ScrollView,
  useColorScheme,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { CashierService } from "@/lib/services/cashier.service";
import { DeviceService } from "@/lib/services/device.service";

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
  const dark = useColorScheme() === "dark";
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;
  const isTablet = Math.min(winW, winH) >= 600;
  const compactLandscape = isLandscape && winH < 500;

  const screenBackground = dark ? "#0f1b33" : "#f4f6f8";
  const primaryTextColor = dark ? "#ffffff" : "#17386b";
  const bodyTextColor = dark ? "#ffffff" : "#17202b";
  const secondaryTextColor = dark ? "#d7e0ec" : "#667085";
  const keyBackground = dark ? "rgba(255,255,255,0.10)" : "#ffffff";
  const keyBorder = dark ? "rgba(255,255,255,0.20)" : "#d7dee8";
  const placeholderColor = dark ? "rgba(255,255,255,0.55)" : "#98a2b3";

  // responsive keypad sizing — recomputes on rotate/resize
  const GAP = isLandscape ? 8 : isTablet ? 14 : 12;
  const PAD_MAX = isTablet ? 380 : 320;
  const PAD_H_PAD = isLandscape ? 32 : 48;
  const availablePadWidth = Math.min(winW - PAD_H_PAD * 2, PAD_MAX);
  const maxKeySize = isLandscape
    ? compactLandscape
      ? 54
      : isTablet
        ? 68
        : 62
    : isTablet
      ? 84
      : 72;
  const keySize = Math.max(48, Math.min(maxKeySize, Math.floor((availablePadWidth - GAP * 2) / 3)));
  const padWidth = keySize * 3 + GAP * 2;
  const keyRadius = keySize / 2;
  const logoSize = isLandscape
    ? compactLandscape
      ? 104
      : isTablet
        ? 260
        : 196
    : isTablet
      ? 220
      : 180;

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
          { borderColor: dark ? "rgba(255,255,255,0.40)" : "#aeb8c6" },
          filled && { borderColor: primaryTextColor },
          error ? styles.dotError : null,
        ]}
      >
        {filled && <View style={[styles.dotInner, { backgroundColor: primaryTextColor }]} />}
      </View>
    );
  };

  const renderKey = (digit: string) => (
    <TouchableOpacity
      key={digit}
      style={[
        styles.key,
        {
          width: keySize,
          height: keySize,
          borderRadius: keyRadius,
          backgroundColor: keyBackground,
          borderColor: keyBorder,
          shadowColor: primaryTextColor,
        },
      ]}
      onPress={() => handleDigit(digit)}
      activeOpacity={0.6}
      disabled={loading}
    >
      <Text style={[styles.keyText, isTablet && styles.keyTextTablet, { color: primaryTextColor }]}>{digit}</Text>
    </TouchableOpacity>
  );

  if (device.registrationState === "unregistered") {
    return (
      <View style={styles.unregisteredBg}>
        <StatusBar barStyle="light-content" backgroundColor="#17386b" />
        <View style={styles.unregBrand}>
          <View style={styles.unregBrandIcon}>
            <Ionicons name="fish" size={16} color="#ffffff" />
          </View>
          <Text style={styles.unregBrandText}>NCT Seafoods</Text>
        </View>
        <View style={styles.unregisteredContainer}>
          <View style={styles.unregisteredIconWrap}>
            <Ionicons name="phone-portrait-outline" size={48} color="#17386b" />
            <View style={styles.unregDisconnectBadge}>
              <Ionicons name="close" size={12} color="#ffffff" />
            </View>
          </View>
          <Text style={styles.unregisteredTitle}>Device Not Registered</Text>
          <Text style={styles.unregisteredSubtitle}>
            This terminal hasn't been provisioned yet. Register it to start using POS.
          </Text>
          <TouchableOpacity
            style={styles.registerButton}
            onPress={() => router.push("/(auth)/register")}
            activeOpacity={0.85}
          >
            <Ionicons name="qr-code" size={16} color="#17386b" style={{ marginRight: 8 }} />
            <Text style={styles.registerButtonText}>Register Device</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: screenBackground }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar
        barStyle={dark ? "light-content" : "dark-content"}
        backgroundColor={screenBackground}
      />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isLandscape && styles.scrollContentLandscape,
          isTablet && styles.scrollContentTablet,
          { backgroundColor: screenBackground },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={[styles.loginContent, isLandscape && styles.loginContentLandscape]}>
          <View
            style={[
              styles.header,
              isLandscape && styles.headerLandscape,
              isTablet && !isLandscape && styles.headerTablet,
              isLandscape && { width: Math.min(290, winW * 0.30) },
            ]}
          >
            <Image
              source={require("../../../assets/nct-seafoods-logo.png")}
              style={{ width: logoSize, height: logoSize }}
              resizeMode="contain"
              accessibilityLabel="NCT Seafoods"
            />
            <Text style={[styles.landscapeBrandTitle, !isLandscape && styles.portraitBrandTitle, { color: primaryTextColor }]}>NCT Seafoods</Text>
            <Text style={[styles.landscapeBrandSubtitle, !isLandscape && styles.portraitBrandSubtitle, { color: secondaryTextColor }]}>Point of Sale System</Text>
          </View>

        {mode === "pin" ? (
          <View style={[styles.pinBlock, isLandscape && { width: Math.min(380, winW * 0.42) }]}>
            <Text
              style={[
                styles.modeTitle,
                isLandscape && styles.modeTitleLandscape,
                { color: bodyTextColor },
              ]}
            >
              Enter PIN
            </Text>
            <View style={[styles.dotsRow, isLandscape && styles.dotsRowLandscape]}>
              {Array.from({ length: PIN_LENGTH }).map((_, i) => renderDot(i))}
            </View>

            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : (
              <View style={{ height: 20 }} />
            )}

            {loading && (
              <ActivityIndicator size="small" color={primaryTextColor} style={{ marginBottom: 8 }} />
            )}

            <View
              style={[
                styles.pad,
                isLandscape && styles.padLandscape,
                { width: padWidth, gap: GAP },
              ]}
            >
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(renderKey)}
            </View>
            <View
              style={[
                styles.padBottomRow,
                isLandscape && styles.padBottomRowLandscape,
                { width: padWidth, gap: GAP },
              ]}
            >
              <View style={{ width: keySize, height: keySize }} />
              {renderKey("0")}
              <TouchableOpacity
                style={[
                  styles.key,
                  {
                    width: keySize,
                    height: keySize,
                    borderRadius: keyRadius,
                    backgroundColor: keyBackground,
                    borderColor: keyBorder,
                    shadowColor: primaryTextColor,
                  },
                ]}
                onPress={handleBackspace}
                activeOpacity={0.6}
                disabled={loading}
              >
                <Ionicons name="backspace-outline" size={isTablet ? 26 : 22} color={primaryTextColor} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.modeToggle, isLandscape && styles.modeToggleLandscape]}
              onPress={() => { setMode("password"); setError(""); }}
            >
              <Text style={[styles.modeToggleText, { color: secondaryTextColor }]}>Sign in with password instead</Text>
            </TouchableOpacity>

            {isLandscape && (
              <TouchableOpacity
                style={styles.landscapeReRegisterLink}
                onPress={handleReRegister}
              >
                <Text style={[styles.reRegisterText, { color: secondaryTextColor }]}>Re-register device</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View
            style={[
              styles.passwordBlock,
              isTablet && !isLandscape && { maxWidth: 420 },
              isLandscape && { width: Math.min(360, winW * 0.52) },
            ]}
          >
            <Text style={[styles.modeTitle, { color: bodyTextColor }]}>Sign In</Text>

            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: bodyTextColor }]}>Username</Text>
              <TextInput
                style={[styles.input, { backgroundColor: keyBackground, borderColor: keyBorder, color: bodyTextColor }]}
                placeholder="Enter username"
                placeholderTextColor={placeholderColor}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoFocus
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: bodyTextColor }]}>Password</Text>
              <TextInput
                style={[styles.input, { backgroundColor: keyBackground, borderColor: keyBorder, color: bodyTextColor }]}
                placeholder="Enter password"
                placeholderTextColor={placeholderColor}
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
              <Text style={[styles.modeToggleText, { color: secondaryTextColor }]}>Sign in with PIN instead</Text>
            </TouchableOpacity>

            {isLandscape && (
              <TouchableOpacity
                style={styles.landscapeReRegisterLink}
                onPress={handleReRegister}
              >
                <Text style={[styles.reRegisterText, { color: secondaryTextColor }]}>Re-register device</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        </View>

        {!isLandscape && (
          <TouchableOpacity
            style={styles.reRegisterLink}
            onPress={handleReRegister}
          >
            <Text style={[styles.reRegisterText, { color: secondaryTextColor }]}>Re-register device</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 24,
    backgroundColor: "#f8fbff",
  },
  scrollContentLandscape: {
    paddingVertical: 12,
  },
  scrollContentTablet: {
    paddingHorizontal: 32,
  },
  unregisteredBg: {
    flex: 1,
    backgroundColor: "#17386b",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  unregBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  unregBrandIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  unregBrandText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  unregisteredContainer: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingVertical: 32,
    width: "100%",
    maxWidth: 380,
    borderWidth: 1,
    borderColor: "#e8edf3",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  unregisteredIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: "#f0f4ff",
    borderWidth: 1,
    borderColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    position: "relative",
  },
  unregDisconnectBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#dc3545",
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  unregisteredTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1a202c",
    textAlign: "center",
  },
  unregisteredSubtitle: {
    fontSize: 13,
    color: "#6b7b8d",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 18,
  },
  registerButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#17386b",
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
    marginTop: 20,
  },
  registerButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#17386b",
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  headerLandscape: {
    marginBottom: 0,
  },
  headerTablet: {
    marginBottom: 28,
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e8edf3",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#17386b",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  logoCircleTablet: {
    width: 104,
    height: 104,
    borderRadius: 26,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#17386b",
    marginTop: 14,
    letterSpacing: -0.3,
  },
  titleTablet: {
    fontSize: 26,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7b8d",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginTop: 4,
  },
  pinBlock: {
    alignItems: "center",
    width: "100%",
  },
  passwordBlock: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
  },
  modeTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1a202c",
    marginBottom: 14,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 12,
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
    fontWeight: "500",
    textAlign: "center",
    marginBottom: 4,
  },
  pad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 16,
  },
  loginContent: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    flexDirection: "column",
    justifyContent: "center",
  },
  loginContentLandscape: {
    maxWidth: 800,
    flexDirection: "row",
    gap: 72,
  },
  landscapeBrandTitle: {
    color: "#ffffff",
    fontSize: 32,
    fontWeight: "800",
    marginTop: 20,
    textAlign: "center",
  },
  landscapeBrandSubtitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 6,
    textAlign: "center",
  },
  portraitBrandTitle: {
    fontSize: 28,
    marginTop: 16,
  },
  portraitBrandSubtitle: {
    fontSize: 16,
    marginTop: 4,
  },
  modeTitleLandscape: {
    fontSize: 20,
    marginBottom: 8,
  },
  dotsRowLandscape: {
    marginBottom: 4,
  },
  padLandscape: {
    marginTop: 8,
  },
  padBottomRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 12,
  },
  padBottomRowLandscape: {
    marginTop: 8,
  },
  key: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e8edf3",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#17386b",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  keyText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#17386b",
  },
  keyTextTablet: {
    fontSize: 28,
  },
  modeToggle: {
    marginTop: 18,
    paddingVertical: 4,
  },
  modeToggleLandscape: {
    marginTop: 10,
  },
  modeToggleText: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "500",
    textDecorationLine: "underline",
  },
  inputGroup: {
    width: "100%",
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 14,
    color: "#1a202c",
  },
  loginBtn: {
    width: "100%",
    backgroundColor: "#17386b",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#17386b",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
  reRegisterLink: {
    marginTop: 24,
    paddingVertical: 8,
  },
  landscapeReRegisterLink: {
    marginTop: 10,
    paddingVertical: 4,
  },
  reRegisterText: {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "500",
    textDecorationLine: "underline",
  },
});

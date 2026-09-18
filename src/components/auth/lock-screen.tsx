import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { CashierService } from "@/lib/services/cashier.service";

const PIN_LENGTH = 6;

interface LockScreenProps {
  onUnlock?: () => void;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const session = useCashierStore((s) => s.session);
  const unlock = useCashierStore((s) => s.unlock);
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;
  const isTablet = Math.min(winW, winH) >= 600;
  const GAP = isTablet ? 14 : 12;
  const PAD_MAX = isTablet ? 360 : 300;
  const padWidth = Math.min(winW - 40 * 2, PAD_MAX);
  const keySize = Math.max(56, Math.min(isTablet ? 80 : 68, Math.floor((padWidth - GAP * 2) / 3)));

  const handleDigit = useCallback(
    (digit: string) => {
      if (pin.length >= PIN_LENGTH) return;
      const newPin = pin + digit;
      setPin(newPin);
      setError(false);
      if (newPin.length === PIN_LENGTH) {
        setLoading(true);
        (async () => {
          try {
            const result = await CashierService.loginPin(newPin);
            if (result.success && result.session) {
              if (session && result.session.cashierId === session.cashierId) {
                await CashierService.unlock(session.sessionId);
                onUnlock?.();
              } else {
                setError(true);
                setTimeout(() => {
                  setPin("");
                  setError(false);
                }, 800);
              }
            } else {
              setError(true);
              setTimeout(() => {
                setPin("");
                setError(false);
              }, 800);
            }
          } catch {
            setError(true);
            setTimeout(() => {
              setPin("");
              setError(false);
            }, 800);
          } finally {
            setLoading(false);
          }
        })();
      }
    },
    [pin, unlock, onUnlock, session]
  );

  const handleBackspace = useCallback(() => {
    setPin((p) => p.slice(0, -1));
    setError(false);
  }, []);

  const renderDot = (index: number) => {
    const filled = index < pin.length;
    return (
      <View
        key={index}
        style={[
          styles.dot,
          filled && styles.dotFilled,
          error && styles.dotError,
        ]}
      />
    );
  };

  const renderKey = (digit: string) => (
    <TouchableOpacity
      key={digit}
      style={[styles.key, { width: keySize, height: keySize, borderRadius: keySize / 2 }]}
      onPress={() => handleDigit(digit)}
      activeOpacity={0.6}
      disabled={loading}
    >
      <Text style={[styles.keyText, isTablet && { fontSize: 26 }]}>{digit}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#17386b" />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          isLandscape && { paddingVertical: 16 },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={[styles.header, isLandscape && { marginBottom: 12 }]}>
          <Ionicons name="fish" size={isTablet ? 56 : 48} color="#ffffff" />
          <Text style={[styles.title, isTablet && { fontSize: 24 }]}>NCT Seafoods POS System</Text>
          <Text style={styles.subtitle}>Enter PIN to unlock</Text>
        </View>

        <View style={styles.cashierInfo}>
          <Ionicons name="person-circle" size={20} color="#ffffff" />
          <Text style={styles.cashierName}>{session?.cashierName ?? "Cashier"}</Text>
        </View>

        <View style={styles.dotsRow}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => renderDot(i))}
        </View>

        {error && <Text style={styles.errorText}>Incorrect PIN. Try again.</Text>}

        {loading && (
          <ActivityIndicator size="small" color="#ffffff" style={{ marginBottom: 8 }} />
        )}

        <View style={[styles.pad, { width: padWidth, gap: GAP }]}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(renderKey)}
          <View style={{ width: keySize, height: keySize }} />
          {renderKey("0")}
          <TouchableOpacity style={[styles.key, { width: keySize, height: keySize, borderRadius: keySize / 2 }]} onPress={handleBackspace} activeOpacity={0.6} disabled={loading}>
            <Ionicons name="backspace-outline" size={isTablet ? 26 : 22} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#17386b",
  },
  scroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#ffffff",
    marginTop: 12,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 13,
    color: "#a3b8d6",
    marginTop: 6,
    fontWeight: "500",
  },
  cashierInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  cashierName: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 10,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
  },
  dotFilled: {
    backgroundColor: "#ffffff",
    borderColor: "#ffffff",
  },
  dotError: {
    borderColor: "#ff6b6b",
    backgroundColor: "#ff6b6b",
  },
  errorText: {
    color: "#ff6b6b",
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 6,
  },
  pad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 16,
  },
  key: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  keyText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#ffffff",
  },
});

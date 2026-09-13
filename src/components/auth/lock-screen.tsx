import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { CashierService } from "@/lib/services/cashier.service";

const { width } = Dimensions.get("window");
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
      style={styles.key}
      onPress={() => handleDigit(digit)}
      activeOpacity={0.6}
      disabled={loading}
    >
      <Text style={styles.keyText}>{digit}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#17386b" />
      <View style={styles.header}>
        <Ionicons name="fish" size={64} color="#ffffff" />
        <Text style={styles.title}>NCT Seafoods POS System</Text>
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

      <View style={styles.pad}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(renderKey)}
        <View style={styles.keySpacer} />
        {renderKey("0")}
        <TouchableOpacity style={styles.key} onPress={handleBackspace} activeOpacity={0.6} disabled={loading}>
          <Ionicons name="backspace-outline" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#17386b",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#ffffff",
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: "#a3b8d6",
    marginTop: 8,
  },
  cashierInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 32,
  },
  cashierName: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 8,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 12,
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
    marginBottom: 8,
  },
  pad: {
    width: width * 0.7,
    maxWidth: 300,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginTop: 24,
  },
  key: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  keyText: {
    fontSize: 24,
    fontWeight: "600",
    color: "#ffffff",
  },
  keySpacer: {
    width: 64,
    height: 64,
  },
});

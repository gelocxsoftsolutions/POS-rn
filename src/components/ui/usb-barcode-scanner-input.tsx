import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  onScan: (barcode: string) => void | Promise<void>;
  disabled?: boolean;
  dark?: boolean;
  compact?: boolean;
};

const SCAN_SETTLE_MS = 100;

export function UsbBarcodeScannerInput({ onScan, disabled = false, dark = false, compact = false }: Props) {
  const inputRef = useRef<TextInput>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScanRef = useRef({ value: "", at: 0 });
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);

  const focusScanner = useCallback(() => {
    if (disabled) return;
    inputRef.current?.focus();
  }, [disabled]);

  const submitScan = useCallback((candidate: string) => {
    const barcode = candidate.replace(/[\r\n\t]/g, "").trim();
    setValue("");
    if (!barcode || disabled) return;

    const now = Date.now();
    if (lastScanRef.current.value === barcode && now - lastScanRef.current.at < 500) return;
    lastScanRef.current = { value: barcode, at: now };
    void onScan(barcode);
  }, [disabled, onScan]);

  const handleChangeText = useCallback((nextValue: string) => {
    const hasTerminator = /[\r\n\t]/.test(nextValue);
    const cleanValue = nextValue.replace(/[\r\n\t]/g, "");
    setValue(cleanValue);

    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    if (hasTerminator) {
      submitScan(cleanValue);
      return;
    }

    if (cleanValue) {
      settleTimerRef.current = setTimeout(() => submitScan(cleanValue), SCAN_SETTLE_MS);
    }
  }, [submitScan]);

  useEffect(() => {
    if (disabled) {
      inputRef.current?.blur();
      setValue("");
      return;
    }
    const timer = setTimeout(focusScanner, 120);
    return () => clearTimeout(timer);
  }, [disabled, focusScanner]);

  useEffect(() => () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
  }, []);

  return (
    <View style={styles.wrapper}>
      <TextInput
        ref={inputRef}
        style={styles.captureInput}
        value={value}
        onChangeText={handleChangeText}
        onSubmitEditing={({ nativeEvent }) => submitScan(nativeEvent.text || value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        showSoftInputOnFocus={false}
        autoCorrect={false}
        autoCapitalize="none"
        caretHidden
        contextMenuHidden
        accessibilityLabel="USB barcode scanner input"
      />
      <TouchableOpacity
        style={[
          styles.statusButton,
          compact && styles.statusButtonCompact,
          { backgroundColor: dark ? "#141922" : "#ffffff", borderColor: dark ? "#334155" : "#dbe3ec" },
          focused && !disabled && styles.statusButtonReady,
          disabled && styles.statusButtonDisabled,
        ]}
        onPress={focusScanner}
        disabled={disabled}
        accessibilityLabel={focused ? "USB barcode scanner ready" : "Activate USB barcode scanner"}
      >
        <Ionicons name="barcode-outline" size={compact ? 17 : 20} color={focused && !disabled ? "#ffffff" : dark ? "#94a3b8" : "#64748b"} />
        <Text style={[styles.statusText, compact && styles.statusTextCompact, { color: focused && !disabled ? "#ffffff" : dark ? "#cbd5e1" : "#475569" }]}>
          {disabled ? "Paused" : focused ? "USB Ready" : "Enable USB"}
        </Text>
        <View style={[styles.statusDot, focused && !disabled ? styles.statusDotReady : styles.statusDotIdle]} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
  },
  captureInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0.01,
    left: 0,
    bottom: 0,
  },
  statusButton: {
    height: 46,
    minWidth: 116,
    paddingHorizontal: 11,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  statusButtonReady: {
    backgroundColor: "#17386b",
    borderColor: "#17386b",
  },
  statusButtonCompact: {
    height: 36,
    minWidth: 100,
    paddingHorizontal: 9,
  },
  statusButtonDisabled: {
    opacity: 0.55,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  statusTextCompact: {
    fontSize: 10,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotReady: {
    backgroundColor: "#34d058",
  },
  statusDotIdle: {
    backgroundColor: "#94a3b8",
  },
});

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { normalizeScannedCode } from "@/lib/barcodes/normalize-scanned-code";
import { usePosTheme } from "@/lib/stores/ui-store";

type Props = {
  visible: boolean;
  dark: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void | Promise<void>;
};

export function BarcodeScannerModal({ visible, dark, onClose, onScan }: Props) {
  const theme = usePosTheme();
  const { width, height } = useWindowDimensions();
  const cameraWidth = Math.max(
    240,
    Math.min(680, width - 64, Math.max(240, height - 260) * 1.9),
  );
  const cameraHeight = cameraWidth / 1.9;
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const scanLockRef = useRef(false);

  useEffect(() => {
    if (visible) {
      scanLockRef.current = false;
      setScanning(false);
    }
  }, [visible]);

  const handlePermission = useCallback(async () => {
    const result = await requestPermission();
    if (!result.granted && !result.canAskAgain) {
      Alert.alert(
        "Camera Permission Required",
        "Enable camera access in Settings to scan product barcodes.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ]
      );
    }
  }, [requestPermission]);

  const handleScan = useCallback(async (barcode: string) => {
    if (scanLockRef.current) return;
    const normalized = normalizeScannedCode(barcode);
    if (!normalized) return;
    scanLockRef.current = true;
    setScanning(true);
    try {
      await onScan(normalized);
    } finally {
      scanLockRef.current = false;
      setScanning(false);
    }
  }, [onScan]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.backButton, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
            accessibilityLabel="Close barcode scanner"
          >
            <Ionicons name="arrow-back" size={20} color={theme.accent} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Scan Barcode</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.content}>
          {permission?.granted ? (
            <View
              style={[
                styles.cameraCard,
                {
                  width: cameraWidth,
                  height: cameraHeight,
                  borderColor: theme.border,
                },
              ]}
            >
              <CameraView
                key={visible ? "barcode-camera-mounted" : "barcode-camera-unmounted"}
                style={StyleSheet.absoluteFill}
                barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "code128", "code39", "code93", "itf14", "codabar", "upc_a", "upc_e"] }}
                onBarcodeScanned={scanning ? undefined : ({ data }: { data: string }) => handleScan(data)}
                onMountError={(event) => console.warn("[Camera] barcode mount error", event)}
              />
              <View style={[styles.corner, styles.cornerTopLeft]} />
              <View style={[styles.corner, styles.cornerTopRight]} />
              <View style={[styles.corner, styles.cornerBottomLeft]} />
              <View style={[styles.corner, styles.cornerBottomRight]} />
              <View style={styles.scanLine} />
            </View>
          ) : (
            <View style={[styles.permissionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name="camera-outline" size={48} color={theme.accent} />
              <Text style={[styles.title, { color: theme.text }]}>Camera permission needed</Text>
              <Text style={[styles.subtitle, { color: theme.muted }]}>Allow camera access to scan product barcodes.</Text>
              <TouchableOpacity style={[styles.permissionButton, { backgroundColor: theme.primary }]} onPress={handlePermission}>
                <Ionicons name="camera" size={17} color={theme.onPrimary} />
                <Text style={[styles.permissionButtonText, { color: theme.onPrimary }]}>Grant Permission</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={[styles.title, { color: theme.text }]}>Scan product barcode</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>Center the barcode inside the guide.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },
  headerSpacer: { width: 40 },
  content: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  cameraCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 22,
  },
  corner: { position: "absolute", width: 38, height: 38, borderColor: "#ffffff" },
  cornerTopLeft: { top: 28, left: 28, borderTopWidth: 4, borderLeftWidth: 4 },
  cornerTopRight: { top: 28, right: 28, borderTopWidth: 4, borderRightWidth: 4 },
  cornerBottomLeft: { bottom: 28, left: 28, borderBottomWidth: 4, borderLeftWidth: 4 },
  cornerBottomRight: { bottom: 28, right: 28, borderBottomWidth: 4, borderRightWidth: 4 },
  scanLine: { position: "absolute", left: 40, right: 40, top: "50%", height: 2, backgroundColor: "#ef4444" },
  permissionCard: {
    width: "100%",
    maxWidth: 520,
    padding: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    marginBottom: 22,
  },
  title: { fontSize: 18, fontWeight: "700", marginTop: 12, textAlign: "center" },
  subtitle: { fontSize: 13, marginTop: 6, textAlign: "center" },
  permissionButton: {
    height: 46,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: "#17386b",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
  },
  permissionButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
});

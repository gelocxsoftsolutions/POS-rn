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
  title?: string;
  subtitle?: string;
  description?: string;
  hintText?: string;
};

export function ReceiptQrScannerModal({
  visible,
  dark,
  onClose,
  onScan,
  title = "Scan Receipt Code",
  subtitle = "Scan receipt barcode or QR",
  description = "Point the camera at either code to find the receipt instantly.",
  hintText = "The barcode and QR are at the bottom of each receipt",
}: Props) {
  const theme = usePosTheme();
  const { width, height } = useWindowDimensions();
  const cameraSize = Math.max(160, Math.min(360, width - 48, height - 220));
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
        "Enable camera access in Settings to scan receipt QR codes.",
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
            style={[styles.closeButton, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
            accessibilityLabel="Close receipt scanner"
          >
            <Ionicons name="close" size={20} color={theme.accent} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Ionicons name="scan" size={18} color={theme.accent} />
            <Text style={[styles.headerTitle, { color: theme.text }]}>{title}</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.content}>
          {permission?.granted ? (
            <View
              style={[
                styles.cameraCard,
                {
                  width: cameraSize,
                  height: cameraSize,
                  borderColor: theme.border,
                  shadowColor: theme.navigation,
                },
              ]}
            >
              <CameraView
                key={visible ? "receipt-qr-mounted" : "receipt-qr-unmounted"}
                style={StyleSheet.absoluteFill}
                barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "code39", "code93"] }}
                onBarcodeScanned={scanning ? undefined : ({ data }: { data: string }) => handleScan(data)}
                onMountError={(event) => console.warn("[Camera] receipt qr mount error", event)}
              />
              {/* Square corners - teal accent for QR */}
              <View style={[styles.corner, styles.cornerTopLeft, { borderColor: theme.accent }]} />
              <View style={[styles.corner, styles.cornerTopRight, { borderColor: theme.accent }]} />
              <View style={[styles.corner, styles.cornerBottomLeft, { borderColor: theme.accent }]} />
              <View style={[styles.corner, styles.cornerBottomRight, { borderColor: theme.accent }]} />
            </View>
          ) : (
            <View style={[styles.permissionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.permissionIconWrap, { backgroundColor: theme.surfaceAlt }]}>
                <Ionicons name="qr-code-outline" size={48} color={theme.accent} />
              </View>
              <Text style={[styles.title, { color: theme.text }]}>{subtitle}</Text>
              <Text style={[styles.subtitle, { color: theme.muted }]}>{description}</Text>
              <TouchableOpacity style={[styles.permissionButton, { backgroundColor: theme.primary }]} onPress={handlePermission}>
                <Ionicons name="camera" size={17} color={theme.onPrimary} />
                <Text style={[styles.permissionButtonText, { color: theme.onPrimary }]}>Allow Camera</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.hintBox}>
            <Ionicons name="information-circle-outline" size={16} color={theme.accent} />
            <Text style={[styles.hintText, { color: theme.muted }]}>{hintText}</Text>
          </View>
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
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  headerSpacer: { width: 38 },
  content: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  cameraCard: {
    borderRadius: 16,
    borderWidth: 2,
    overflow: "hidden",
    marginBottom: 20,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  corner: { position: "absolute", width: 32, height: 32, borderWidth: 4, borderRadius: 4 },
  cornerTopLeft: { top: 16, left: 16, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 12 },
  cornerTopRight: { top: 16, right: 16, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 12 },
  cornerBottomLeft: { bottom: 16, left: 16, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 12 },
  cornerBottomRight: { bottom: 16, right: 16, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 12 },
  permissionCard: {
    width: "100%",
    maxWidth: 360,
    padding: 28,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    marginBottom: 20,
  },
  permissionIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: { fontSize: 17, fontWeight: "700", marginTop: 8, textAlign: "center" },
  subtitle: { fontSize: 13, marginTop: 6, textAlign: "center", lineHeight: 18 },
  hintBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(20,184,166,0.08)",
  },
  hintText: { fontSize: 11, fontWeight: "500" },
  permissionButton: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: "#0d9488",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 18,
  },
  permissionButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
});

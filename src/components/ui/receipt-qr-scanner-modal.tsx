import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";

type Props = {
  visible: boolean;
  dark: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void | Promise<void>;
};

export function ReceiptQrScannerModal({ visible, dark, onClose, onScan }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (visible) setScanning(false);
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
    if (scanning) return;
    setScanning(true);
    try {
      await onScan(barcode);
    } finally {
      setScanning(false);
    }
  }, [onScan, scanning]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: dark ? "#0a0f1e" : "#f0f4ff" }]}>
        <View style={[styles.header, { backgroundColor: dark ? "#0f1729" : "#ffffff", borderBottomColor: dark ? "#1e293b" : "#c7d2fe" }]}>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeButton, { backgroundColor: dark ? "#1e293b" : "#fff", borderColor: dark ? "#334155" : "#e0e7ff" }]}
            accessibilityLabel="Close receipt scanner"
          >
            <Ionicons name="close" size={20} color={dark ? "#f8fafc" : "#17386b"} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Ionicons name="qr-code" size={18} color={dark ? "#60a5fa" : "#17386b"} />
            <Text style={[styles.headerTitle, { color: dark ? "#f8fafc" : "#1a202c" }]}>Scan Receipt QR</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.content}>
          {permission?.granted ? (
            <View style={[styles.cameraCard, { borderColor: dark ? "#334155" : "#c7d2fe", shadowColor: dark ? "#000" : "#17386b" }]}>
              <CameraView
                key={visible ? "receipt-qr-mounted" : "receipt-qr-unmounted"}
                style={StyleSheet.absoluteFill}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={scanning ? undefined : ({ data }: { data: string }) => handleScan(data)}
                onMountError={(event) => console.warn("[Camera] receipt qr mount error", event)}
              />
              {/* Square corners - teal accent for QR */}
              <View style={[styles.corner, styles.cornerTopLeft, { borderColor: "#14b8a6" }]} />
              <View style={[styles.corner, styles.cornerTopRight, { borderColor: "#14b8a6" }]} />
              <View style={[styles.corner, styles.cornerBottomLeft, { borderColor: "#14b8a6" }]} />
              <View style={[styles.corner, styles.cornerBottomRight, { borderColor: "#14b8a6" }]} />
              <View style={styles.centerBox} />
              <View style={styles.scanLineVertical} />
              <View style={styles.scanLineHorizontal} />
            </View>
          ) : (
            <View style={[styles.permissionCard, { backgroundColor: dark ? "#0f1729" : "#ffffff", borderColor: dark ? "#1e293b" : "#c7d2fe" }]}>
              <View style={[styles.permissionIconWrap, { backgroundColor: dark ? "#1e293b" : "#eef2ff" }]}>
                <Ionicons name="qr-code-outline" size={48} color={dark ? "#5eead4" : "#0d9488"} />
              </View>
              <Text style={[styles.title, { color: dark ? "#f8fafc" : "#1a202c" }]}>Scan receipt QR code</Text>
              <Text style={[styles.subtitle, { color: dark ? "#94a3b8" : "#6b7b8d" }]}>Point camera at the receipt QR to find it instantly.</Text>
              <TouchableOpacity style={styles.permissionButton} onPress={handlePermission}>
                <Ionicons name="camera" size={17} color="#ffffff" />
                <Text style={styles.permissionButtonText}>Allow Camera</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.hintBox}>
            <Ionicons name="information-circle-outline" size={16} color={dark ? "#5eead4" : "#0d9488"} />
            <Text style={[styles.hintText, { color: dark ? "#94a3b8" : "#475569" }]}>Receipt QR is at the bottom of each receipt</Text>
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
    width: "100%",
    maxWidth: 360,
    aspectRatio: 1,
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
  centerBox: {
    position: "absolute",
    top: "22%",
    left: "22%",
    right: "22%",
    bottom: "22%",
    borderWidth: 1,
    borderColor: "rgba(20,184,166,0.35)",
    borderRadius: 8,
    borderStyle: "dashed",
  },
  scanLineVertical: { position: "absolute", left: "50%", top: 24, bottom: 24, width: 1, backgroundColor: "rgba(20,184,166,0.6)" },
  scanLineHorizontal: { position: "absolute", top: "50%", left: 24, right: 24, height: 1, backgroundColor: "rgba(20,184,166,0.6)" },
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

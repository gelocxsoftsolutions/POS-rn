import React, { useCallback, useEffect, useState } from "react";
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

type Props = {
  visible: boolean;
  dark: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void | Promise<void>;
};

export function BarcodeScannerModal({ visible, dark, onClose, onScan }: Props) {
  const { width, height } = useWindowDimensions();
  const cameraWidth = Math.max(
    240,
    Math.min(680, width - 64, Math.max(240, height - 260) * 1.9),
  );
  const cameraHeight = cameraWidth / 1.9;
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
        "Enable camera access in Settings to scan product barcodes.",
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
      <View style={[styles.container, { backgroundColor: dark ? "#0b0f16" : "#f8fbff" }]}>
        <View style={[styles.header, { backgroundColor: dark ? "#141922" : "#ffffff", borderBottomColor: dark ? "#28303d" : "#e8edf3" }]}>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.backButton, { backgroundColor: dark ? "#202938" : "#f0f4ff", borderColor: dark ? "#38465a" : "#e0e7ff" }]}
            accessibilityLabel="Close barcode scanner"
          >
            <Ionicons name="arrow-back" size={20} color={dark ? "#f8fafc" : "#17386b"} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: dark ? "#f8fafc" : "#1a202c" }]}>Scan Barcode</Text>
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
                  borderColor: dark ? "#28303d" : "#e8edf3",
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
            <View style={[styles.permissionCard, { backgroundColor: dark ? "#141922" : "#ffffff", borderColor: dark ? "#28303d" : "#e8edf3" }]}>
              <Ionicons name="camera-outline" size={48} color={dark ? "#8fb4e8" : "#17386b"} />
              <Text style={[styles.title, { color: dark ? "#f8fafc" : "#1a202c" }]}>Camera permission needed</Text>
              <Text style={[styles.subtitle, { color: dark ? "#94a3b8" : "#6b7b8d" }]}>Allow camera access to scan product barcodes.</Text>
              <TouchableOpacity style={styles.permissionButton} onPress={handlePermission}>
                <Ionicons name="camera" size={17} color="#ffffff" />
                <Text style={styles.permissionButtonText}>Grant Permission</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={[styles.title, { color: dark ? "#f8fafc" : "#1a202c" }]}>Scan product barcode</Text>
          <Text style={[styles.subtitle, { color: dark ? "#94a3b8" : "#6b7b8d" }]}>Center the barcode inside the guide.</Text>
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

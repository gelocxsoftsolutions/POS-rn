import React, { useRef, useState } from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { decodeQrFromBase64 } from "@/lib/qr/decode-image-qr";
import { usePosTheme } from "@/lib/stores/ui-store";

export function UploadQrImageButton({ onScan, disabled = false, style }: {
  onScan: (data: string) => void | Promise<void>;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = usePosTheme();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const upload = async () => {
    if (locked.current || disabled) return;
    locked.current = true;
    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1, base64: true });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.base64) throw new Error("The selected image could not be read. Try a PNG or JPEG screenshot.");
      const data = decodeQrFromBase64(asset.base64, asset.mimeType);
      if (!data) throw new Error("No QR code could be read. Choose a clear PNG or JPEG image showing the whole QR code.");
      await onScan(data);
    } catch (error) {
      Alert.alert("QR image", error instanceof Error ? error.message : "Unable to read the QR image.");
    } finally { locked.current = false; setBusy(false); }
  };
  return <View style={style}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Upload QR image" accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={() => void upload()} style={{ minHeight: 46, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: theme.primary, opacity: disabled || busy ? 0.6 : 1, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }}>
    {busy ? <ActivityIndicator size="small" color={theme.onPrimary} /> : <Ionicons name="image-outline" size={18} color={theme.onPrimary} />}
    <Text style={{ color: theme.onPrimary, fontWeight: "700" }}>{busy ? "Reading QR image..." : "Upload QR image"}</Text>
  </TouchableOpacity></View>;
}

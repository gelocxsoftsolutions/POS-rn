import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { usePosTheme } from "@/lib/stores/ui-store";

export interface CapturedMedia {
  dataUri: string;
  kind: "photo" | "video";
}

export function MediaCaptureModal({
  visible,
  allowVideo = false,
  title,
  onClose,
  onUse,
}: {
  visible: boolean;
  allowVideo?: boolean;
  title: string;
  onClose: () => void;
  onUse: (media: CapturedMedia) => void;
}) {
  const theme = usePosTheme();
  const camera = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [captureMode, setCaptureMode] = useState<"photo" | "video">("photo");
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [captured, setCaptured] = useState<CapturedMedia | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCaptured(null);
    setCaptureMode("photo");
    setRecording(false);
    if (!cameraPermission?.granted) void requestCameraPermission();
  }, [visible]); // permission objects intentionally excluded to avoid repeated prompts

  const selectVideo = async () => {
    if (!allowVideo) return;
    const granted = microphonePermission?.granted || (await requestMicrophonePermission()).granted;
    if (!granted) return Alert.alert("Microphone required", "Video proof requires microphone permission.");
    setCaptureMode("video");
  };

  const takePhoto = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.7, base64: true });
      if (!photo?.base64) throw new Error("The photo could not be read.");
      setCaptured({ kind: "photo", dataUri: `data:image/jpeg;base64,${photo.base64}` });
    } catch (error: any) { Alert.alert("Camera", error?.message ?? "Unable to take photo."); }
    finally { setBusy(false); }
  };

  const startVideo = async () => {
    if (!camera.current || recording || busy) return;
    setRecording(true);
    try {
      const result = await camera.current.recordAsync({ maxDuration: 15, maxFileSize: 20 * 1024 * 1024 });
      if (!result?.uri) return;
      setBusy(true);
      const base64 = await new File(result.uri).base64();
      setCaptured({ kind: "video", dataUri: `data:video/mp4;base64,${base64}` });
    } catch (error: any) { Alert.alert("Camera", error?.message ?? "Unable to record video."); }
    finally { setRecording(false); setBusy(false); }
  };

  const stopVideo = () => camera.current?.stopRecording();

  const uploadMedia = async () => {
    if (busy || recording) return;
    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: allowVideo ? ["images", "videos"] : ["images"],
        quality: 0.8,
        base64: true,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const kind: CapturedMedia["kind"] = asset.type === "video" ? "video" : "photo";
      if (kind === "video" && !allowVideo) throw new Error("Select a photo for this field.");
      const encoded = asset.base64 || await new File(asset.uri).base64();
      const mimeType = asset.mimeType || (kind === "video" ? "video/mp4" : "image/jpeg");
      setCaptured({ kind, dataUri: `data:${mimeType};base64,${encoded}` });
    } catch (error: any) { Alert.alert("Upload media", error?.message ?? "Unable to upload that photo or video."); }
    finally { setBusy(false); }
  };

  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.dark ? "light-content" : "dark-content"} />
      <View style={[styles.header, { backgroundColor: theme.navigation }]}><TouchableOpacity onPress={onClose} style={styles.headerButton}><Ionicons name="close" size={25} color={theme.navigationText} /></TouchableOpacity><Text style={[styles.title, { color: theme.navigationText }]}>{title}</Text><TouchableOpacity onPress={() => setFacing((value) => value === "back" ? "front" : "back")} style={styles.headerButton}><Ionicons name="camera-reverse-outline" size={24} color={theme.navigationText} /></TouchableOpacity></View>
      {!cameraPermission?.granted ? <View style={[styles.permission, { backgroundColor: theme.background }]}><Ionicons name="camera-outline" size={54} color={theme.accent} /><Text style={[styles.permissionText, { color: theme.muted }]}>Camera permission is needed to capture evidence inside the POS.</Text><TouchableOpacity style={[styles.permissionButton, { backgroundColor: theme.primary }]} onPress={() => void requestCameraPermission()}><Text style={[styles.useText, { color: theme.onPrimary }]}>Allow camera</Text></TouchableOpacity></View> : captured ? <View style={[styles.preview, { backgroundColor: theme.background }]}>{captured.kind === "photo" ? <Image source={{ uri: captured.dataUri }} style={styles.previewImage} resizeMode="contain" /> : <View style={styles.videoReady}><Ionicons name="videocam" size={64} color={theme.accent} /><Text style={[styles.videoTitle, { color: theme.text }]}>Video proof captured</Text><Text style={[styles.videoNote, { color: theme.muted }]}>The 15-second-or-shorter recording is ready to attach.</Text></View>}<View style={styles.previewActions}><TouchableOpacity style={[styles.retake, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]} onPress={() => setCaptured(null)}><Text style={[styles.retakeText, { color: theme.text }]}>Retake</Text></TouchableOpacity><TouchableOpacity style={[styles.use, { backgroundColor: theme.primary }]} onPress={() => { onUse(captured); onClose(); }}><Ionicons name="checkmark" size={20} color={theme.onPrimary} /><Text style={[styles.useText, { color: theme.onPrimary }]}>Use {captured.kind}</Text></TouchableOpacity></View></View> : <>
        <CameraView ref={camera} style={styles.camera} facing={facing} mode={captureMode === "video" ? "video" : "picture"} videoQuality="720p" />
        <View style={[styles.controls, { backgroundColor: theme.navigation }]}>
          <TouchableOpacity disabled={busy || recording} style={[styles.upload, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }, (busy || recording) && styles.disabled]} onPress={() => void uploadMedia()}><Ionicons name="cloud-upload-outline" size={22} color={theme.accent} /><Text style={[styles.uploadText, { color: theme.text }]}>Upload</Text></TouchableOpacity>
          {allowVideo ? <View style={styles.modeRow}><TouchableOpacity onPress={() => setCaptureMode("photo")} style={[styles.mode, { backgroundColor: captureMode === "photo" ? theme.primary : theme.surfaceAlt }]}><Text style={[styles.modeText, { color: captureMode === "photo" ? theme.onPrimary : theme.text }]}>PHOTO</Text></TouchableOpacity><TouchableOpacity onPress={() => void selectVideo()} style={[styles.mode, { backgroundColor: captureMode === "video" ? theme.primary : theme.surfaceAlt }]}><Text style={[styles.modeText, { color: captureMode === "video" ? theme.onPrimary : theme.text }]}>VIDEO</Text></TouchableOpacity></View> : null}
          {busy ? <ActivityIndicator size="large" color={theme.accent} /> : captureMode === "photo" ? <TouchableOpacity style={[styles.shutterOuter, { borderColor: theme.accent }]} onPress={() => void takePhoto()}><View style={[styles.shutter, { backgroundColor: theme.primary }]} /></TouchableOpacity> : <TouchableOpacity style={[styles.shutterOuter, { borderColor: theme.accent }, recording && styles.recordingOuter]} onPress={recording ? stopVideo : () => void startVideo()}><View style={[styles.record, recording && styles.recording]} /></TouchableOpacity>}
          <Text style={[styles.hint, { color: theme.navigationText }]}>{captureMode === "video" ? recording ? "Tap to stop recording" : "Maximum 15 seconds" : "Center the subject and tap to capture"}</Text>
        </View>
      </>}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { height: 72, paddingTop: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, headerButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, title: { fontSize: 17, fontWeight: "800" },
  camera: { flex: 1, backgroundColor: "#000000" }, controls: { minHeight: 175, paddingVertical: 15, alignItems: "center", justifyContent: "center" }, upload: { position: "absolute", left: 18, bottom: 42, minWidth: 76, minHeight: 52, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: 10 }, uploadText: { fontSize: 11, fontWeight: "800" }, disabled: { opacity: 0.45 }, modeRow: { flexDirection: "row", gap: 10, marginBottom: 12 }, mode: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 16 }, modeText: { fontSize: 12, fontWeight: "800" },
  shutterOuter: { width: 70, height: 70, borderRadius: 35, borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" }, shutter: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#fff" }, recordingOuter: { borderColor: "#ef4444" }, record: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#ef4444" }, recording: { width: 28, height: 28, borderRadius: 5 }, hint: { color: "#cbd5e1", fontSize: 12, marginTop: 10 },
  permission: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }, permissionText: { textAlign: "center", fontSize: 15 }, permissionButton: { borderRadius: 9, paddingHorizontal: 18, paddingVertical: 12 },
  preview: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center" }, previewImage: { width: "100%", flex: 1 }, videoReady: { flex: 1, alignItems: "center", justifyContent: "center" }, videoTitle: { fontSize: 22, fontWeight: "800", marginTop: 16 }, videoNote: { marginTop: 8, textAlign: "center" }, previewActions: { flexDirection: "row", gap: 12, width: "100%", paddingTop: 18 }, retake: { flex: 1, minHeight: 50, borderRadius: 9, borderWidth: 1, alignItems: "center", justifyContent: "center" }, retakeText: { fontWeight: "800" }, use: { flex: 1, minHeight: 50, borderRadius: 9, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 }, useText: { fontWeight: "800" },
});

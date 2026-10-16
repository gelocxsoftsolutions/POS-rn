import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";

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
        mediaTypes: allowVideo ? ImagePicker.MediaTypeOptions.All : ImagePicker.MediaTypeOptions.Images,
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
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" translucent={false} />
      <View style={styles.header}><TouchableOpacity onPress={onClose} style={styles.headerButton}><Ionicons name="close" size={25} color="#fff" /></TouchableOpacity><Text style={styles.title}>{title}</Text><TouchableOpacity onPress={() => setFacing((value) => value === "back" ? "front" : "back")} style={styles.headerButton}><Ionicons name="camera-reverse-outline" size={24} color="#fff" /></TouchableOpacity></View>
      {!cameraPermission?.granted ? <View style={styles.permission}><Ionicons name="camera-outline" size={54} color="#94a3b8" /><Text style={styles.permissionText}>Camera permission is needed to capture evidence inside the POS.</Text><TouchableOpacity style={styles.permissionButton} onPress={() => void requestCameraPermission()}><Text style={styles.useText}>Allow camera</Text></TouchableOpacity></View> : captured ? <View style={styles.preview}>{captured.kind === "photo" ? <Image source={{ uri: captured.dataUri }} style={styles.previewImage} resizeMode="contain" /> : <View style={styles.videoReady}><Ionicons name="videocam" size={64} color="#60a5fa" /><Text style={styles.videoTitle}>Video proof captured</Text><Text style={styles.videoNote}>The 15-second-or-shorter recording is ready to attach.</Text></View>}<View style={styles.previewActions}><TouchableOpacity style={styles.retake} onPress={() => setCaptured(null)}><Text style={styles.retakeText}>Retake</Text></TouchableOpacity><TouchableOpacity style={styles.use} onPress={() => { onUse(captured); onClose(); }}><Ionicons name="checkmark" size={20} color="#fff" /><Text style={styles.useText}>Use {captured.kind}</Text></TouchableOpacity></View></View> : <>
        <CameraView ref={camera} style={styles.camera} facing={facing} mode={captureMode === "video" ? "video" : "picture"} videoQuality="720p" />
        <View style={styles.controls}>
          <TouchableOpacity disabled={busy || recording} style={[styles.upload, (busy || recording) && styles.disabled]} onPress={() => void uploadMedia()}><Ionicons name="cloud-upload-outline" size={22} color="#fff" /><Text style={styles.uploadText}>Upload</Text></TouchableOpacity>
          {allowVideo ? <View style={styles.modeRow}><TouchableOpacity onPress={() => setCaptureMode("photo")} style={[styles.mode, captureMode === "photo" && styles.modeActive]}><Text style={styles.modeText}>PHOTO</Text></TouchableOpacity><TouchableOpacity onPress={() => void selectVideo()} style={[styles.mode, captureMode === "video" && styles.modeActive]}><Text style={styles.modeText}>VIDEO</Text></TouchableOpacity></View> : null}
          {busy ? <ActivityIndicator size="large" color="#fff" /> : captureMode === "photo" ? <TouchableOpacity style={styles.shutterOuter} onPress={() => void takePhoto()}><View style={styles.shutter} /></TouchableOpacity> : <TouchableOpacity style={[styles.shutterOuter, recording && styles.recordingOuter]} onPress={recording ? stopVideo : () => void startVideo()}><View style={[styles.record, recording && styles.recording]} /></TouchableOpacity>}
          <Text style={styles.hint}>{captureMode === "video" ? recording ? "Tap to stop recording" : "Maximum 15 seconds" : "Center the subject and tap to capture"}</Text>
        </View>
      </>}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#030712" }, header: { height: 72, paddingTop: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#0f172a" }, headerButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, title: { color: "#fff", fontSize: 17, fontWeight: "800" },
  camera: { flex: 1 }, controls: { minHeight: 175, paddingVertical: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#0f172a" }, upload: { position: "absolute", left: 18, bottom: 42, minWidth: 76, minHeight: 52, borderRadius: 10, backgroundColor: "#1e293b", alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: 10 }, uploadText: { color: "#fff", fontSize: 11, fontWeight: "800" }, disabled: { opacity: 0.45 }, modeRow: { flexDirection: "row", gap: 10, marginBottom: 12 }, mode: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 16 }, modeActive: { backgroundColor: "#2563eb" }, modeText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  shutterOuter: { width: 70, height: 70, borderRadius: 35, borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" }, shutter: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#fff" }, recordingOuter: { borderColor: "#ef4444" }, record: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#ef4444" }, recording: { width: 28, height: 28, borderRadius: 5 }, hint: { color: "#cbd5e1", fontSize: 12, marginTop: 10 },
  permission: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }, permissionText: { color: "#cbd5e1", textAlign: "center", fontSize: 15 }, permissionButton: { backgroundColor: "#2563eb", borderRadius: 9, paddingHorizontal: 18, paddingVertical: 12 },
  preview: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center" }, previewImage: { width: "100%", flex: 1 }, videoReady: { flex: 1, alignItems: "center", justifyContent: "center" }, videoTitle: { color: "#fff", fontSize: 22, fontWeight: "800", marginTop: 16 }, videoNote: { color: "#94a3b8", marginTop: 8, textAlign: "center" }, previewActions: { flexDirection: "row", gap: 12, width: "100%", paddingTop: 18 }, retake: { flex: 1, minHeight: 50, borderRadius: 9, borderWidth: 1, borderColor: "#64748b", alignItems: "center", justifyContent: "center" }, retakeText: { color: "#fff", fontWeight: "800" }, use: { flex: 1, minHeight: 50, borderRadius: 9, backgroundColor: "#2563eb", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 }, useText: { color: "#fff", fontWeight: "800" },
});

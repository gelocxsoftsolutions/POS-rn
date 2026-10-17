import React from "react";
import {
  Modal as RNModal,
  View,
  TouchableWithoutFeedback,
  StyleSheet,
  Dimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { usePosTheme } from "@/lib/stores/ui-store";

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const { height } = Dimensions.get("window");

export function Modal({ visible, onClose, children, style }: ModalProps) {
  const theme = usePosTheme();
  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={[styles.content, { backgroundColor: theme.surface, borderColor: theme.border }, style]}>
              {children}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </RNModal>
  );
}

export function BottomSheet({
  visible,
  onClose,
  children,
  style,
}: ModalProps) {
  const theme = usePosTheme();
  return (
    <RNModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={[styles.bottomSheet, { backgroundColor: theme.surface, borderColor: theme.border }, style]}>
              <View style={[styles.handle, { backgroundColor: theme.muted }]} />
              {children}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    width: "90%",
    maxHeight: height * 0.8,
  },
  bottomSheet: {
    borderWidth: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    width: "100%",
    maxHeight: height * 0.85,
    position: "absolute",
    bottom: 0,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
});

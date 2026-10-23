import React from "react";
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePosTheme } from "@/lib/stores/ui-store";

interface InputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "numeric" | "email-address" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  editable?: boolean;
  style?: ViewStyle;
  maxLength?: number;
}

export function Input({
  label,
  placeholder,
  value,
  onChangeText,
  error,
  icon,
  secureTextEntry,
  keyboardType = "default",
  autoCapitalize = "none",
  editable = true,
  style,
  maxLength,
}: InputProps) {
  const theme = usePosTheme();
  return (
    <View style={[styles.wrapper, style]}>
      {label && <Text style={[styles.label, { color: theme.muted }]}>{label}</Text>}
      <View style={[styles.container, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }, error ? styles.errorBorder : null]}>
        {icon && (
          <Ionicons
            name={icon}
            size={20}
            color={error ? "#dc3545" : theme.muted}
            style={styles.icon}
          />
        )}
        <TextInput
          style={[styles.input, { color: theme.text }, !editable && styles.disabled]}
          placeholder={placeholder}
          placeholderTextColor={theme.muted}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          editable={editable}
          maxLength={maxLength}
        />
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 12,
  },
  errorBorder: {
    borderColor: "#dc3545",
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 12,
  },
  disabled: {
    opacity: 0.6,
  },
  error: {
    fontSize: 11,
    color: "#dc3545",
    marginTop: 4,
    marginLeft: 4,
  },
});

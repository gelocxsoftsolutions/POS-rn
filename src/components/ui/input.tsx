import React from "react";
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

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
  return (
    <View style={[styles.wrapper, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.container, error ? styles.errorBorder : null]}>
        {icon && (
          <Ionicons
            name={icon}
            size={20}
            color={error ? "#dc3545" : "#8e99a4"}
            style={styles.icon}
          />
        )}
        <TextInput
          style={[styles.input, !editable && styles.disabled]}
          placeholder={placeholder}
          placeholderTextColor="#b0b8c1"
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
    color: "#4a5568",
    marginBottom: 6,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f7f9fc",
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
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
    color: "#1a202c",
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

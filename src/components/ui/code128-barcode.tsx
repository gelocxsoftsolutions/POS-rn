import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { encodeCode128B } from "@/lib/barcodes/code128";

type Props = {
  value: string;
  height?: number;
  dark?: boolean;
};

export function Code128Barcode({ value, height = 72, dark = false }: Props) {
  const [availableWidth, setAvailableWidth] = useState(0);
  const modules = useMemo(() => encodeCode128B(value), [value]);
  const totalModules = useMemo(
    () => (modules?.reduce((sum, width) => sum + width, 0) ?? 0) + 20,
    [modules]
  );
  const moduleWidth = availableWidth > 0 && totalModules > 0
    ? Math.max(1, Math.floor(availableWidth / totalModules))
    : 1;

  if (!modules) {
    return <Text style={[styles.unsupported, dark && styles.unsupportedDark]}>Barcode contains unsupported characters</Text>;
  }

  return (
    <View
      style={[styles.container, { height }]}
      onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)}
      accessibilityLabel={`Barcode ${value}`}
    >
      <View style={{ width: moduleWidth * 10 }} />
      {modules.map((width, index) => (
        <View
          key={`${index}-${width}`}
          style={{
            width: moduleWidth * width,
            height: "100%",
            backgroundColor: index % 2 === 0 ? "#000000" : "#ffffff",
          }}
        />
      ))}
      <View style={{ width: moduleWidth * 10 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#ffffff",
  },
  unsupported: {
    color: "#6b7280",
    fontSize: 12,
    paddingVertical: 8,
  },
  unsupportedDark: {
    color: "#9ca3af",
  },
});

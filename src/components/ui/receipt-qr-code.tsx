import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { createReceiptQrMatrix } from "@/lib/printers/qr-matrix";

type Props = {
  value: string;
  size?: number;
};

const QUIET_ZONE_MODULES = 4;

export function ReceiptQrCode({ value, size = 140 }: Props) {
  const matrix = useMemo(() => createReceiptQrMatrix(value), [value]);
  const moduleSize = size / (matrix.size + QUIET_ZONE_MODULES * 2);

  return (
    <View style={[styles.canvas, { width: size, height: size, padding: moduleSize * QUIET_ZONE_MODULES }]}>
      {Array.from({ length: matrix.size }, (_, row) => (
        <View key={row} style={{ flexDirection: "row", height: moduleSize }}>
          {Array.from({ length: matrix.size }, (__, column) => (
            <View
              key={column}
              style={{
                width: moduleSize,
                height: moduleSize,
                backgroundColor: matrix.modules[row * matrix.size + column] ? "#000000" : "#ffffff",
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    backgroundColor: "#ffffff",
  },
});

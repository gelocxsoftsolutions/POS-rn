import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

const CODE_128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212",
  "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321",
  "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242", "121142", "121241", "114212",
  "124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
] as const;

const encodeCode128B = (value: string) => {
  const codes = Array.from(value).map((character) => character.charCodeAt(0) - 32);
  if (codes.some((code) => code < 0 || code > 94)) return null;

  const checksum = (104 + codes.reduce((sum, code, index) => sum + code * (index + 1), 0)) % 103;
  return [104, ...codes, checksum, 106]
    .flatMap((code) => Array.from(CODE_128_PATTERNS[code]).map(Number));
};

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

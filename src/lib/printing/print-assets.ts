import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { NativeModules, Platform } from "react-native";

interface AndroidDrawableReader {
  getDrawableDataUri(resourceName: string, mimeType: string): Promise<string>;
}

const hasUriScheme = (uri: string) => /^[a-z][a-z0-9+.-]*:/i.test(uri);

export async function getPrintableAssetDataUri(
  moduleId: number,
  mimeType: string
): Promise<string> {
  const asset = Asset.fromModule(moduleId);

  if (Platform.OS === "web") {
    return asset.uri;
  }

  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) return "";
  if (uri.startsWith("data:")) return uri;

  // Release APKs embed Metro image assets as Android drawables. In that
  // environment Expo Asset returns a resource name, not a file URI.
  if (Platform.OS === "android" && !hasUriScheme(uri)) {
    const reader = NativeModules.BluetoothPrinter as
      | AndroidDrawableReader
      | undefined;
    if (!reader?.getDrawableDataUri) {
      throw new Error("The installed app cannot read bundled print assets.");
    }
    return reader.getDrawableDataUri(uri, mimeType);
  }

  const base64 = await new File(uri).base64();
  return `data:${mimeType};base64,${base64}`;
}

export async function getPrintableFileDataUri(uri: string | null | undefined): Promise<string> {
  if (!uri) return "";
  if (uri.startsWith("data:") || Platform.OS === "web") return uri;
  const extension = uri.split("?")[0].split(".").pop()?.toLowerCase();
  const mimeType = extension === "png"
    ? "image/png"
    : extension === "webp"
      ? "image/webp"
      : "image/jpeg";
  const base64 = await new File(uri).base64();
  return `data:${mimeType};base64,${base64}`;
}

import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { Platform } from "react-native";

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

  const base64 = await new File(uri).base64();
  return `data:${mimeType};base64,${base64}`;
}

import Constants from "expo-constants";
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

export async function loadSqlite() {
  if (Platform.OS !== "web" && !requireOptionalNativeModule("ExpoSQLite")) {
    const version = Constants.expoVersion ?? "unknown";
    const message = `SQLite is unavailable in this native runtime (Expo Go ${version}). ` +
      "NCT POS requires Expo SDK 58 with SQLite support. Fully close Expo Go and open this project again. " +
      "If this persists, update Expo Go or use a development build containing expo-sqlite.";
    console.error("[Startup]", message);
    throw new Error(message);
  }
  return import("expo-sqlite");
}

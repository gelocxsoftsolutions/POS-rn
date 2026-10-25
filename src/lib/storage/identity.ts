import { isRunningInExpoGo } from "expo";

// Keep Expo Go testing separate from dealership data and installed POS builds.
export const EXPO_GO_STORAGE_PREFIX = isRunningInExpoGo() ? "dealership-pos:expo-go:" : "dealership-pos:";
export const DATABASE_NAME = isRunningInExpoGo() ? "dealership_pos_expo_go.db" : "dealership_pos.db";

import { isRunningInExpoGo } from "expo";

// Keep Expo Go testing separate from dealership data and installed POS builds.
export const EXPO_GO_STORAGE_PREFIX = isRunningInExpoGo() ? "pos-rn:expo-go:" : "";
export const DATABASE_NAME = isRunningInExpoGo() ? "pos_rn_expo_go.db" : "nct_pos.db";

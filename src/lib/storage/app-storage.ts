import AsyncStorage from "@react-native-async-storage/async-storage";
import { EXPO_GO_STORAGE_PREFIX } from "./identity";

// Use the same namespace for Zustand persistence and direct credential access.
const storage = {
  getItem: (key: string) => AsyncStorage.getItem(EXPO_GO_STORAGE_PREFIX + key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(EXPO_GO_STORAGE_PREFIX + key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(EXPO_GO_STORAGE_PREFIX + key),
};

export default storage;

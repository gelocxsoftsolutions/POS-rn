import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "react-native";

type NavigationMode = "sidebar" | "bottom" | "auto";
type ThemeMode = "light" | "dark" | "system";

interface UiState {
  themeMode: ThemeMode;
  navigationMode: NavigationMode;
  uiScale: number;
  setThemeMode: (mode: ThemeMode) => void;
  setNavigationMode: (mode: NavigationMode) => void;
  setUiScale: (scale: number) => void;
  hydrated: boolean;
  setHydrated: (value: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      themeMode: "system",
      navigationMode: "auto",
      uiScale: 1,
      hydrated: false,
      setThemeMode: (themeMode) => set({ themeMode }),
      setNavigationMode: (navigationMode) => set({ navigationMode }),
      setUiScale: (uiScale) => set({ uiScale: Math.min(1.5, Math.max(0.5, uiScale)) }),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: "nct-pos-ui",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        themeMode: state.themeMode,
        navigationMode: state.navigationMode,
        uiScale: state.uiScale,
      }),
      onRehydrateStorage: () => () => {
        useUiStore.getState().setHydrated(true);
      },
    }
  )
);

export function useIsDarkTheme(): boolean {
  const themeMode = useUiStore((state) => state.themeMode);
  const systemTheme = useColorScheme();
  return themeMode === "dark" || (themeMode === "system" && systemTheme === "dark");
}

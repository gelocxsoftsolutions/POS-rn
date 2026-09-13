import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

type NavigationMode = "sidebar" | "bottom" | "auto";
type ThemeMode = "light" | "dark" | "system";

interface UiState {
  themeMode: ThemeMode;
  navigationMode: NavigationMode;
  setThemeMode: (mode: ThemeMode) => void;
  setNavigationMode: (mode: NavigationMode) => void;
  hydrated: boolean;
  setHydrated: (value: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      themeMode: "light",
      navigationMode: "auto",
      hydrated: false,
      setThemeMode: (themeMode) => set({ themeMode }),
      setNavigationMode: (navigationMode) => set({ navigationMode }),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: "nct-pos-ui",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        themeMode: state.themeMode,
        navigationMode: state.navigationMode,
      }),
      onRehydrateStorage: () => () => {
        useUiStore.getState().setHydrated(true);
      },
    }
  )
);

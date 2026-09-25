import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "react-native";

type NavigationMode = "sidebar" | "bottom" | "auto";
type ThemeMode = "light" | "dark" | "system";
export type FeedbackSound = "checkout" | "transferReceived" | "omsConnected" | "omsConnectionFailed";
export type PaginatedScreen = "sales" | "receipts" | "products" | "stock" | "transfers";

const DEFAULT_SOUND_VOLUMES: Record<FeedbackSound, number> = {
  checkout: 1,
  transferReceived: 1,
  omsConnected: 1,
  omsConnectionFailed: 1,
};

const DEFAULT_PAGE_SIZES: Record<PaginatedScreen, number> = {
  sales: 10,
  receipts: 10,
  products: 20,
  stock: 10,
  transfers: 5,
};

interface UiState {
  themeMode: ThemeMode;
  navigationMode: NavigationMode;
  uiScale: number;
  soundMuted: boolean;
  soundVolume: number;
  soundVolumes: Record<FeedbackSound, number>;
  pageSizes: Record<PaginatedScreen, number>;
  setThemeMode: (mode: ThemeMode) => void;
  setNavigationMode: (mode: NavigationMode) => void;
  setUiScale: (scale: number) => void;
  setSoundMuted: (muted: boolean) => void;
  setSoundVolume: (volume: number) => void;
  setFeedbackSoundVolume: (sound: FeedbackSound, volume: number) => void;
  setPageSize: (screen: PaginatedScreen, size: number) => void;
  hydrated: boolean;
  setHydrated: (value: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      themeMode: "system",
      navigationMode: "auto",
      uiScale: 1,
      soundMuted: false,
      soundVolume: 1,
      soundVolumes: DEFAULT_SOUND_VOLUMES,
      pageSizes: DEFAULT_PAGE_SIZES,
      hydrated: false,
      setThemeMode: (themeMode) => set({ themeMode }),
      setNavigationMode: (navigationMode) => set({ navigationMode }),
      setUiScale: (uiScale) => set({ uiScale: Math.min(1.5, Math.max(0.5, uiScale)) }),
      setSoundMuted: (soundMuted) => set({ soundMuted }),
      setSoundVolume: (soundVolume) =>
        set({ soundVolume: Math.min(1, Math.max(0, soundVolume)) }),
      setFeedbackSoundVolume: (sound, volume) =>
        set((state) => ({
          soundVolumes: {
            ...state.soundVolumes,
            [sound]: Math.min(1, Math.max(0, volume)),
          },
        })),
      setPageSize: (screen, size) =>
        set((state) => ({
          pageSizes: { ...state.pageSizes, [screen]: size },
        })),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: "nct-pos-ui",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        themeMode: state.themeMode,
        navigationMode: state.navigationMode,
        uiScale: state.uiScale,
        soundMuted: state.soundMuted,
        soundVolume: state.soundVolume,
        soundVolumes: state.soundVolumes,
        pageSizes: state.pageSizes,
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

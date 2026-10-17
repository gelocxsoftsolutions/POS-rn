import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "react-native";

type NavigationMode = "sidebar" | "bottom" | "auto";
export type ThemeMode = "light" | "dark" | "system";
export type ThemePaletteMode = "light" | "dark";
export interface PosThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  primary: string;
  onPrimary: string;
  accent: string;
  text: string;
  muted: string;
  border: string;
  navigation: string;
  navigationText: string;
}

export const DEFAULT_POS_THEMES: Record<ThemePaletteMode, PosThemeColors> = {
  light: {
    background: "#f4f6f8", surface: "#ffffff", surfaceAlt: "#edf2f7",
    primary: "#17386b", onPrimary: "#ffffff", accent: "#2563eb", text: "#172033",
    muted: "#667085", border: "#dfe5ec", navigation: "#0f1b33", navigationText: "#ffffff",
  },
  dark: {
    background: "#0b0f16", surface: "#141922", surfaceAlt: "#1b2432",
    primary: "#60a5fa", onPrimary: "#07111f", accent: "#3b82f6", text: "#f4f7fb",
    muted: "#93a0b2", border: "#293241", navigation: "#0f172a", navigationText: "#f8fafc",
  },
};
export type SalesHandedness = "right" | "left";
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
  themePalettes: Record<ThemePaletteMode, PosThemeColors>;
  navigationMode: NavigationMode;
  salesHandedness: SalesHandedness;
  uiScale: number;
  soundMuted: boolean;
  soundVolume: number;
  soundVolumes: Record<FeedbackSound, number>;
  pageSizes: Record<PaginatedScreen, number>;
  setThemeMode: (mode: ThemeMode) => void;
  setThemeColor: (mode: ThemePaletteMode, key: keyof PosThemeColors, color: string) => void;
  setThemePalette: (mode: ThemePaletteMode, palette: PosThemeColors) => void;
  resetThemePalette: (mode: ThemePaletteMode) => void;
  setNavigationMode: (mode: NavigationMode) => void;
  setSalesHandedness: (mode: SalesHandedness) => void;
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
      themePalettes: DEFAULT_POS_THEMES,
      navigationMode: "auto",
      salesHandedness: "right",
      uiScale: 1,
      soundMuted: false,
      soundVolume: 1,
      soundVolumes: DEFAULT_SOUND_VOLUMES,
      pageSizes: DEFAULT_PAGE_SIZES,
      hydrated: false,
      setThemeMode: (themeMode) => set({ themeMode }),
      setThemeColor: (mode, key, color) => set((state) => ({
        themePalettes: {
          ...state.themePalettes,
          [mode]: { ...(state.themePalettes?.[mode] ?? DEFAULT_POS_THEMES[mode]), [key]: color },
        },
      })),
      setThemePalette: (mode, palette) => set((state) => ({
        themePalettes: { ...state.themePalettes, [mode]: { ...palette } },
      })),
      resetThemePalette: (mode) => set((state) => ({
        themePalettes: { ...state.themePalettes, [mode]: { ...DEFAULT_POS_THEMES[mode] } },
      })),
      setNavigationMode: (navigationMode) => set({ navigationMode }),
      setSalesHandedness: (salesHandedness) => set({ salesHandedness }),
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
        themePalettes: state.themePalettes,
        navigationMode: state.navigationMode,
        salesHandedness: state.salesHandedness,
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

export function usePosTheme(): PosThemeColors & { dark: boolean } {
  const dark = useIsDarkTheme();
  const palettes = useUiStore((state) => state.themePalettes);
  const mode: ThemePaletteMode = dark ? "dark" : "light";
  return { ...DEFAULT_POS_THEMES[mode], ...(palettes?.[mode] ?? {}), dark };
}

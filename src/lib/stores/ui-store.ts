import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@/lib/storage/app-storage";
import { useColorScheme } from "react-native";

export type NavigationMode = "sidebar" | "bottom" | "auto";
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
export interface PersistedUiPreferences {
  themeMode: ThemeMode;
  themePalettes: Record<ThemePaletteMode, PosThemeColors>;
  navigationMode: NavigationMode;
  salesHandedness: SalesHandedness;
  uiScale: number;
  soundMuted: boolean;
  soundVolume: number;
  soundVolumes: Record<FeedbackSound, number>;
  pageSizes: Record<PaginatedScreen, number>;
}

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

export function exportUiPreferences(): PersistedUiPreferences {
  const state = useUiStore.getState();
  return {
    themeMode: state.themeMode,
    themePalettes: state.themePalettes,
    navigationMode: state.navigationMode,
    salesHandedness: state.salesHandedness,
    uiScale: state.uiScale,
    soundMuted: state.soundMuted,
    soundVolume: state.soundVolume,
    soundVolumes: state.soundVolumes,
    pageSizes: state.pageSizes,
  };
}

export function restoreUiPreferences(input: PersistedUiPreferences | null | undefined) {
  if (!input) return;
  const validColor = (value: unknown, fallback: string) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  const clamp01 = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Math.min(1, Math.max(0, Number(value))) : fallback;
  const pageSize = (screen: PaginatedScreen) => Number.isFinite(Number(input.pageSizes?.[screen])) && Number(input.pageSizes[screen]) > 0 ? Number(input.pageSizes[screen]) : DEFAULT_PAGE_SIZES[screen];
  const palette = (mode: ThemePaletteMode): PosThemeColors => {
    const source = input.themePalettes?.[mode] ?? DEFAULT_POS_THEMES[mode];
    return Object.fromEntries(Object.entries(DEFAULT_POS_THEMES[mode]).map(([key, fallback]) => [key, validColor(source[key as keyof PosThemeColors], fallback)])) as unknown as PosThemeColors;
  };
  useUiStore.setState({
    themeMode: ["light", "dark", "system"].includes(input.themeMode) ? input.themeMode : "system",
    themePalettes: { light: palette("light"), dark: palette("dark") },
    navigationMode: ["sidebar", "bottom", "auto"].includes(input.navigationMode) ? input.navigationMode : "auto",
    salesHandedness: input.salesHandedness === "left" ? "left" : "right",
    uiScale: Math.min(1.5, Math.max(0.5, Number(input.uiScale) || 1)),
    soundMuted: Boolean(input.soundMuted),
    soundVolume: clamp01(input.soundVolume, 1),
    soundVolumes: {
      checkout: clamp01(input.soundVolumes?.checkout, 1),
      transferReceived: clamp01(input.soundVolumes?.transferReceived, 1),
      omsConnected: clamp01(input.soundVolumes?.omsConnected, 1),
      omsConnectionFailed: clamp01(input.soundVolumes?.omsConnectionFailed, 1),
    },
    pageSizes: {
      sales: pageSize("sales"), receipts: pageSize("receipts"), products: pageSize("products"),
      stock: pageSize("stock"), transfers: pageSize("transfers"),
    },
  });
}

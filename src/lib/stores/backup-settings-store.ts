import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface BackupSettingsState {
  autoBackupEnabled: boolean;
  autoBackupIntervalHours: number;
  lastAutoBackupAt: string | null;
  hydrated: boolean;
  setAutoBackupEnabled: (enabled: boolean) => void;
  setAutoBackupIntervalHours: (hours: number) => void;
  markAutoBackup: () => void;
  setHydrated: (value: boolean) => void;
}

export const useBackupSettingsStore = create<BackupSettingsState>()(
  persist(
    (set) => ({
      autoBackupEnabled: false,
      autoBackupIntervalHours: 24,
      lastAutoBackupAt: null,
      hydrated: false,
      setAutoBackupEnabled: (autoBackupEnabled) => set({ autoBackupEnabled }),
      setAutoBackupIntervalHours: (hours) =>
        set({ autoBackupIntervalHours: Math.min(168, Math.max(1, Math.round(Number.isFinite(hours) ? hours : 24))) }),
      markAutoBackup: () => set({ lastAutoBackupAt: new Date().toISOString() }),
      setHydrated: (value) => set({ hydrated: value }),
    }),
    {
      name: "nct-pos-backup-settings",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        autoBackupEnabled: state.autoBackupEnabled,
        autoBackupIntervalHours: state.autoBackupIntervalHours,
        lastAutoBackupAt: state.lastAutoBackupAt,
      }),
      onRehydrateStorage: () => () => useBackupSettingsStore.getState().setHydrated(true),
    }
  )
);

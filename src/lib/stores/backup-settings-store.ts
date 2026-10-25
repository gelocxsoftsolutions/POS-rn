import AsyncStorage from "@/lib/storage/app-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface BackupSettingsState {
  autoBackupEnabled: boolean;
  autoBackupIntervalHours: number;
  scheduleMode: "INTERVAL" | "DAILY";
  dailyTime: string;
  setScheduleMode: (mode: "INTERVAL" | "DAILY") => void;
  setDailyTime: (time: string) => void;
  lastAutoBackupAt: string | null;
  lastCloudError: string | null;
  setCloudError: (message: string | null) => void;
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
      scheduleMode: "INTERVAL",
      dailyTime: "22:00",
      setScheduleMode: (scheduleMode) => set({ scheduleMode }),
      setDailyTime: (dailyTime) => { if (/^([01]\d|2[0-3]):[0-5]\d$/.test(dailyTime)) set({ dailyTime }); },
      lastAutoBackupAt: null,
      lastCloudError: null,
      setCloudError: (lastCloudError) => set({ lastCloudError }),
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
        scheduleMode: state.scheduleMode,
        dailyTime: state.dailyTime,
        lastAutoBackupAt: state.lastAutoBackupAt,
        lastCloudError: state.lastCloudError,
      }),
      onRehydrateStorage: () => () => useBackupSettingsStore.getState().setHydrated(true),
    }
  )
);

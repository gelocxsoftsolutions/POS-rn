import AsyncStorage from "@/lib/storage/app-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_NCT_BACKUP_TIME, isBackupTime } from "@/lib/backup/nct-schedule";

export interface BranchBackupSchedule {
  branchId: number;
  time: string;
  timeZone: "Asia/Manila";
  revision: string | null;
  updatedAt: string | null;
}

interface BackupSettingsState {
  autoBackupEnabled: boolean;
  autoBackupIntervalHours: number;
  lastAutoBackupAt: string | null;
  lastScheduledDate: string | null;
  schedule: BranchBackupSchedule | null;
  setSchedule: (schedule: BranchBackupSchedule) => void;
  lastCloudError: string | null;
  setCloudError: (message: string | null) => void;
  hydrated: boolean;
  setAutoBackupEnabled: (enabled: boolean) => void;
  setAutoBackupIntervalHours: (hours: number) => void;
  markAutoBackup: (scheduledDate?: string) => void;
  setHydrated: (value: boolean) => void;
}

export const useBackupSettingsStore = create<BackupSettingsState>()(
  persist(
    (set) => ({
      autoBackupEnabled: false,
      autoBackupIntervalHours: 24,
      lastAutoBackupAt: null,
      lastScheduledDate: null,
      schedule: null,
      setSchedule: (schedule) => set({ schedule }),
      lastCloudError: null,
      setCloudError: (lastCloudError) => set({ lastCloudError }),
      hydrated: false,
      setAutoBackupEnabled: (autoBackupEnabled) => set({ autoBackupEnabled }),
      setAutoBackupIntervalHours: (hours) =>
        set({ autoBackupIntervalHours: Math.min(168, Math.max(1, Math.round(Number.isFinite(hours) ? hours : 24))) }),
      markAutoBackup: (scheduledDate) => set({ lastAutoBackupAt: new Date().toISOString(), lastScheduledDate: scheduledDate ?? null }),
      setHydrated: (value) => set({ hydrated: value }),
    }),
    {
      name: "nct-pos-backup-settings",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        autoBackupEnabled: state.autoBackupEnabled,
        autoBackupIntervalHours: state.autoBackupIntervalHours,
        lastAutoBackupAt: state.lastAutoBackupAt,
        lastScheduledDate: state.lastScheduledDate,
        schedule: state.schedule,
        lastCloudError: state.lastCloudError,
      }),
      onRehydrateStorage: () => () => useBackupSettingsStore.getState().setHydrated(true),
    }
  )
);

export function cachedBranchBackupTime(branchId: number | null) {
  const schedule = useBackupSettingsStore.getState().schedule;
  return branchId && schedule?.branchId === branchId && isBackupTime(schedule.time) ? schedule.time : DEFAULT_NCT_BACKUP_TIME;
}

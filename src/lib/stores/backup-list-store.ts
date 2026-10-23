import { create } from "zustand";
import { RecoveryService, type BackupFileInfo } from "@/lib/backup/recovery.service";

interface BackupListState {
  items: BackupFileInfo[];
  loading: boolean;
  refresh: () => Promise<void>;
  setItems: (items: BackupFileInfo[]) => void;
}

export const useBackupListStore = create<BackupListState>((set) => ({
  items: [],
  loading: false,
  refresh: async () => {
    set({ loading: true });
    try {
      set({ items: await RecoveryService.listBackups() });
    } catch {
      set({ items: [] });
    } finally {
      set({ loading: false });
    }
  },
  setItems: (items) => set({ items }),
}));

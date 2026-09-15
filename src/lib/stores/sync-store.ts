import { create } from "zustand";
import { SyncQueueRepository } from "@/lib/repositories/sync-queue.repository";

interface SyncState {
  pendingCount: number;
  lastSyncTime: string | null;
  isSyncing: boolean;
  setPendingCount: (count: number) => void;
  setLastSyncTime: (time: string | null) => void;
  setIsSyncing: (syncing: boolean) => void;
  refreshPendingCount: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set) => ({
  pendingCount: 0,
  lastSyncTime: null,
  isSyncing: false,
  setPendingCount: (count) => set({ pendingCount: count }),
  setLastSyncTime: (time) => set({ lastSyncTime: time }),
  setIsSyncing: (syncing) => set({ isSyncing: syncing }),
  refreshPendingCount: async () => {
    try {
      const stats = await SyncQueueRepository.getStats();
      set({ pendingCount: stats.pending });
    } catch {
      // ignore
    }
  },
}));

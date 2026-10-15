import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface AccessSettingsState {
  autoLockMinutes: number;
  maxPinAttempts: number;
  salesGroupCashierIds: string[];
  hydrated: boolean;
  setAutoLockMinutes: (minutes: number) => void;
  setMaxPinAttempts: (attempts: number) => void;
  toggleCashierLink: (currentCashierId: string, targetCashierId: string) => void;
  removeCashierFromGroup: (cashierId: string) => void;
  setHydrated: (value: boolean) => void;
}

export const useAccessSettingsStore = create<AccessSettingsState>()(
  persist(
    (set) => ({
      autoLockMinutes: 0,
      maxPinAttempts: 5,
      salesGroupCashierIds: [],
      hydrated: false,
      setAutoLockMinutes: (minutes) => set({ autoLockMinutes: Math.max(0, minutes) }),
      setMaxPinAttempts: (attempts) => set({ maxPinAttempts: Math.min(20, Math.max(1, Math.floor(attempts))) }),
      toggleCashierLink: (currentCashierId, targetCashierId) =>
        set((state) => {
          if (!currentCashierId || !targetCashierId || currentCashierId === targetCashierId) return state;
          const group = new Set(state.salesGroupCashierIds);
          if (!group.has(currentCashierId)) {
            group.clear();
            group.add(currentCashierId);
            group.add(targetCashierId);
          } else if (group.has(targetCashierId)) {
            group.delete(targetCashierId);
          } else {
            group.add(targetCashierId);
          }
          return { salesGroupCashierIds: group.size > 1 ? Array.from(group) : [] };
        }),
      removeCashierFromGroup: (cashierId) =>
        set((state) => {
          const remaining = state.salesGroupCashierIds.filter((id) => id !== cashierId);
          return { salesGroupCashierIds: remaining.length > 1 ? remaining : [] };
        }),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: "nct-pos-access-settings",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        autoLockMinutes: state.autoLockMinutes,
        maxPinAttempts: state.maxPinAttempts,
        salesGroupCashierIds: state.salesGroupCashierIds,
      }),
      onRehydrateStorage: () => () => useAccessSettingsStore.getState().setHydrated(true),
    }
  )
);

export function getVisibleCashierIds(currentCashierId?: string | null): string[] {
  if (!currentCashierId) return [];
  const group = useAccessSettingsStore.getState().salesGroupCashierIds;
  return group.includes(currentCashierId) ? group : [currentCashierId];
}

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface CashierSessionData {
  sessionId: string;
  cashierId: string;
  cashierName: string;
  cashierRole: string;
  roleId: string;
  loginTime: string;
  locked: boolean;
  lockedAt: string | null;
}

interface CashierState {
  session: CashierSessionData | null;
  hydrated: boolean;
  setSession: (session: CashierSessionData | null) => void;
  lock: () => void;
  unlock: () => void;
  clearSession: () => void;
  setHydrated: (value: boolean) => void;
}

export const useCashierStore = create<CashierState>()(
  persist(
    (set) => ({
      session: null,
      hydrated: false,
      setSession: (session) => set({ session }),
      lock: () =>
        set((state) =>
          state.session
            ? { session: { ...state.session, locked: true, lockedAt: new Date().toISOString() } }
            : state
        ),
      unlock: () =>
        set((state) =>
          state.session
            ? { session: { ...state.session, locked: false, lockedAt: null } }
            : state
        ),
      clearSession: () => set({ session: null }),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: "nct-pos-cashier",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ session: state.session }),
      onRehydrateStorage: () => () => {
        useCashierStore.getState().setHydrated(true);
      },
    }
  )
);

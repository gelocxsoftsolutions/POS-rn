import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CashierProfile } from "@/lib/types/pos";

interface AuthState {
  cashier: CashierProfile | null;
  hydrated: boolean;
  signIn: (cashier: CashierProfile) => void;
  signOut: () => void;
  setHydrated: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      cashier: null,
      hydrated: false,
      signIn: (cashier) => set({ cashier }),
      signOut: () => set({ cashier: null }),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: "nct-pos-auth",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ cashier: state.cashier }),
      onRehydrateStorage: () => () => {
        useAuthStore.getState().setHydrated(true);
      },
    }
  )
);

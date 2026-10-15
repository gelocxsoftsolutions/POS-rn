import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_BUSINESS_CONFIGURATION } from "@/lib/business/defaults";
import type { BusinessConfiguration } from "@/lib/business/types";

interface BusinessConfigState {
  configuration: BusinessConfiguration;
  hydrated: boolean;
  setConfiguration: (configuration: BusinessConfiguration) => void;
  setHydrated: (hydrated: boolean) => void;
}

export const useBusinessConfigStore = create<BusinessConfigState>()(
  persist(
    (set) => ({
      configuration: DEFAULT_BUSINESS_CONFIGURATION,
      hydrated: false,
      setConfiguration: (configuration) => set({ configuration }),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: "pos-business-configuration",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ configuration: state.configuration }),
      onRehydrateStorage: () => () => {
        useBusinessConfigStore.getState().setHydrated(true);
      },
    }
  )
);

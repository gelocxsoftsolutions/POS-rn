import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@/lib/storage/app-storage";
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
      setConfiguration: (configuration) => set({ configuration: { ...configuration, operatingMode: "NCT_DEPENDENT" } }),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: "pos-business-configuration",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ configuration: state.configuration }),
      merge: (persisted, current) => ({
        ...current,
        configuration: {
          ...current.configuration,
          ...(persisted as Partial<BusinessConfigState> | undefined)?.configuration,
          operatingMode: "NCT_DEPENDENT",
        },
      }),
      onRehydrateStorage: () => () => {
        useBusinessConfigStore.getState().setHydrated(true);
      },
    }
  )
);

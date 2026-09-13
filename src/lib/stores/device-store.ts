import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DeviceRegistrationState } from "@/lib/types/pos";

interface DeviceState {
  device: DeviceRegistrationState;
  hydrated: boolean;
  setDevice: (partial: Partial<DeviceRegistrationState>) => void;
  setRegistrationState: (state: DeviceRegistrationState["registrationState"]) => void;
  clearDevice: () => void;
  setHydrated: (value: boolean) => void;
}

const defaultDevice: DeviceRegistrationState = {
  deviceId: null,
  deviceCode: null,
  publicIdentifier: null,
  branchId: null,
  branchName: null,
  branchAddress: null,
  deviceName: null,
  registeredAt: null,
  registrationState: "unregistered",
};

export const useDeviceStore = create<DeviceState>()(
  persist(
    (set) => ({
      device: defaultDevice,
      hydrated: false,
      setDevice: (partial) =>
        set((state) => ({ device: { ...state.device, ...partial } })),
      setRegistrationState: (registrationState) =>
        set((state) => ({ device: { ...state.device, registrationState } })),
      clearDevice: () => set({ device: defaultDevice }),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: "nct-pos-device",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ device: state.device }),
      onRehydrateStorage: () => () => {
        useDeviceStore.getState().setHydrated(true);
      },
    }
  )
);

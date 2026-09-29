import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { BluetoothPrinterDevice } from "@/lib/printers/bluetooth-printer";

interface PrinterState {
  selectedPrinter: BluetoothPrinterDevice | null;
  setSelectedPrinter: (printer: BluetoothPrinterDevice | null) => void;
}

export const usePrinterStore = create<PrinterState>()(
  persist(
    (set) => ({
      selectedPrinter: null,
      setSelectedPrinter: (selectedPrinter) => set({ selectedPrinter }),
    }),
    {
      name: "nct-pos-printer",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

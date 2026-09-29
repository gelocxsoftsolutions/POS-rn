import {
  NativeModules,
  PermissionsAndroid,
  Platform,
} from "react-native";

export interface BluetoothPrinterDevice {
  id: string;
  address: string;
  name: string;
  connected?: boolean;
}

interface BluetoothPrinterNativeModule {
  getPairedDevices(): Promise<BluetoothPrinterDevice[]>;
  connect(address: string): Promise<boolean>;
  disconnect(): Promise<boolean>;
  isConnected(address: string): Promise<boolean>;
  printTest(): Promise<boolean>;
  printReceipt(content: string, logoDataUri: string | null, barcodeValue: string | null, qrMatrix: string | null, openDrawer: boolean): Promise<boolean>;
  printBarcode(label: string, value: string): Promise<boolean>;
}

const nativePrinter = NativeModules.BluetoothPrinter as
  | BluetoothPrinterNativeModule
  | undefined;

function requireNativePrinter(): BluetoothPrinterNativeModule {
  if (Platform.OS !== "android") {
    throw new Error("Bluetooth thermal printing is currently available on Android only.");
  }
  if (!nativePrinter) {
    throw new Error("Bluetooth printer support requires a new Android app build.");
  }
  return nativePrinter;
}

async function requestBluetoothPermissions(): Promise<void> {
  if (Platform.OS !== "android" || (Platform.Version as number) < 31) return;

  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
  ]);
  const denied = Object.values(result).some(
    (value) => value !== PermissionsAndroid.RESULTS.GRANTED
  );
  if (denied) {
    throw new Error("Bluetooth permission is required to find and connect to the printer.");
  }
}

export const BluetoothPrinter = {
  async getPairedDevices() {
    await requestBluetoothPermissions();
    return requireNativePrinter().getPairedDevices();
  },

  async connect(address: string) {
    await requestBluetoothPermissions();
    return requireNativePrinter().connect(address);
  },

  disconnect() {
    return requireNativePrinter().disconnect();
  },

  isConnected(address: string) {
    return requireNativePrinter().isConnected(address);
  },

  printTest() {
    return requireNativePrinter().printTest();
  },

  async printReceipt(
    address: string,
    content: string,
    logoDataUri?: string | null,
    barcodeValue?: string | null,
    qrMatrix?: string | null,
    openDrawer = false
  ) {
    await requestBluetoothPermissions();
    const printer = requireNativePrinter();
    if (!(await printer.isConnected(address))) {
      await printer.connect(address);
    }
    return printer.printReceipt(content, logoDataUri ?? null, barcodeValue ?? null, qrMatrix ?? null, openDrawer);
  },

  async printBarcode(address: string, label: string, value: string) {
    await requestBluetoothPermissions();
    const printer = requireNativePrinter();
    if (!(await printer.isConnected(address))) {
      await printer.connect(address);
    }
    return printer.printBarcode(label, value);
  },
};

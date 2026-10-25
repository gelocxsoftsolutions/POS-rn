/**
 * @typedef {import("expo/config").ExpoConfig & {
 *   splash: {
 *     image: string;
 *     resizeMode: "contain";
 *     backgroundColor: string;
 *   };
 * }} AppExpoConfig
 */

const OMS_URL = process.env.EXPO_PUBLIC_OMS_URL ?? "https://staging.nctseafoods.store";
const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? "staging";

/** @type {AppExpoConfig} */
const config = {
  name: "Dealership POS",
  slug: "dealership-pos",
  version: "1.0.0",
  owner: "gelo3102s-team",
  orientation: "default",
  icon: "./assets/nct-seafoods-logo.png",
  splash: {
    image: "./assets/nct-seafoods-logo.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  scheme: "dealershippos",
  userInterfaceStyle: "automatic",
  extra: {
    omsUrl: OMS_URL,
    appEnv: APP_ENV,
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.nctseafoods.dealership",
  },
  android: {
    package: "com.nctseafoods.dealership",
    adaptiveIcon: {
      backgroundColor: "#17386b",
      foregroundImage: "./assets/nct-seafoods-logo.png",
    },
    permissions: [
      "CAMERA",
      "NOTIFICATIONS",
      "INTERNET",
      "android.permission.BLUETOOTH",
      "android.permission.BLUETOOTH_ADMIN",
      "android.permission.BLUETOOTH_CONNECT",
      "android.permission.BLUETOOTH_SCAN",
    ],
  },
  web: {
    favicon: "./assets/favicon.png",
    bundler: "metro",
  },
  plugins: [
    "expo-router",
    "./plugins/with-bluetooth-printer",
    "expo-audio",
    "expo-sqlite",
    "expo-secure-store",
    "expo-sharing",
    "expo-status-bar",
    "expo-system-ui",
    "@react-native-community/datetimepicker",
    [
      "expo-image-picker",
      {
        photosPermission:
          "Allow NCT POS to access your photo library to upload activation QR codes.",
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission:
          "Allow NCT POS to access your camera for barcode scanning.",
      },
    ],
    [
      "expo-notifications",
      {
        sounds: [],
      },
    ],
  ],
};

export default config;

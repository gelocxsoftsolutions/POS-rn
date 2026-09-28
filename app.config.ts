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
  name: "NCT POS",
  slug: "nct-pos",
  version: "1.0.0",
  owner: "gelo3102s-team",
  orientation: "default",
  icon: "./assets/nct-seafoods-logo.png",
  splash: {
    image: "./assets/nct-seafoods-logo.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  scheme: "nctpos",
  userInterfaceStyle: "automatic",
  extra: {
    omsUrl: OMS_URL,
    appEnv: APP_ENV,
    eas: {
      projectId: "fc088a57-1134-4fac-954a-e495c1c263f4",
    },
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.nctseafoods.pos",
  },
  android: {
    package: "com.nctseafoods.pos",
    adaptiveIcon: {
      backgroundColor: "#17386b",
      foregroundImage: "./assets/nct-seafoods-logo.png",
    },
    permissions: ["CAMERA", "NOTIFICATIONS", "INTERNET"],
  },
  web: {
    favicon: "./assets/favicon.png",
    bundler: "metro",
  },
  plugins: [
    "expo-router",
    "expo-audio",
    "expo-sqlite",
    "expo-secure-store",
    "expo-sharing",
    "expo-status-bar",
    "expo-system-ui",
    "@react-native-community/datetimepicker",
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

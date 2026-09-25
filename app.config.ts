import type { ExpoConfig } from "expo/config";

type AppExpoConfig = ExpoConfig & {
  splash: {
    image: string;
    resizeMode: "contain";
    backgroundColor: string;
  };
};

const OMS_URL = process.env.EXPO_PUBLIC_OMS_URL ?? "https://staging.nctseafoods.store";
const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? "staging";

const config: AppExpoConfig = {
  name: "NCT POS",
  slug: "nct-pos",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
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
      projectId: "your-project-id",
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
      foregroundImage: "./assets/icon.png",
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

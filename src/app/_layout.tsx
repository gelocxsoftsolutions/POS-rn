import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Image, useWindowDimensions } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { MD3DarkTheme, MD3LightTheme, PaperProvider } from "react-native-paper";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { getDatabase } from "@/lib/db/connection";
import { SeedService } from "@/lib/services/seed.service";
import { initApiConfig } from "@/lib/api/http";
import { AuthenticationService } from "@/lib/services/authentication.service";
import { startNetworkListener } from "@/lib/services/network.service";
import { startBackgroundSync } from "@/lib/services/sync-worker";
import { usePosTheme } from "@/lib/stores/ui-store";
import { BusinessConfigurationService } from "@/lib/business/configuration.service";
import { useBusinessConfigStore } from "@/lib/stores/business-config-store";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theme = usePosTheme();
  const dark = theme.dark;
  const { width, height } = useWindowDimensions();
  const shortEdge = Math.min(width, height);
  const splashLogoSize = Math.max(104, Math.min(196, shortEdge * (width > height ? 0.3 : 0.28)));
  const shellBackground = theme.background;
  const paperTheme = {
    ...(dark ? MD3DarkTheme : MD3LightTheme),
    colors: {
      ...(dark ? MD3DarkTheme.colors : MD3LightTheme.colors),
      primary: theme.primary,
      onPrimary: theme.onPrimary,
      secondary: theme.accent,
      background: theme.background,
      surface: theme.surface,
      surfaceVariant: theme.surfaceAlt,
      onSurface: theme.text,
      onBackground: theme.text,
      outline: theme.border,
    },
  };
  const business = useBusinessConfigStore((state) => state.configuration);
  const splashLogo = business.businessLogoUri
    ? { uri: business.businessLogoUri }
    : require("../../assets/nct-seafoods-logo.png");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await getDatabase();
        await BusinessConfigurationService.load();
        await SeedService.run();
        await initApiConfig();
        await AuthenticationService.init();
        startNetworkListener();
        startBackgroundSync();
      } catch (e: any) {
        if (mounted) setError(e?.message ?? "Failed to initialize");
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!ready) {
    return (
      <View style={[styles.splash, { backgroundColor: theme.background }]}>
        <Image
          source={splashLogo}
          style={[styles.splashLogo, { width: splashLogoSize, height: splashLogoSize }]}
          resizeMode="contain"
        />
        <Text style={[styles.splashTitle, { color: theme.primary }]}>{business.posSystemName}</Text>
        <Text style={[styles.splashSubtitle, { color: theme.muted }]}>Initializing system…</Text>
        <ActivityIndicator
          size="large"
          color={theme.accent}
          style={{ marginTop: 24 }}
        />
        {error && (
          <Text style={styles.splashError}>{error}</Text>
        )}
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: shellBackground }]}>
      <SafeAreaProvider style={[styles.root, { backgroundColor: shellBackground }]}>
        <PaperProvider theme={paperTheme}>
          <StatusBar style={dark ? "light" : "dark"} />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: shellBackground } }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(pos)" />
          </Stack>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#17386b",
    paddingHorizontal: 40,
  },
  splashLogo: {
    marginBottom: 20,
  },
  splashTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#ffffff",
    textAlign: "center",
  },
  splashSubtitle: {
    fontSize: 14,
    color: "#a3b8d6",
    marginTop: 8,
    textAlign: "center",
  },
  splashError: {
    fontSize: 13,
    color: "#ff6b6b",
    marginTop: 16,
    textAlign: "center",
  },
});

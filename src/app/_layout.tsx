import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
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
import { useIsDarkTheme } from "@/lib/stores/ui-store";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dark = useIsDarkTheme();
  const shellBackground = dark ? "#050a14" : "#f8fbff";

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await getDatabase();
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
      <View style={styles.splash}>
        <View style={styles.splashIcon}>
          <Text style={styles.splashIconText}>🐟</Text>
        </View>
        <Text style={styles.splashTitle}>NCT Seafoods POS</Text>
        <Text style={styles.splashSubtitle}>Initializing system…</Text>
        <ActivityIndicator
          size="large"
          color="#ffffff"
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
        <PaperProvider theme={dark ? MD3DarkTheme : MD3LightTheme}>
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
  splashIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  splashIconText: {
    fontSize: 40,
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

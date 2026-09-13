import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { OmsSyncService } from "@/lib/services/oms-sync.service";
import { SettingsService } from "@/lib/services/settings.service";

export default function SettingsScreen() {
  const router = useRouter();
  const device = useDeviceStore((s) => s.device);
  const clearDevice = useDeviceStore((s) => s.clearDevice);
  const signOut = useAuthStore((s) => s.signOut);
  const clearSession = useCashierStore((s) => s.clearSession);
  const { themeMode, setThemeMode, navigationMode, setNavigationMode } = useUiStore();

  const [omsUrl, setOmsUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [omsConnected, setOmsConnected] = useState(false);
  const [testing, setTesting] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [loading, setLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      const settings = await SettingsService.get();
      setStoreName(settings.storeName || "");
      if (settings.address) {
        // settings loaded
      }
    } catch {
      // keep defaults
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadSettings();
      setLoading(false);
    })();
  }, [loadSettings]);

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => {
          clearSession();
          signOut();
          router.replace("/(auth)");
        },
      },
    ]);
  };

  const handleResetDevice = () => {
    Alert.alert("Reset Device", "This will unregister the device. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: () => {
          clearDevice();
          signOut();
          clearSession();
          router.replace("/(auth)");
        },
      },
    ]);
  };

  const handleTestConnection = async () => {
    if (!omsUrl.trim()) {
      Alert.alert("Error", "Please enter a server URL.");
      return;
    }
    setTesting(true);
    try {
      const result = await OmsSyncService.connect(omsUrl.trim(), apiKey.trim());
      if (result.success) {
        setOmsConnected(true);
        if (storeName.trim()) {
          await SettingsService.update({ storeName: storeName.trim() });
        }
        Alert.alert("Success", "Connected to OMS server successfully!");
      } else {
        Alert.alert("Error", result.error ?? "Connection failed.");
      }
    } catch {
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#17386b" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.screenTitle}>Settings</Text>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Store Details</Text>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Store Name</Text>
          <TextInput
            style={styles.fieldInput}
            value={storeName}
            onChangeText={setStoreName}
            placeholder="Enter store name"
            placeholderTextColor="#b0b8c1"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Device Code</Text>
          <Text style={styles.fieldValue}>{device.deviceCode ?? "N/A"}</Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Address</Text>
          <Text style={styles.fieldValue}>{device.branchAddress ?? "N/A"}</Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Currency</Text>
          <Text style={styles.fieldValue}>PHP (₱)</Text>
        </View>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Tax Profile</Text>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Tax Label</Text>
          <Text style={styles.fieldValue}>VAT</Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Tax Rate</Text>
          <Text style={styles.fieldValue}>12%</Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Receipt Footer</Text>
          <Text style={styles.fieldValue}>Thank you for your purchase!</Text>
        </View>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Theme</Text>
        <View style={styles.themeRow}>
          <Text style={styles.fieldLabel}>Dark Mode</Text>
          <Switch
            value={themeMode === "dark"}
            onValueChange={(val) => setThemeMode(val ? "dark" : "light")}
            trackColor={{ false: "#e2e8f0", true: "#17386b" }}
          />
        </View>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Navigation Style</Text>
        <View style={styles.radioGroup}>
          {(["auto", "sidebar", "bottom"] as const).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[styles.radioOption, navigationMode === mode && styles.radioActive]}
              onPress={() => setNavigationMode(mode)}
            >
              <View style={[styles.radio, navigationMode === mode && styles.radioSelected]} />
              <Text style={styles.radioLabel}>
                {mode === "auto" ? "Auto (Responsive)" : mode === "sidebar" ? "Sidebar" : "Bottom Tabs"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Device</Text>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Registration State</Text>
          <Text style={styles.fieldValue}>{device.registrationState}</Text>
        </View>
        <Button
          title="Sign Out"
          onPress={handleSignOut}
          variant="danger"
          icon="log-out-outline"
          style={styles.dangerBtn}
        />
        <Button
          title="Reset Registration"
          onPress={handleResetDevice}
          variant="secondary"
          icon="trash-outline"
          style={{ marginTop: 8 }}
        />
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>OMS Connection</Text>
        <TextInput
          style={styles.input}
          placeholder="Server URL"
          placeholderTextColor="#b0b8c1"
          value={omsUrl}
          onChangeText={setOmsUrl}
          keyboardType="url"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="API Key"
          placeholderTextColor="#b0b8c1"
          value={apiKey}
          onChangeText={setApiKey}
          secureTextEntry
        />
        <Button
          title={testing ? "Testing..." : "Test & Connect"}
          onPress={handleTestConnection}
          icon="wifi-outline"
          loading={testing}
        />
        <View style={styles.connectionStatus}>
          <View style={[styles.statusDot, omsConnected ? styles.statusConnected : styles.statusDisconnected]} />
          <Text style={styles.statusText}>
            {omsConnected ? "Connected" : "Not Connected"}
          </Text>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fbff",
  },
  content: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a202c",
    marginBottom: 16,
  },
  section: {
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a202c",
    marginBottom: 16,
  },
  field: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f4ff",
  },
  fieldLabel: {
    fontSize: 13,
    color: "#6b7b8d",
  },
  fieldValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a202c",
  },
  fieldInput: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a202c",
    textAlign: "right",
    flex: 1,
    marginLeft: 16,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "#f7f9fc",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  themeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  radioGroup: {
    gap: 12,
  },
  radioOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  radioActive: {},
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#d1d9e6",
  },
  radioSelected: {
    borderColor: "#17386b",
    backgroundColor: "#17386b",
  },
  radioLabel: {
    fontSize: 14,
    color: "#4a5568",
  },
  dangerBtn: {
    marginTop: 16,
  },
  input: {
    backgroundColor: "#f7f9fc",
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: "#1a202c",
    marginBottom: 12,
  },
  connectionStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusConnected: {
    backgroundColor: "#28a745",
  },
  statusDisconnected: {
    backgroundColor: "#dc3545",
  },
  statusText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6b7b8d",
  },
});

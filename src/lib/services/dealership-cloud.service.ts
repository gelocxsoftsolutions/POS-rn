import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@/lib/storage/app-storage";
import { setApiConfig } from "@/lib/api/http";

export interface CloudConnection {
  serverUrl: string;
  deviceKey: string;
  deviceId: string;
  deviceName: string;
  businessId: string;
  businessName: string;
  operatingMode: "INDEPENDENT" | "NCT_DEPENDENT";
  modeVersion?: number;
  oms: { deviceId: string; branchId: number; apiKey: string } | null;
}
const STORAGE_KEY = "dealership-cloud-connection";
let connection: CloudConnection | null = null;
async function timedFetch(url: string, options: RequestInit, milliseconds: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
export function getCloudConnection() { return connection; }
function configureOms(value: CloudConnection) {
  setApiConfig({ baseUrl: value.oms ? value.serverUrl : "", apiKey: value.oms?.apiKey, accessToken: undefined, dealership: true });
}
export async function loadCloudConnection() {
  const raw = Platform.OS === "web" ? await AsyncStorage.getItem(STORAGE_KEY) : await SecureStore.getItemAsync(STORAGE_KEY);
  if (raw) { connection = JSON.parse(raw); configureOms(connection!); }
}
export async function verifyCloudConnection(raw: string, manualServerUrl?: string): Promise<CloudConnection> {
  let input: { serverUrl?: string; deviceKey?: string; pairingCode?: string };
  try { input = JSON.parse(raw); }
  catch { input = { serverUrl: manualServerUrl, pairingCode: raw.trim() }; }
  const serverUrl = input.serverUrl?.trim().replace(/\/+$/, "");
  if (!serverUrl || (!input.deviceKey && !input.pairingCode)) throw new Error("Enter your OMS server and pairing code, or scan the QR code from Dealership.");
  const url = new URL(serverUrl);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "10.0.2.2"].includes(url.hostname))) throw new Error("Use an HTTPS OMS server URL.");
  if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== "/")) throw new Error("Use the OMS origin URL without a path.");
  if (input.pairingCode) {
    const paired = await timedFetch(`${serverUrl}/api/pos/dealership/pair`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: input.pairingCode }) }, 30000);
    const result = await paired.json();
    if (!paired.ok || !result.deviceKey) throw new Error(result.error ?? "Pairing failed. Generate a new connection in OMS.");
    input.deviceKey = result.deviceKey;
  }
  if (!input.deviceKey) throw new Error("The pairing response did not contain a device key.");
  const response = await timedFetch(`${serverUrl}/api/pos/dealership/connection`, { headers: { "x-dealership-key": input.deviceKey } }, 30000);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Cloud connection failed");
  if (!["INDEPENDENT", "NCT_DEPENDENT"].includes(data.operatingMode) || !data.deviceId || !data.businessId) throw new Error("Invalid dealership configuration");
  if (data.operatingMode === "NCT_DEPENDENT" && (!data.oms?.apiKey || !data.oms.deviceId)) throw new Error("The linked OMS POS device must be enabled and have a device API key.");
  return { ...data, serverUrl, deviceKey: input.deviceKey };
}
export async function saveCloudConnection(value: CloudConnection) {
  const raw = JSON.stringify(value);
  if (Platform.OS === "web") await AsyncStorage.setItem(STORAGE_KEY, raw);
  else await SecureStore.setItemAsync(STORAGE_KEY, raw);
  connection = value;
  configureOms(value);
}
export async function uploadCloudBackup(body: unknown) {
  if (!connection) throw new Error("Connect this device to dealership cloud backups first.");
  const response = await timedFetch(`${connection.serverUrl}/api/pos/dealership/backups`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-dealership-key": connection.deviceKey },
    body: JSON.stringify(body),
  }, 180000);
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error ?? `Cloud backup failed (${response.status})`), { status: response.status });
  return data as { backupId: string; checksum: string; byteSize: number };
}

export async function reportBackupStatus(status: unknown) {
  if (!connection) return;
  const response = await timedFetch(`${connection.serverUrl}/api/pos/dealership/connection`, {
    method: "PUT", headers: { "Content-Type": "application/json", "x-dealership-key": connection.deviceKey }, body: JSON.stringify(status),
  }, 15000);
  if (!response.ok) throw new Error(`Unable to report backup status (${response.status})`);
}

const MODE_INTENT_KEY = "dealership-mode-switch-intent";
export async function readModeSwitchIntent(): Promise<{ code: string; actor: { id: string; name: string } } | null> {
  const raw = Platform.OS === "web" ? await AsyncStorage.getItem(MODE_INTENT_KEY) : await SecureStore.getItemAsync(MODE_INTENT_KEY);
  return raw ? JSON.parse(raw) : null;
}
export async function saveModeSwitchIntent(value: unknown) {
  if (Platform.OS === "web") { if (value) await AsyncStorage.setItem(MODE_INTENT_KEY, JSON.stringify(value)); else await AsyncStorage.removeItem(MODE_INTENT_KEY); }
  else { if (value) await SecureStore.setItemAsync(MODE_INTENT_KEY, JSON.stringify(value)); else await SecureStore.deleteItemAsync(MODE_INTENT_KEY); }
}
export async function modeSwitchRequest(code: string, action: "preview" | "apply" | "confirm") {
  if (!connection) throw new Error("Connect dealership cloud backups first");
  const response = await timedFetch(connection.serverUrl + "/api/pos/dealership/mode-switch", { method: "POST", headers: { "Content-Type": "application/json", "x-dealership-key": connection.deviceKey }, body: JSON.stringify({ code, action }) }, 30000);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? "Mode switch failed. Retry the same key to resume.");
  return value as { requestId: string; previousMode: string; nextMode: string; applied: boolean; connection: CloudConnection | null };
}

import { create } from "zustand";
import AsyncStorage from "@/lib/storage/app-storage";
import { api, getApiConfig, setApiConfig } from "@/lib/api/http";
import { getCloudConnection } from "@/lib/services/dealership-cloud.service";

export type OmsConnectionStatus = "idle" | "connecting" | "connected" | "offline";

interface OmsConnectionState {
  status: OmsConnectionStatus;
  lastCheckedAt: string | null;
  setStatus: (status: OmsConnectionStatus) => void;
  checkConnection: (url?: string, apiKey?: string) => Promise<OmsConnectionStatus>;
}

const OMS_STORAGE_KEY = "nct-pos-oms";

export const useOmsConnectionStore = create<OmsConnectionState>((set) => ({
  status: "idle",
  lastCheckedAt: null,
  setStatus: (status) => set({ status, lastCheckedAt: new Date().toISOString() }),
  checkConnection: async (providedUrl, providedApiKey) => {
    const cloud = getCloudConnection();
    if (cloud) {
      set({ status: "connecting" });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        // Independent devices authenticate to cloud storage, not POS stock APIs.
        const response = await fetch(`${cloud.serverUrl}/api/pos/dealership/connection`, { headers: { "x-dealership-key": cloud.deviceKey }, signal: controller.signal });
        const value = response.ok ? await response.json() : null;
        const status = value?.deviceId === cloud.deviceId ? "connected" : "offline";
        set({ status, lastCheckedAt: new Date().toISOString() });
        return status;
      } catch { set({ status: "offline", lastCheckedAt: new Date().toISOString() }); return "offline"; }
      finally { clearTimeout(timeout); }
    }
    let url = providedUrl?.trim() ?? "";
    let apiKey = providedApiKey?.trim() ?? "";

    if (!url) {
      try {
        const raw = await AsyncStorage.getItem(OMS_STORAGE_KEY);
        const data = raw ? JSON.parse(raw) : null;
        const state = data?.state ?? data;
        url = state?.serverUrl || state?.url || "";
        apiKey = state?.apiKey || "";
      } catch {
        set({ status: "offline", lastCheckedAt: new Date().toISOString() });
        return "offline";
      }
    }

    if (!url) {
      set({ status: "idle", lastCheckedAt: new Date().toISOString() });
      return "idle";
    }

    set({ status: "connecting" });
    const current = getApiConfig();
    setApiConfig({
      baseUrl: url,
      apiKey: apiKey || current.apiKey,
      accessToken: current.accessToken,
    });

    try {
      const response = await api.get("/api/pos/health");
      const status = response.ok ? "connected" : "offline";
      set({ status, lastCheckedAt: new Date().toISOString() });
      return status;
    } catch {
      set({ status: "offline", lastCheckedAt: new Date().toISOString() });
      return "offline";
    }
  },
}));

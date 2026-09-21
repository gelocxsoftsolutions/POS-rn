import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, getApiConfig, setApiConfig } from "@/lib/api/http";

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

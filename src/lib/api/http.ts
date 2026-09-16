const DEFAULT_TIMEOUT = 15000;

const FALLBACK_OMS_URL = "https://staging.nctseafoods.store";

interface ApiConfig {
  baseUrl: string;
  apiKey?: string;
  accessToken?: string;
}

let config: ApiConfig = {
  baseUrl: process.env.EXPO_PUBLIC_OMS_URL ?? FALLBACK_OMS_URL,
};

export function setApiConfig(c: Partial<ApiConfig>) {
  config = { ...config, ...c };
}

export function getApiConfig() {
  return { ...config };
}

export async function initApiConfig() {
  try {
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    const raw = await AsyncStorage.getItem("nct-pos-oms");
    if (raw) {
      const parsed = JSON.parse(raw);
      const state = parsed?.state ?? parsed;
      console.log("[API] initApiConfig raw keys:", Object.keys(parsed), "state:", state);
      if (state.serverUrl) config.baseUrl = state.serverUrl;
      if (state.apiKey) config.apiKey = state.apiKey;
      if (state.accessToken) config.accessToken = state.accessToken;
    } else {
      console.log("[API] initApiConfig — no nct-pos-oms in AsyncStorage");
    }

    if (!config.apiKey) {
      try {
        const AsyncStorage2 = (await import("@react-native-async-storage/async-storage")).default;
        const deviceRaw = await AsyncStorage2.getItem("nct-pos-device");
        if (deviceRaw) {
          const deviceParsed = JSON.parse(deviceRaw);
          const deviceState = deviceParsed?.state?.device ?? deviceParsed?.device ?? deviceParsed;
          if (deviceState?.deviceSecret) {
            config.apiKey = deviceState.deviceSecret;
            console.log("[API] initApiConfig — loaded apiKey from device store:", config.apiKey ? "set" : "MISSING");
          }
        }
      } catch { /* silent */ }
    }

    console.log("[API] initApiConfig final — apiKey:", config.apiKey ? "set" : "MISSING", "accessToken:", config.accessToken ? "set" : "MISSING");
  } catch {
    // silent
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: any
): Promise<{ ok: boolean; data?: T; status: number; error?: any }> {
  if (!config.baseUrl) {
    return { ok: false, status: 0 };
  }
  const url = `${config.baseUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) headers["x-pos-key"] = config.apiKey;
  if (config.accessToken) headers["Authorization"] = `Bearer ${config.accessToken}`;

  console.log("[API]", method, url, "apiKey:", config.apiKey ? `${config.apiKey.slice(0,8)}...` : "MISSING", "accessToken:", config.accessToken ? `${config.accessToken.slice(0,8)}...` : "MISSING");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      let errorData: any;
      try { errorData = await res.json(); } catch { try { errorData = await res.text(); } catch {} }
      console.warn("[API] error:", method, url, res.status, JSON.stringify(errorData)?.slice(0, 500));
      return { ok: false, status: res.status, error: errorData };
    }
    const data = await res.json();
    return { ok: true, data, status: res.status };
  } catch (e: any) {
    console.warn("[API] request failed:", method, url, e?.message);
    return { ok: false, status: 0 };
  }
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: any) => request<T>("POST", path, body),
  put: <T>(path: string, body?: any) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

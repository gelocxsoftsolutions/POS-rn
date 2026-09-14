const DEFAULT_TIMEOUT = 15000;

interface ApiConfig {
  baseUrl: string;
  apiKey?: string;
  accessToken?: string;
}

let config: ApiConfig = { baseUrl: "" };

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
      if (state.serverUrl) config.baseUrl = state.serverUrl;
      if (state.apiKey) config.apiKey = state.apiKey;
    }
  } catch {
    // silent
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: any
): Promise<{ ok: boolean; data?: T; status: number }> {
  if (!config.baseUrl) {
    return { ok: false, status: 0 };
  }
  const url = `${config.baseUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) headers["x-pos-key"] = config.apiKey;
  if (config.accessToken) headers["Authorization"] = `Bearer ${config.accessToken}`;

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
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    return { ok: true, data, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: any) => request<T>("POST", path, body),
  put: <T>(path: string, body?: any) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

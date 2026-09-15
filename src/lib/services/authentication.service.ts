import { api, setApiConfig, getApiConfig } from "@/lib/api/http";
import { signTimestamp } from "@/lib/crypto/ed25519";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

const TOKEN_STORAGE_KEY = "nct-pos-auth-tokens";

let tokens: AuthTokens | null = null;

async function persistTokens(t: AuthTokens | null): Promise<void> {
  try {
    if (t) {
      await AsyncStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(t));
    } else {
      await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch { /* non-blocking */ }
}

async function loadPersistedTokens(): Promise<AuthTokens | null> {
  try {
    const raw = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

export const AuthenticationService = {
  async init(): Promise<void> {
    if (!tokens) {
      tokens = await loadPersistedTokens();
      if (tokens?.accessToken) {
        setApiConfig({ ...getApiConfig(), accessToken: tokens.accessToken });
      }
    }
  },

  async login(privateKeyHex: string, deviceSecret: string): Promise<boolean> {
    try {
      const timestamp = new Date().toISOString();
      const nonce = Math.random().toString(36).substring(2, 10);
      const signature = signTimestamp(privateKeyHex, timestamp, nonce, deviceSecret);

      const res = await api.post<{ accessToken: string; refreshToken: string; expiresIn: number }>(
        "/api/device/auth/login",
        { timestamp, nonce, signature }
      );

      if (!res.ok || !res.data) return false;

      const expiresAt = new Date(Date.now() + res.data.expiresIn * 1000).toISOString();
      tokens = {
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
        expiresAt,
      };

      setApiConfig({ ...getApiConfig(), accessToken: tokens.accessToken });
      await persistTokens(tokens);
      return true;
    } catch {
      return false;
    }
  },

  async refreshToken(): Promise<boolean> {
    try {
      if (!tokens?.refreshToken) return false;

      const res = await api.post<{ accessToken: string; refreshToken: string; expiresIn: number }>(
        "/api/device/auth/refresh",
        { refreshToken: tokens.refreshToken }
      );

      if (!res.ok || !res.data) return false;

      const expiresAt = new Date(Date.now() + res.data.expiresIn * 1000).toISOString();
      tokens = {
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
        expiresAt,
      };

      setApiConfig({ ...getApiConfig(), accessToken: tokens.accessToken });
      await persistTokens(tokens);
      return true;
    } catch {
      return false;
    }
  },

  async logout(): Promise<void> {
    try {
      if (tokens?.accessToken) {
        await api.post("/api/device/auth/logout");
      }
    } finally {
      tokens = null;
      setApiConfig({ ...getApiConfig(), accessToken: undefined });
      await persistTokens(null);
    }
  },

  isAuthenticated(): boolean {
    if (!tokens) return false;
    return new Date(tokens.expiresAt) > new Date();
  },

  getAccessToken(): string | null {
    return tokens?.accessToken ?? null;
  },
};

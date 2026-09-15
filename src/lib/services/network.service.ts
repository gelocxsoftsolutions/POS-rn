import { create } from "zustand";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";

interface NetworkState {
  isOnline: boolean;
  isConnected: boolean | null;
  type: string | null;
}

interface NetworkStore extends NetworkState {
  setNetwork: (state: Partial<NetworkState>) => void;
}

export const useNetworkStore = create<NetworkStore>((set) => ({
  isOnline: true,
  isConnected: null,
  type: null,
  setNetwork: (partial) => set(partial),
}));

let unsubscribe: (() => void) | null = null;

export function startNetworkListener(): void {
  if (unsubscribe) return;

  unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
    const isOnline = state.isConnected === true && state.isInternetReachable !== false;
    useNetworkStore.getState().setNetwork({
      isOnline,
      isConnected: state.isConnected,
      type: state.type,
    });
  });
}

export function stopNetworkListener(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

export async function checkNetwork(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    const isOnline = state.isConnected === true && state.isInternetReachable !== false;
    useNetworkStore.getState().setNetwork({
      isOnline,
      isConnected: state.isConnected,
      type: state.type,
    });
    return isOnline;
  } catch {
    return false;
  }
}

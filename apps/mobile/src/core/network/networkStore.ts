import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { create } from "zustand";

interface NetworkState {
  isConnected: boolean;
  setConnected: (connected: boolean) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  isConnected: true,
  setConnected: (isConnected) => set({ isConnected }),
}));

export function deriveIsConnected(
  state: Pick<NetInfoState, "isConnected" | "isInternetReachable">,
): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

// NetInfo has no synchronous read, so this resolves the real value at
// module load instead of leaving the `true` default assumed until the
// rest of app bootstrap (DB init, auth restore) finishes.
export const networkReady: Promise<boolean> = NetInfo.fetch().then((state) => {
  const connected = deriveIsConnected(state);
  useNetworkStore.getState().setConnected(connected);
  return connected;
});
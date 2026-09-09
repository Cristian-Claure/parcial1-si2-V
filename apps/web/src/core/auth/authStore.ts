import { create } from "zustand";
import type { AuthResponse, LoginRequest, RegisterRequest, UserProfile } from "@velora/contracts";
import { AUTH_STORAGE_KEY } from "../api/apiClient";
import { veloraApi } from "../api/veloraApi";

type AuthStatus = "checking" | "anonymous" | "authenticated";
interface StoredAuth { accessToken: string; user: UserProfile; }
interface AuthState {
  status: AuthStatus; accessToken: string | null; user: UserProfile | null;
  restore: () => Promise<void>; login: (request: LoginRequest) => Promise<UserProfile>;
  register: (request: RegisterRequest) => Promise<UserProfile>; logout: () => void;
  replaceUser: (user: UserProfile) => void;
}

function readStored(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAuth>;
    return typeof parsed.accessToken === "string" && parsed.user ? parsed as StoredAuth : null;
  } catch { return null; }
}
function persist(response: Pick<AuthResponse, "accessToken" | "user">): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ accessToken: response.accessToken, user: response.user }));
}

export const useAuthStore = create<AuthState>((set, get) => {
  const stored = readStored();
  return {
    status: stored ? "checking" : "anonymous", accessToken: stored?.accessToken ?? null, user: stored?.user ?? null,
    restore: async () => {
      const current = readStored();
      if (!current) { set({ status: "anonymous", accessToken: null, user: null }); return; }
      try {
        const user = await veloraApi.me();
        persist({ accessToken: current.accessToken, user });
        set({ status: "authenticated", accessToken: current.accessToken, user });
      } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        set({ status: "anonymous", accessToken: null, user: null });
      }
    },
    login: async (request) => {
      const response = await veloraApi.login(request); persist(response);
      set({ status: "authenticated", accessToken: response.accessToken, user: response.user }); return response.user;
    },
    register: async (request) => {
      const response = await veloraApi.register(request); persist(response);
      set({ status: "authenticated", accessToken: response.accessToken, user: response.user }); return response.user;
    },
    logout: () => { localStorage.removeItem(AUTH_STORAGE_KEY); set({ status: "anonymous", accessToken: null, user: null }); },
    replaceUser: (user) => {
      const token = get().accessToken;
      if (token) persist({ accessToken: token, user });
      set({ user });
    },
  };
});

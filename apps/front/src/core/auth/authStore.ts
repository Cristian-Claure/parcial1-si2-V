import { create } from "zustand";
import type { AuthResponse, LoginRequest, RegisterRequest, UserProfile } from "@velora/contracts";
import { AUTH_STORAGE_KEY, onUnauthorized } from "../api/apiClient";
import { veloraApi } from "../api/veloraApi";
import { webPush } from "../push/webPush";
import { useCompanyStore } from "../company/companyStore";
import { resetStoreTheme } from "../theme/themeScope";

type AuthStatus = "checking" | "anonymous" | "authenticated";
interface StoredAuth { accessToken: string; user: UserProfile; }
interface AuthState {
  status: AuthStatus; accessToken: string | null; user: UserProfile | null;
  restore: () => Promise<void>; login: (request: LoginRequest) => Promise<UserProfile>;
  register: (request: RegisterRequest) => Promise<UserProfile>; logout: () => Promise<void>;
  replaceUser: (user: UserProfile) => void;
  /** true tras un 401: el login muestra "Tu sesión expiró". */
  sessionExpired: boolean;
  /** Cierra la sesión local porque el token venció (sin llamar al backend). */
  expire: () => void;
  /** Adopta una sesión emitida por otro flujo (p. ej. "Crear mi tienda"). */
  adopt: (response: AuthResponse) => void;
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
    status: stored ? "checking" : "anonymous", accessToken: stored?.accessToken ?? null, user: stored?.user ?? null, sessionExpired: false,
    expire: () => { if (!get().user) return; localStorage.removeItem(AUTH_STORAGE_KEY); set({ status: "anonymous", accessToken: null, user: null, sessionExpired: true }); },
    restore: async () => {
      const current = readStored();
      if (!current) { set({ status: "anonymous", accessToken: null, user: null }); return; }
      try {
        const user = await veloraApi.me();
        persist({ accessToken: current.accessToken, user });
        set({ status: "authenticated", accessToken: current.accessToken, user });
        if (user.role === "CUSTOMER") void webPush.syncIfPermissionGranted();
      } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        set({ status: "anonymous", accessToken: null, user: null });
      }
    },
    login: async (request) => {
      const response = await veloraApi.login(request); persist(response);
      set({ status: "authenticated", accessToken: response.accessToken, user: response.user, sessionExpired: false }); if (response.user.role === "CUSTOMER") void webPush.syncIfPermissionGranted(); return response.user;
    },
    register: async (request) => {
      const response = await veloraApi.register(request); persist(response);
      set({ status: "authenticated", accessToken: response.accessToken, user: response.user }); if (response.user.role === "CUSTOMER") void webPush.syncIfPermissionGranted(); return response.user;
    },
    logout: async () => { try { await webPush.revokeForLogout(); } finally { localStorage.removeItem(AUTH_STORAGE_KEY); useCompanyStore.getState().reset(); resetStoreTheme(); set({ status: "anonymous", accessToken: null, user: null, sessionExpired: false }); } },
    adopt: (response) => { persist(response); set({ status: "authenticated", accessToken: response.accessToken, user: response.user }); },
    replaceUser: (user) => {
      const token = get().accessToken;
      if (token) persist({ accessToken: token, user });
      set({ user });
    },
  };
});

onUnauthorized(() => useAuthStore.getState().expire());

import { create } from "zustand";
import type {
  LoginRequest,
  RegisterRequest,
  UserProfile,
} from "@velora/contracts";
import { ApiClientError, onUnauthorized } from "../api/apiClient";
import { veloraApi } from "../api/veloraApi";
import { mobilePush } from "../push/mobilePush";
import { useOwnerStore } from "../company/ownerStore";
import {
  clearSession,
  readSession,
  saveSession,
  saveSessionUser,
} from "./sessionStore";

type AuthStatus = "checking" | "anonymous" | "authenticated";

interface AuthState {
  status: AuthStatus;
  user: UserProfile | null;
  restore: () => Promise<void>;
  login: (request: LoginRequest) => Promise<UserProfile>;
  register: (request: RegisterRequest) => Promise<UserProfile>;
  logout: () => Promise<void>;
  replaceUser: (user: UserProfile) => Promise<void>;
  /** true tras un 401: el login muestra "Tu sesión expiró". */
  sessionExpired: boolean;
  expire: () => Promise<void>;
}

const MOBILE_ROLES = new Set<UserProfile["role"]>(["CUSTOMER", "STORE_MANAGER", "ADMIN", "PLATFORM_ADMIN"]);

/**
 * Fase 4C: el móvil admite clientes, encargados y propietarios. PLATFORM_ADMIN puede iniciar
 * sesión, pero solo ve un aviso para usar la web (/platform-only).
 */
function requireMobileRole(user: UserProfile): void {
  if (!MOBILE_ROLES.has(user.role)) {
    throw new ApiClientError(403, "Esta cuenta no puede usar la aplicación móvil.");
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "checking",
  user: null,
  sessionExpired: false,

  expire: async () => {
    if (!useAuthStore.getState().user) return;
    await clearSession();
    await useOwnerStore.getState().clear();
    set({ status: "anonymous", user: null, sessionExpired: true });
  },

  restore: async () => {
    const stored = await readSession();

    if (!stored) {
      set({ status: "anonymous", user: null });
      return;
    }

    try {
      requireMobileRole(stored.user);
    } catch {
      await clearSession();
      set({ status: "anonymous", user: null });
      return;
    }

    try {
      const user = await veloraApi.me();
      requireMobileRole(user);
      await saveSessionUser(user);
      set({ status: "authenticated", user });
      if (user.role === "CUSTOMER") void mobilePush.syncIfPermissionGranted();
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 0) {
        set({ status: "authenticated", user: stored.user });
        return;
      }

      await clearSession();
      set({ status: "anonymous", user: null });
    }
  },

  login: async (request) => {
    const response = await veloraApi.login(request);
    requireMobileRole(response.user);
    await saveSession(response);
    set({ status: "authenticated", user: response.user, sessionExpired: false });
    if (response.user.role === "CUSTOMER") void mobilePush.syncIfPermissionGranted();
    return response.user;
  },

  register: async (request) => {
    const response = await veloraApi.register(request);
    requireMobileRole(response.user);
    await saveSession(response);
    set({ status: "authenticated", user: response.user });
    if (response.user.role === "CUSTOMER") void mobilePush.syncIfPermissionGranted();
    return response.user;
  },

  logout: async () => {
    try { await mobilePush.revokeForLogout(); } finally {
      await clearSession();
      await useOwnerStore.getState().clear();
      set({ status: "anonymous", user: null });
    }
  },

  replaceUser: async (user) => {
    requireMobileRole(user);
    await saveSessionUser(user);
    set({ user });
  },
}));

onUnauthorized(() => void useAuthStore.getState().expire());

import { create } from "zustand";
import type {
  LoginRequest,
  RegisterRequest,
  UserProfile,
} from "@velora/contracts";
import { ApiClientError } from "../api/apiClient";
import { veloraApi } from "../api/veloraApi";
import { mobilePush } from "../push/mobilePush";
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
}

function requireCustomer(user: UserProfile): void {
  if (user.role !== "CUSTOMER") {
    throw new ApiClientError(
      403,
      "La aplicación móvil de cliente no admite cuentas administrativas.",
    );
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "checking",
  user: null,

  restore: async () => {
    const stored = await readSession();

    if (!stored) {
      set({ status: "anonymous", user: null });
      return;
    }

    try {
      requireCustomer(stored.user);
    } catch {
      await clearSession();
      set({ status: "anonymous", user: null });
      return;
    }

    try {
      const user = await veloraApi.me();
      requireCustomer(user);
      await saveSessionUser(user);
      set({ status: "authenticated", user });
      void mobilePush.syncIfPermissionGranted();
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
    requireCustomer(response.user);
    await saveSession(response);
    set({ status: "authenticated", user: response.user });
    void mobilePush.syncIfPermissionGranted();
    return response.user;
  },

  register: async (request) => {
    const response = await veloraApi.register(request);
    requireCustomer(response.user);
    await saveSession(response);
    set({ status: "authenticated", user: response.user });
    void mobilePush.syncIfPermissionGranted();
    return response.user;
  },

  logout: async () => {
    try { await mobilePush.revokeForLogout(); } finally {
      await clearSession();
      set({ status: "anonymous", user: null });
    }
  },

  replaceUser: async (user) => {
    requireCustomer(user);
    await saveSessionUser(user);
    set({ user });
  },
}));
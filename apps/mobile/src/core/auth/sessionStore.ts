import * as SecureStore from "expo-secure-store";
import type { AuthResponse, UserProfile } from "@velora/contracts";

const TOKEN_KEY = "velora.mobile.access-token.v1";
const USER_KEY = "velora.mobile.user.v1";

let cachedToken: string | null | undefined;

export interface PersistedSession {
  accessToken: string;
  user: UserProfile;
}

export async function readSession(): Promise<PersistedSession | null> {
  const [accessToken, userJson] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    SecureStore.getItemAsync(USER_KEY),
  ]);

  cachedToken = accessToken;

  if (!accessToken || !userJson) {
    return null;
  }

  try {
    const user = JSON.parse(userJson) as UserProfile;
    if (!user?.id || !user.email || !user.role) {
      return null;
    }
    return { accessToken, user };
  } catch {
    return null;
  }
}

export async function getAccessToken(): Promise<string | null> {
  if (cachedToken !== undefined) {
    return cachedToken;
  }
  cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  return cachedToken;
}

export async function saveSession(
  response: Pick<AuthResponse, "accessToken" | "user">,
): Promise<void> {
  cachedToken = response.accessToken;
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, response.accessToken),
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(response.user)),
  ]);
}

export async function saveSessionUser(user: UserProfile): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function clearSession(): Promise<void> {
  cachedToken = null;
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
  ]);
}
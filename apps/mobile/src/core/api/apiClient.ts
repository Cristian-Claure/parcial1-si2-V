import { Platform } from "react-native";
import type { ApiError } from "@velora/contracts";
import { getAccessToken } from "../auth/sessionStore";

export class ApiClientError extends Error {
  readonly status: number;
  readonly errors: Record<string, string>;

  constructor(
    status: number,
    message: string,
    errors: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.errors = errors;
  }
}

const defaultBaseUrl =
  Platform.OS === "android"
    ? "http://10.0.2.2:8080"
    : "http://127.0.0.1:8080";

export const apiBaseUrl = (
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || defaultBaseUrl
).replace(/\/$/, "");

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (auth) {
    const token = await getAccessToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers,
    });
  } catch {
    throw new ApiClientError(0, "No hay conexión con el servidor.");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? (await response.json()) as unknown
    : await response.text();

  if (!response.ok) {
    const candidate = payload as Partial<ApiError> | null;
    const message =
      candidate &&
      typeof candidate === "object" &&
      typeof candidate.message === "string"
        ? candidate.message
        : `La solicitud falló (${response.status}).`;

    const errors =
      candidate &&
      typeof candidate === "object" &&
      candidate.errors
        ? candidate.errors
        : {};

    throw new ApiClientError(response.status, message, errors);
  }

  return payload as T;
}

export const jsonBody = (value: unknown): string => JSON.stringify(value);

export function isConnectivityError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 0;
}
import { Platform } from "react-native";
import type { ApiError } from "@velora/contracts";
import { getAccessToken } from "../auth/sessionStore";

export class ApiClientError extends Error {
  readonly status: number;
  readonly errors: Record<string, string>;
  /** Código estable del backend (p. ej. PLAN_LIMIT_TRY_ON). */
  readonly code: string | null;
  readonly details: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    errors: Record<string, string> = {},
    code: string | null = null,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.errors = errors;
    this.code = code;
    this.details = details;
  }
}

const defaultBaseUrl =
  Platform.OS === "android"
    ? "http://10.0.2.2:8080"
    : "http://127.0.0.1:8080";

export const apiBaseUrl = (
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || defaultBaseUrl
).replace(/\/$/, "");

/** Sesión vencida (401 en una solicitud autenticada): la registra el authStore. */
let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(handler: (() => void) | null): void { unauthorizedHandler = handler; }

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers = new Headers(init.headers);

  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set(
      "Content-Type",
      "application/json",
    );
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
    if (response.status === 401 && auth && headers.has("Authorization")) unauthorizedHandler?.();
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

    throw new ApiClientError(
      response.status,
      message,
      errors,
      candidate && typeof candidate === "object" && typeof candidate.code === "string" ? candidate.code : null,
      candidate && typeof candidate === "object" && candidate.details ? candidate.details : {},
    );
  }

  return payload as T;
}

export const jsonBody = (value: unknown): string => JSON.stringify(value);

export function isConnectivityError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 0;
}

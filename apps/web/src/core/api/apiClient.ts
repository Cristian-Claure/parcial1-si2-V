import type { ApiError } from "@velora/contracts";

export const AUTH_STORAGE_KEY = "velora.auth.v2";

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

export const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL?.trim() ||
  "http://127.0.0.1:8080"
).replace(/\/$/, "");

export function storedAccessToken(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as {
      accessToken?: unknown;
    };

    return typeof parsed.accessToken === "string"
      ? parsed.accessToken
      : null;
  }
  catch {
    return null;
  }
}

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
    const token = storedAccessToken();

    if (token) {
      headers.set(
        "Authorization",
        `Bearer ${token}`,
      );
    }
  }

  let response: Response;

  try {
    response = await fetch(
      `${apiBaseUrl}${path}`,
      {
        ...init,
        headers,
      },
    );
  }
  catch {
    throw new ApiClientError(
      0,
      "No hay conexión con el servidor.",
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType =
    response.headers.get("content-type") ?? "";

  const responsePayload =
    contentType.includes("application/json")
      ? await response.json() as unknown
      : await response.text();

  if (!response.ok) {
    const candidate =
      responsePayload as Partial<ApiError> | null;

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
    );
  }

  return responsePayload as T;
}

export const jsonBody = (
  value: unknown,
): string =>
  JSON.stringify(value);

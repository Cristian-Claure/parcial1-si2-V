import type { ApiError } from "@velora/contracts";

export const AUTH_STORAGE_KEY = "velora.auth.v2";

export class ApiClientError extends Error {
  readonly status: number;
  readonly errors: Record<string, string>;
  /** Código estable del backend (p. ej. PLAN_LIMIT_STORES). */
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

function authHeaders(
  initHeaders?: HeadersInit,
): Headers {
  const headers = new Headers(initHeaders);
  const token = storedAccessToken();

  if (token) {
    headers.set(
      "Authorization",
      `Bearer ${token}`,
    );
  }

  return headers;
}

async function responseError(
  response: Response,
): Promise<ApiClientError> {
  const contentType =
    response.headers.get("content-type") ?? "";

  let payload: unknown = null;

  try {
    payload = contentType.includes("application/json")
      ? await response.json() as unknown
      : await response.text();
  }
  catch {
    payload = null;
  }

  const candidate =
    payload as Partial<ApiError> | null;

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

  return new ApiClientError(
    response.status,
    message,
    errors,
    candidate && typeof candidate === "object" && typeof candidate.code === "string" ? candidate.code : null,
    candidate && typeof candidate === "object" && candidate.details ? candidate.details : {},
  );
}

/** Sesión vencida (401 en una solicitud autenticada): la registra el authStore. */
let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(handler: (() => void) | null): void { unauthorizedHandler = handler; }

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers = auth
    ? authHeaders(init.headers)
    : new Headers(init.headers);

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

  if (!response.ok) {
    if (response.status === 401 && auth && storedAccessToken()) unauthorizedHandler?.();
    throw await responseError(
      response,
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

  return responsePayload as T;
}

export async function apiBlobRequest(
  path: string,
  init: RequestInit = {},
): Promise<Blob> {
  let response: Response;

  try {
    response = await fetch(
      `${apiBaseUrl}${path}`,
      {
        ...init,
        headers:
          authHeaders(init.headers),
      },
    );
  }
  catch {
    throw new ApiClientError(
      0,
      "No hay conexión con el servidor.",
    );
  }

  if (!response.ok) {
    throw await responseError(
      response,
    );
  }

  return response.blob();
}

export const jsonBody = (
  value: unknown,
): string =>
  JSON.stringify(value);

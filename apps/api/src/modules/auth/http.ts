import type {
  ServerRuntimeConfig,
} from "@velora/config";

import type {
  ApiError,
} from "@velora/contracts";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  ZodError,
} from "zod";

export class ApiHttpError
  extends Error {
  readonly status:
    number;

  readonly errors:
    Record<
      string,
      string
    >;

  constructor(
    status: number,
    message: string,
    errors:
      Record<
        string,
        string
      > = {},
  ) {
    super(message);

    this.name =
      "ApiHttpError";

    this.status =
      status;

    this.errors =
      errors;
  }
}

export function validationApiError(
  error: ZodError,
): ApiHttpError {
  const errors:
    Record<
      string,
      string
    > = {};

  for (
    const issue of error.issues
  ) {
    const path =
      issue.path[0];

    const field =
      typeof path === "string"
        ? path
        : "request";

    if (
      errors[field] === undefined
    ) {
      errors[field] =
        issue.message;
    }
  }

  return new ApiHttpError(
    400,
    "Revise los datos ingresados.",
    errors,
  );
}

export async function readRequestJson(
  request: NextRequest,
): Promise<unknown> {
  try {
    return await request.json();
  }
  catch {
    throw new ApiHttpError(
      400,
      "Revise los datos ingresados.",
    );
  }
}

function corsOrigins(
  config: ServerRuntimeConfig,
): string[] {
  return config
    .VELORA_CORS_ALLOWED_ORIGINS
    .split(",")
    .map(
      (origin) =>
        origin.trim(),
    )
    .filter(
      (origin) =>
        origin.length > 0,
    );
}

export function withCors(
  response: NextResponse,
  request: NextRequest,
  config: ServerRuntimeConfig,
): NextResponse {
  const origin =
    request.headers.get(
      "origin",
    );

  if (
    origin &&
    corsOrigins(
      config,
    ).includes(
      origin,
    )
  ) {
    response.headers.set(
      "Access-Control-Allow-Origin",
      origin,
    );

    response.headers.set(
      "Access-Control-Allow-Credentials",
      "true",
    );

    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );

    response.headers.set(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type",
    );

    response.headers.append(
      "Vary",
      "Origin",
    );
  }

  return response;
}

export function preflightResponse(
  request: NextRequest,
  config: ServerRuntimeConfig,
): NextResponse {
  return withCors(
    new NextResponse(
      null,
      {
        status: 204,
      },
    ),
    request,
    config,
  );
}

export function apiErrorResponse(
  error: unknown,
  request: NextRequest,
  config:
    ServerRuntimeConfig |
    undefined,
): NextResponse {
  let status =
    500;

  let message =
    "No se pudo completar la solicitud.";

  let errors:
    Record<
      string,
      string
    > = {};

  if (
    error instanceof ApiHttpError
  ) {
    status =
      error.status;

    message =
      error.message;

    errors =
      error.errors;
  }

  const body: ApiError = {
    timestamp:
      new Date().toISOString(),

    status,

    message,

    errors,
  };

  const response =
    NextResponse.json(
      body,
      {
        status,
      },
    );

  if (!config) {
    return response;
  }

  return withCors(
    response,
    request,
    config,
  );
}

export function rateLimitResponse(
  retryAfterSeconds: number,
  request: NextRequest,
  config: ServerRuntimeConfig,
): NextResponse {
  const response =
    NextResponse.json(
      {
        message:
          "Demasiadas solicitudes. Intente nuevamente en unos segundos.",
      },
      {
        status: 429,
      },
    );

  response.headers.set(
    "Retry-After",
    String(
      retryAfterSeconds,
    ),
  );

  return withCors(
    response,
    request,
    config,
  );
}
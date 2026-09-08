import {
  compare,
  hash,
} from "bcryptjs";

import type {
  ServerRuntimeConfig,
} from "@velora/config";

import {
  userRoleSchema,
  type AuthResponse,
  type UserProfile,
  type UserRole,
} from "@velora/contracts";

import {
  SignJWT,
  jwtVerify,
} from "jose";

import type {
  NextRequest,
} from "next/server";

import {
  ApiHttpError,
} from "./http";

const JWT_ISSUER =
  "velora";

const JWT_ALGORITHM =
  "HS256";

const BCRYPT_ROUNDS =
  10;

export interface AuthPrincipal {
  userId:
    string;

  email:
    string |
    null;

  role:
    UserRole;

  name:
    string |
    null;
}

function jwtSecret(
  config: ServerRuntimeConfig,
): Uint8Array {
  const secret =
    new TextEncoder().encode(
      config.VELORA_JWT_SECRET,
    );

  if (
    secret.byteLength < 32
  ) {
    throw new Error(
      "VELORA_JWT_SECRET debe tener al menos 32 bytes.",
    );
  }

  return secret;
}

export async function hashPassword(
  password: string,
): Promise<string> {
  return hash(
    password,
    BCRYPT_ROUNDS,
  );
}

export async function passwordMatches(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return compare(
    password,
    passwordHash,
  );
}

export async function issueAuthToken(
  user: UserProfile,
  config: ServerRuntimeConfig,
): Promise<AuthResponse> {
  const expiresInSeconds =
    config
      .VELORA_JWT_EXPIRATION_MINUTES *
    60;

  const issuedAt =
    Math.floor(
      Date.now() / 1000,
    );

  const token =
    await new SignJWT({
      email:
        user.email,

      role:
        user.role,

      name:
        `${user.firstName} ${user.lastName}`,
    })
      .setProtectedHeader({
        alg:
          JWT_ALGORITHM,
      })
      .setIssuer(
        JWT_ISSUER,
      )
      .setIssuedAt(
        issuedAt,
      )
      .setExpirationTime(
        issuedAt +
        expiresInSeconds,
      )
      .setSubject(
        user.id,
      )
      .sign(
        jwtSecret(
          config,
        ),
      );

  return {
    accessToken:
      token,

    expiresInSeconds,

    user,
  };
}

export async function verifyAccessToken(
  token: string,
  config: ServerRuntimeConfig,
): Promise<AuthPrincipal> {
  try {
    const {
      payload,
    } = await jwtVerify(
      token,
      jwtSecret(
        config,
      ),
      {
        issuer:
          JWT_ISSUER,

        algorithms: [
          JWT_ALGORITHM,
        ],
      },
    );

    const subject =
      payload.sub;

    if (
      typeof subject !== "string" ||
      subject.length === 0
    ) {
      throw new Error(
        "JWT subject invalido.",
      );
    }

    const roleResult =
      userRoleSchema.safeParse(
        payload.role,
      );

    if (
      !roleResult.success
    ) {
      throw new Error(
        "JWT role invalido.",
      );
    }

    return {
      userId:
        subject,

      email:
        typeof payload.email ===
        "string"
          ? payload.email
          : null,

      role:
        roleResult.data,

      name:
        typeof payload.name ===
        "string"
          ? payload.name
          : null,
    };
  }
  catch {
    throw new ApiHttpError(
      401,
      "No autenticado.",
    );
  }
}

export async function requireAuthPrincipal(
  request: NextRequest,
  config: ServerRuntimeConfig,
): Promise<AuthPrincipal> {
  const authorization =
    request.headers.get(
      "authorization",
    );

  if (
    !authorization ||
    !authorization.startsWith(
      "Bearer ",
    )
  ) {
    throw new ApiHttpError(
      401,
      "No autenticado.",
    );
  }

  const token =
    authorization
      .slice(
        "Bearer ".length,
      )
      .trim();

  if (
    token.length === 0
  ) {
    throw new ApiHttpError(
      401,
      "No autenticado.",
    );
  }

  return verifyAccessToken(
    token,
    config,
  );
}

interface RateWindow {
  startedAt:
    number;

  count:
    number;
}

export interface RateLimitDecision {
  allowed:
    boolean;

  retryAfterSeconds:
    number;
}

const authRateWindows =
  new Map<
    string,
    RateWindow
  >();

let rateRequestCounter =
  0;

function requestClientKey(
  request: NextRequest,
  config: ServerRuntimeConfig,
): string {
  if (
    config
      .VELORA_RATE_LIMIT_TRUST_PROXY_HEADERS
  ) {
    const forwardedFor =
      request.headers.get(
        "x-forwarded-for",
      );

    if (
      forwardedFor &&
      forwardedFor.trim()
    ) {
      return (
        forwardedFor
          .split(",")[0]
          ?.trim() ||
        "unknown"
      );
    }
  }

  return "direct";
}

function cleanupRateWindows(
  now: number,
  windowSeconds: number,
): void {
  rateRequestCounter += 1;

  if (
    rateRequestCounter %
      256 !==
    0
  ) {
    return;
  }

  const cutoff =
    now -
    windowSeconds *
      2;

  for (
    const [
      key,
      value,
    ] of authRateWindows
  ) {
    if (
      value.startedAt <
      cutoff
    ) {
      authRateWindows.delete(
        key,
      );
    }
  }
}

export function registerAuthRateAttempt(
  request: NextRequest,
  config: ServerRuntimeConfig,
): RateLimitDecision {
  const now =
    Math.floor(
      Date.now() / 1000,
    );

  const windowSeconds =
    config
      .VELORA_AUTH_RATE_LIMIT_WINDOW_SECONDS;

  const maxRequests =
    config
      .VELORA_AUTH_RATE_LIMIT_MAX_REQUESTS;

  const key =
    `AUTH:${requestClientKey(
      request,
      config,
    )}`;

  const current =
    authRateWindows.get(
      key,
    );

  if (
    !current ||
    now -
      current.startedAt >=
      windowSeconds
  ) {
    authRateWindows.set(
      key,
      {
        startedAt:
          now,

        count:
          1,
      },
    );

    cleanupRateWindows(
      now,
      windowSeconds,
    );

    return {
      allowed:
        true,

      retryAfterSeconds:
        0,
    };
  }

  const count =
    current.count +
    1;

  authRateWindows.set(
    key,
    {
      startedAt:
        current.startedAt,

      count,
    },
  );

  const retryAfterSeconds =
    Math.max(
      1,
      windowSeconds -
        (
          now -
          current.startedAt
        ),
    );

  cleanupRateWindows(
    now,
    windowSeconds,
  );

  return {
    allowed:
      count <=
      maxRequests,

    retryAfterSeconds,
  };
}
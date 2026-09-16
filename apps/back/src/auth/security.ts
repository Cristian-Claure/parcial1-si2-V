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

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

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
  config:
    ServerRuntimeConfig,
): Uint8Array {
  const secret =
    new TextEncoder()
      .encode(
        config
          .VELORA_JWT_SECRET,
      );

  if (
    secret.byteLength <
    32
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
  config:
    ServerRuntimeConfig,
): Promise<AuthResponse> {
  const expiresInSeconds =
    config
      .VELORA_JWT_EXPIRATION_MINUTES *
    60;

  const issuedAt =
    Math.floor(
      Date.now() /
      1000,
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
  config:
    ServerRuntimeConfig,
): Promise<AuthPrincipal> {
  try {
    const {
      payload,
    } =
      await jwtVerify(
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
      typeof subject !==
        "string" ||
      subject.length ===
        0
    ) {
      throw new Error(
        "JWT subject invalido.",
      );
    }

    const roleResult =
      userRoleSchema.safeParse(
        payload.role,
      );

    if (!roleResult.success) {
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
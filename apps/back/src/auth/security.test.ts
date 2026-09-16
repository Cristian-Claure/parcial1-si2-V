import {
  parseServerRuntimeConfig,
} from "@velora/config";

import {
  registerRequestSchema,
  type UserProfile,
} from "@velora/contracts";

import {
  decodeProtectedHeader,
} from "jose";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  hashPassword,
  issueAuthToken,
  passwordMatches,
  verifyAccessToken,
} from "./security.js";

const config =
  parseServerRuntimeConfig({
    DATABASE_URL:
      "postgresql://velora:test@localhost:55432/velora_db",

    VELORA_JWT_SECRET:
      "0123456789abcdef0123456789abcdef",

    VELORA_JWT_EXPIRATION_MINUTES:
      "120",

    VELORA_CORS_ALLOWED_ORIGINS:
      "http://localhost:5173",

    VELORA_AUTH_RATE_LIMIT_MAX_REQUESTS:
      "10",

    VELORA_AUTH_RATE_LIMIT_WINDOW_SECONDS:
      "60",

    VELORA_RATE_LIMIT_TRUST_PROXY_HEADERS:
      "false",
  });

const user:
  UserProfile = {
  id:
    "11111111-1111-4111-8111-111111111111",

  firstName:
    "Cliente",

  lastName:
    "Prueba",

  email:
    "cliente@example.com",

  role:
    "CUSTOMER",

  customerType:
    "B2C",

  phone:
    null,

  businessName:
    null,

  taxId:
    null,

  status:
    "ACTIVE",

  storeId:
    null,

  storeName:
    null,
};

describe(
  "auth legacy parity",
  () => {
    it(
      "preserves registration password policy",
      () => {
        expect(
          registerRequestSchema
            .safeParse({
              firstName:
                "Cliente",

              lastName:
                "Prueba",

              email:
                "cliente@example.com",

              password:
                "Password1",
            })
            .success,
        ).toBe(
          true,
        );

        expect(
          registerRequestSchema
            .safeParse({
              firstName:
                "Cliente",

              lastName:
                "Prueba",

              email:
                "cliente@example.com",

              password:
                "password",
            })
            .success,
        ).toBe(
          false,
        );
      },
    );

    it(
      "uses bcrypt compatible hashes",
      async () => {
        const passwordHash =
          await hashPassword(
            "Password1",
          );

        expect(
          passwordHash.startsWith(
            "$2",
          ),
        ).toBe(
          true,
        );

        await expect(
          passwordMatches(
            "Password1",
            passwordHash,
          ),
        ).resolves.toBe(
          true,
        );

        await expect(
          passwordMatches(
            "WrongPassword1",
            passwordHash,
          ),
        ).resolves.toBe(
          false,
        );
      },
    );

    it(
      "issues HS256 JWT with legacy claims",
      async () => {
        const response =
          await issueAuthToken(
            user,
            config,
          );

        expect(
          response
            .expiresInSeconds,
        ).toBe(
          7200,
        );

        expect(
          decodeProtectedHeader(
            response
              .accessToken,
          ).alg,
        ).toBe(
          "HS256",
        );

        const principal =
          await verifyAccessToken(
            response
              .accessToken,
            config,
          );

        expect(
          principal.userId,
        ).toBe(
          user.id,
        );

        expect(
          principal.email,
        ).toBe(
          user.email,
        );

        expect(
          principal.role,
        ).toBe(
          "CUSTOMER",
        );

        expect(
          principal.name,
        ).toBe(
          "Cliente Prueba",
        );
      },
    );
  },
);
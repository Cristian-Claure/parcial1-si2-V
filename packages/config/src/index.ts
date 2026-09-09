import {
  z,
} from "zod";

function positiveIntegerFromEnv(
  fallback: number,
) {
  return z.preprocess(
    (value) => {
      if (
        value === undefined ||
        value === null ||
        value === ""
      ) {
        return fallback;
      }

      if (
        typeof value === "number"
      ) {
        return value;
      }

      return Number(value);
    },
    z
      .number()
      .int()
      .positive(),
  );
}

function booleanFromEnv(
  fallback: boolean,
) {
  return z.preprocess(
    (value) => {
      if (
        value === undefined ||
        value === null ||
        value === ""
      ) {
        return fallback;
      }

      if (
        typeof value === "boolean"
      ) {
        return value;
      }

      if (
        typeof value === "string"
      ) {
        const normalized =
          value
            .trim()
            .toLowerCase();

        if (
          normalized === "true"
        ) {
          return true;
        }

        if (
          normalized === "false"
        ) {
          return false;
        }
      }

      return value;
    },
    z.boolean(),
  );
}

export const serverRuntimeConfigSchema =
  z.object({
    DATABASE_URL:
      z
        .string()
        .min(1),

    VELORA_JWT_SECRET:
      z
        .string()
        .min(32),

    VELORA_JWT_EXPIRATION_MINUTES:
      positiveIntegerFromEnv(
        120,
      ),

    VELORA_CORS_ALLOWED_ORIGINS:
      z
        .string()
        .min(1)
        .default(
          "http://localhost:5173,http://127.0.0.1:5173",
        ),

    VELORA_AUTH_RATE_LIMIT_MAX_REQUESTS:
      positiveIntegerFromEnv(
        10,
      ),

    VELORA_AUTH_RATE_LIMIT_WINDOW_SECONDS:
      positiveIntegerFromEnv(
        60,
      ),

    VELORA_RATE_LIMIT_TRUST_PROXY_HEADERS:
      booleanFromEnv(
        false,
      ),

    STRIPE_SECRET_KEY:
      z
        .string()
        .optional(),

    STRIPE_WEBHOOK_SECRET:
      z
        .string()
        .optional(),

    STRIPE_SUCCESS_URL:
      z
        .string()
        .min(1)
        .default(
          "http://localhost:5173/pago/stripe/retorno",
        ),

    STRIPE_CANCEL_URL:
      z
        .string()
        .min(1)
        .default(
          "http://localhost:5173/mis-pedidos",
        ),

    OPENAI_API_KEY:
      z
        .string()
        .optional(),

    REPLICATE_API_TOKEN:
      z
        .string()
        .optional(),
  });

export type ServerRuntimeConfig =
  z.infer<
    typeof serverRuntimeConfigSchema
  >;

export function parseServerRuntimeConfig(
  env:
    Record<
      string,
      string | undefined
    >,
): ServerRuntimeConfig {
  return serverRuntimeConfigSchema.parse(
    env,
  );
}
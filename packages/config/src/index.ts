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

function optionalStringFromEnv() {
  return z.preprocess(
    (value) => {
      if (
        typeof value === "string" &&
        value.trim() === ""
      ) {
        return undefined;
      }

      return value;
    },
    z
      .string()
      .trim()
      .min(1)
      .optional(),
  );
}

function optionalSecretFromEnv() {
  return z.preprocess(
    (value) => {
      if (
        typeof value === "string" &&
        value.trim() === ""
      ) {
        return undefined;
      }

      return value;
    },
    z
      .string()
      .min(1)
      .optional(),
  );
}

function optionalHttpUrlFromEnv() {
  return z.preprocess(
    (value) => {
      if (
        typeof value === "string" &&
        value.trim() === ""
      ) {
        return undefined;
      }

      return value;
    },
    z
      .string()
      .url()
      .regex(
        /^https?:\/\//,
        "La URL debe usar http o https.",
      )
      .optional(),
  );
}

function httpUrlFromEnv(
  fallback: string,
) {
  return z.preprocess(
    (value) => {
      if (
        value === undefined ||
        value === null ||
        (
          typeof value === "string" &&
          value.trim() === ""
        )
      ) {
        return fallback;
      }

      return value;
    },
    z
      .string()
      .url()
      .regex(
        /^https?:\/\//,
        "La URL debe usar http o https.",
      ),
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
      optionalStringFromEnv(),

    STRIPE_WEBHOOK_SECRET:
      optionalStringFromEnv(),

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

    VELORA_PUBLIC_BACKEND_URL:
      httpUrlFromEnv(
        "http://127.0.0.1:8080",
      ),

    OPENAI_API_KEY:
      optionalStringFromEnv(),

    VELORA_AI_MODEL:
      z.preprocess(
        (value) =>
          typeof value === "string" &&
          value.trim() !== ""
            ? value.trim()
            : "gpt-5.6-luna",
        z.string().min(1),
      ),

    VELORA_AI_TRANSCRIBE_MODEL:
      z.preprocess(
        (value) =>
          typeof value === "string" &&
          value.trim() !== ""
            ? value.trim()
            : "gpt-4o-mini-transcribe",
        z.string().min(1),
      ),
    VELORA_AI_MAX_CATALOG_PRODUCTS:
      positiveIntegerFromEnv(
        120,
      ),

    VELORA_OPENAI_BASE_URL:
      httpUrlFromEnv(
        "https://api.openai.com/v1",
      ),

    REPLICATE_API_TOKEN:
      optionalStringFromEnv(),

    VELORA_REPLICATE_BASE_URL:
      httpUrlFromEnv(
        "https://api.replicate.com/v1",
      ),

    VELORA_TRYON_PROVIDER:
      z.preprocess(
        (value) =>
          typeof value === "string" &&
          value.trim() !== ""
            ? value.trim().toUpperCase()
            : "LOCAL",
        z.enum([
          "LOCAL",
          "REPLICATE",
        ]),
      ),

    VELORA_TRYON_LOCAL_URL:
      optionalHttpUrlFromEnv(),

    VELORA_TRYON_LOCAL_MODEL:
      optionalStringFromEnv(),

    VELORA_TRYON_REPLICATE_MODEL:
      z.preprocess(
        (value) =>
          typeof value === "string" &&
          value.trim() !== ""
            ? value.trim()
            : "prunaai/p-image-try-on",
        z.string().min(3),
      ),

    VELORA_TRYON_MAX_INPUT_BYTES:
      positiveIntegerFromEnv(
        5 * 1024 * 1024,
      ),

    VELORA_TRYON_PROVIDER_TIMEOUT_SECONDS:
      positiveIntegerFromEnv(
        30,
      ),

    VELORA_TRYON_RESULT_MAX_BYTES:
      positiveIntegerFromEnv(
        12 * 1024 * 1024,
      ),

    VELORA_ASSET_STORAGE_PROVIDER:
      z.preprocess(
        (value) =>
          typeof value === "string" &&
          value.trim() !== ""
            ? value.trim().toUpperCase()
            : "LOCAL",
        z.enum([
          "LOCAL",
          "AZURE_BLOB",
        ]),
      ),

    VELORA_ASSET_LOCAL_DIR:
      z.preprocess(
        (value) =>
          typeof value === "string" &&
          value.trim() !== ""
            ? value.trim()
            : "./storage/assets",
        z.string().min(1),
      ),

    AZURE_STORAGE_CONNECTION_STRING:
      optionalStringFromEnv(),

    VELORA_PUSH_FIREBASE_ENABLED:
      booleanFromEnv(false),

    FIREBASE_PROJECT_ID:
      optionalStringFromEnv(),

    FIREBASE_CLIENT_EMAIL:
      optionalStringFromEnv(),

    FIREBASE_PRIVATE_KEY:
      optionalStringFromEnv(),

    BOOTSTRAP_ADMIN_ENABLED:
      booleanFromEnv(
        false,
      ),

    BOOTSTRAP_ADMIN_EMAIL:
      z.preprocess(
        (value) =>
          typeof value === "string" &&
          value.trim() === ""
            ? undefined
            : value,
        z
          .string()
          .trim()
          .email()
          .max(180)
          .optional(),
      ),

    BOOTSTRAP_ADMIN_PASSWORD:
      optionalSecretFromEnv(),

    BOOTSTRAP_ADMIN_FIRST_NAME:
      z.preprocess(
        (value) =>
          typeof value === "string" &&
          value.trim() !== ""
            ? value.trim()
            : "Admin",
        z
          .string()
          .min(1)
          .max(80),
      ),

    BOOTSTRAP_ADMIN_LAST_NAME:
      z.preprocess(
        (value) =>
          typeof value === "string" &&
          value.trim() !== ""
            ? value.trim()
            : "Velora",
        z
          .string()
          .min(1)
          .max(100),
      ),

    VELORA_AZURE_BLOB_CONTAINER:
      z.preprocess(
        (value) =>
          typeof value === "string" &&
          value.trim() !== ""
            ? value.trim().toLowerCase()
            : "velora-assets",
        z
          .string()
          .min(3)
          .max(63)
          .regex(
            /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
            "El nombre del contenedor Azure Blob es inválido.",
          ),
      ),
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

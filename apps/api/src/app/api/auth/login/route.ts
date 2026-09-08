import {
  parseServerRuntimeConfig,
  type ServerRuntimeConfig,
} from "@velora/config";

import {
  loginRequestSchema,
} from "@velora/contracts";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  login,
} from "@/modules/auth/auth.service";

import {
  apiErrorResponse,
  preflightResponse,
  rateLimitResponse,
  readRequestJson,
  validationApiError,
  withCors,
} from "@/modules/auth/http";

import {
  registerAuthRateAttempt,
} from "@/modules/auth/security";

export const runtime =
  "nodejs";

export async function OPTIONS(
  request: NextRequest,
) {
  let config:
    ServerRuntimeConfig |
    undefined;

  try {
    config =
      parseServerRuntimeConfig(
        process.env,
      );

    return preflightResponse(
      request,
      config,
    );
  }
  catch (error) {
    return apiErrorResponse(
      error,
      request,
      config,
    );
  }
}

export async function POST(
  request: NextRequest,
) {
  let config:
    ServerRuntimeConfig |
    undefined;

  try {
    config =
      parseServerRuntimeConfig(
        process.env,
      );

    const decision =
      registerAuthRateAttempt(
        request,
        config,
      );

    if (
      !decision.allowed
    ) {
      return rateLimitResponse(
        decision
          .retryAfterSeconds,
        request,
        config,
      );
    }

    const json =
      await readRequestJson(
        request,
      );

    const parsed =
      loginRequestSchema
        .safeParse(
          json,
        );

    if (
      !parsed.success
    ) {
      throw validationApiError(
        parsed.error,
      );
    }

    const response =
      await login(
        parsed.data,
        config,
      );

    return withCors(
      NextResponse.json(
        response,
      ),
      request,
      config,
    );
  }
  catch (error) {
    return apiErrorResponse(
      error,
      request,
      config,
    );
  }
}
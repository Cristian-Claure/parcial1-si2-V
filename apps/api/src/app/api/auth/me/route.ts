import {
  parseServerRuntimeConfig,
  type ServerRuntimeConfig,
} from "@velora/config";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  profile,
} from "@/modules/auth/auth.service";

import {
  apiErrorResponse,
  preflightResponse,
  withCors,
} from "@/modules/auth/http";

import {
  requireAuthPrincipal,
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

export async function GET(
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

    const principal =
      await requireAuthPrincipal(
        request,
        config,
      );

    const response =
      await profile(
        principal.userId,
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
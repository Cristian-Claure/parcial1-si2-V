import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";

import {
  RuntimeConfigService,
} from "../common/config/runtime-config.service.js";

import type {
  AuthenticatedRequest,
} from "../common/http/authenticated-request.js";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import {
  verifyAccessToken,
} from "./security.js";

function authorizationHeader(
  request:
    AuthenticatedRequest,
): string | null {
  const value =
    request
      .headers
      .authorization;

  if (
    Array.isArray(
      value,
    )
  ) {
    return value[0] ?? null;
  }

  return (
    typeof value ===
    "string"
      ? value
      : null
  );
}

@Injectable()
export class BearerAuthGuard
  implements CanActivate {
  constructor(
    private readonly config:
      RuntimeConfigService,
  ) {}

  async canActivate(
    context:
      ExecutionContext,
  ): Promise<boolean> {
    const request =
      context
        .switchToHttp()
        .getRequest<
          AuthenticatedRequest
        >();

    const authorization =
      authorizationHeader(
        request,
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
      token.length ===
      0
    ) {
      throw new ApiHttpError(
        401,
        "No autenticado.",
      );
    }

    request.authPrincipal =
      await verifyAccessToken(
        token,
        this.config.value,
      );

    return true;
  }
}
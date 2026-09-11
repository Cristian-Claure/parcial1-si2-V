import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";

import {
  Reflector,
} from "@nestjs/core";

import type {
  UserRole,
} from "@velora/contracts";

import type {
  AuthenticatedRequest,
} from "../http/authenticated-request.js";

import {
  ApiHttpError,
} from "../http/api-http.error.js";

import {
  REQUIRED_ROLES_KEY,
} from "./roles.decorator.js";

@Injectable()
export class RolesGuard
  implements CanActivate {
  constructor(
    private readonly reflector:
      Reflector,
  ) {}

  canActivate(
    context:
      ExecutionContext,
  ): boolean {
    const roles =
      this.reflector
        .getAllAndOverride<
          UserRole[]
        >(
          REQUIRED_ROLES_KEY,
          [
            context.getHandler(),
            context.getClass(),
          ],
        );

    if (
      roles ===
        undefined ||
      roles.length ===
        0
    ) {
      return true;
    }

    const request =
      context
        .switchToHttp()
        .getRequest<
          AuthenticatedRequest
        >();

    const principal =
      request.authPrincipal;

    if (!principal) {
      throw new ApiHttpError(
        401,
        "No autenticado.",
      );
    }

    if (
      !roles.includes(
        principal.role,
      )
    ) {
      throw new ApiHttpError(
        403,
        "No tiene permisos para realizar esta acción.",
      );
    }

    return true;
  }
}

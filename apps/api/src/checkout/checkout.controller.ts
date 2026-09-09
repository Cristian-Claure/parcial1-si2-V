import {
  Controller,
  Get,
  Req,
  UseGuards,
} from "@nestjs/common";

import type {
  CheckoutWarehouseResponse,
} from "@velora/contracts";

import {
  BearerAuthGuard,
} from "../auth/bearer-auth.guard.js";

import type {
  AuthPrincipal,
} from "../auth/security.js";

import {
  RequireRoles,
} from "../common/authz/roles.decorator.js";

import {
  RolesGuard,
} from "../common/authz/roles.guard.js";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import type {
  AuthenticatedRequest,
} from "../common/http/authenticated-request.js";

import {
  CheckoutService,
} from "./checkout.service.js";

@Controller(
  "api/customer/checkout",
)
@UseGuards(
  BearerAuthGuard,
  RolesGuard,
)
@RequireRoles(
  "CUSTOMER",
)
export class CheckoutController {
  constructor(
    private readonly checkout:
      CheckoutService,
  ) {}

  @Get(
    "warehouses",
  )
  warehouses(
    @Req()
    request:
      AuthenticatedRequest,
  ): Promise<
    CheckoutWarehouseResponse[]
  > {
    return this.checkout
      .eligibleWarehouses(
        this.principal(
          request,
        ),
      );
  }

  private principal(
    request:
      AuthenticatedRequest,
  ): AuthPrincipal {
    const principal =
      request.authPrincipal;

    if (!principal) {
      throw new ApiHttpError(
        401,
        "No autenticado.",
      );
    }

    return principal;
  }
}
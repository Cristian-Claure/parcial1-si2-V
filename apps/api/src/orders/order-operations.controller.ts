import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import type {
  OperationalOrderResponse,
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
  OrderOperationsService,
} from "./order-operations.service.js";

@Controller("api")
@UseGuards(
  BearerAuthGuard,
  RolesGuard,
)
@RequireRoles(
  "ADMIN",
  "STORE_MANAGER",
)
export class OrderOperationsController {
  constructor(
    private readonly orders:
      OrderOperationsService,
  ) {}

  @Post([
    "admin/orders/:orderId/fulfill",
    "manager/orders/:orderId/fulfill",
  ])
  @HttpCode(
    HttpStatus.OK,
  )
  fulfill(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "orderId",
      new ParseUUIDPipe(),
    )
    orderId:
      string,
  ): Promise<OperationalOrderResponse> {
    return this.orders
      .fulfill(
        this.principal(
          request,
        ),
        orderId,
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

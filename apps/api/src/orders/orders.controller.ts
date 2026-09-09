import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  createOrderRequestSchema,
  syncOfflineOrderRequestSchema,
  type CreateOrderRequest,
  type OrderResponse,
  type SyncOfflineOrderRequest,
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
  ZodValidationPipe,
} from "../common/http/zod-validation.pipe.js";

import {
  OrdersService,
} from "./orders.service.js";

@Controller(
  "api/customer/orders",
)
@UseGuards(
  BearerAuthGuard,
  RolesGuard,
)
@RequireRoles(
  "CUSTOMER",
)
export class OrdersController {
  constructor(
    private readonly orders:
      OrdersService,
  ) {}

  @Post()
  create(
    @Req()
    request:
      AuthenticatedRequest,

    @Body(
      new ZodValidationPipe(
        createOrderRequestSchema,
      ),
    )
    body:
      CreateOrderRequest,
  ): Promise<OrderResponse> {
    return this.orders
      .create(
        this.principal(
          request,
        ),
        body,
      );
  }

  @Post(
    "offline-sync",
  )
  @HttpCode(
    HttpStatus.OK,
  )
  syncOffline(
    @Req()
    request:
      AuthenticatedRequest,

    @Body(
      new ZodValidationPipe(
        syncOfflineOrderRequestSchema,
      ),
    )
    body:
      SyncOfflineOrderRequest,
  ): Promise<OrderResponse> {
    return this.orders
      .syncOffline(
        this.principal(
          request,
        ),
        body,
      );
  }

  @Get()
  list(
    @Req()
    request:
      AuthenticatedRequest,
  ): Promise<
    OrderResponse[]
  > {
    return this.orders
      .list(
        this.principal(
          request,
        ),
      );
  }

  @Get(
    ":orderId",
  )
  get(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "orderId",
      new ParseUUIDPipe(),
    )
    orderId: string,
  ): Promise<OrderResponse> {
    return this.orders
      .get(
        this.principal(
          request,
        ),
        orderId,
      );
  }

  @Post(
    ":orderId/cancel",
  )
  @HttpCode(
    HttpStatus.OK,
  )
  cancel(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "orderId",
      new ParseUUIDPipe(),
    )
    orderId: string,
  ): Promise<OrderResponse> {
    return this.orders
      .cancel(
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
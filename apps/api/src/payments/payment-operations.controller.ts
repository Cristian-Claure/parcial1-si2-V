import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  paymentActionRequestSchema,
  type PaymentActionRequest,
  type PaymentResponse,
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
  PaymentsService,
} from "./payments.service.js";

@Controller("api")
@UseGuards(
  BearerAuthGuard,
  RolesGuard,
)
@RequireRoles(
  "ADMIN",
  "STORE_MANAGER",
)
export class PaymentOperationsController {
  constructor(
    private readonly payments:
      PaymentsService,
  ) {}

  @Post([
    "admin/payments/:paymentId/confirm",
    "manager/payments/:paymentId/confirm",
  ])
  @HttpCode(
    HttpStatus.OK,
  )
  confirm(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "paymentId",
      new ParseUUIDPipe(),
    )
    paymentId:
      string,

    @Body(
      new ZodValidationPipe(
        paymentActionRequestSchema,
      ),
    )
    body:
      PaymentActionRequest,
  ): Promise<PaymentResponse> {
    return this.payments
      .confirm(
        this.principal(
          request,
        ),
        paymentId,
        body,
      );
  }

  @Post([
    "admin/payments/:paymentId/fail",
    "manager/payments/:paymentId/fail",
  ])
  @HttpCode(
    HttpStatus.OK,
  )
  fail(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "paymentId",
      new ParseUUIDPipe(),
    )
    paymentId:
      string,

    @Body(
      new ZodValidationPipe(
        paymentActionRequestSchema,
      ),
    )
    body:
      PaymentActionRequest,
  ): Promise<PaymentResponse> {
    return this.payments
      .fail(
        this.principal(
          request,
        ),
        paymentId,
        body,
      );
  }

  @Post([
    "admin/payments/:paymentId/refund",
    "manager/payments/:paymentId/refund",
  ])
  @HttpCode(
    HttpStatus.OK,
  )
  refund(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "paymentId",
      new ParseUUIDPipe(),
    )
    paymentId:
      string,

    @Body(
      new ZodValidationPipe(
        paymentActionRequestSchema,
      ),
    )
    body:
      PaymentActionRequest,
  ): Promise<PaymentResponse> {
    return this.payments
      .refund(
        this.principal(
          request,
        ),
        paymentId,
        body,
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

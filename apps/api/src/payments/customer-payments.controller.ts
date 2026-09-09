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
  createPaymentRequestSchema,
  paymentActionRequestSchema,
  type CreatePaymentRequest,
  type PaymentActionRequest,
  type PaymentHistoryResponse,
  type PaymentResponse,
  type StripeCheckoutResponse,
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

@Controller(
  "api/customer",
)
@UseGuards(
  BearerAuthGuard,
  RolesGuard,
)
@RequireRoles(
  "CUSTOMER",
)
export class CustomerPaymentsController {
  constructor(
    private readonly payments:
      PaymentsService,
  ) {}

  @Post(
    "orders/:orderId/payments",
  )
  create(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "orderId",
      new ParseUUIDPipe(),
    )
    orderId:
      string,

    @Body(
      new ZodValidationPipe(
        createPaymentRequestSchema,
      ),
    )
    body:
      CreatePaymentRequest,
  ): Promise<PaymentResponse> {
    return this.payments
      .create(
        this.principal(
          request,
        ),
        orderId,
        body,
      );
  }

  @Get(
    "orders/:orderId/payments",
  )
  list(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "orderId",
      new ParseUUIDPipe(),
    )
    orderId:
      string,
  ): Promise<
    PaymentResponse[]
  > {
    return this.payments
      .list(
        this.principal(
          request,
        ),
        orderId,
      );
  }

  @Get(
    "payments/:paymentId",
  )
  get(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "paymentId",
      new ParseUUIDPipe(),
    )
    paymentId:
      string,
  ): Promise<PaymentResponse> {
    return this.payments
      .get(
        this.principal(
          request,
        ),
        paymentId,
      );
  }

  @Get(
    "payments/:paymentId/history",
  )
  history(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "paymentId",
      new ParseUUIDPipe(),
    )
    paymentId:
      string,
  ): Promise<
    PaymentHistoryResponse[]
  > {
    return this.payments
      .history(
        this.principal(
          request,
        ),
        paymentId,
      );
  }

  @Post(
    "payments/:paymentId/cancel",
  )
  @HttpCode(
    HttpStatus.OK,
  )
  cancel(
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
      .cancel(
        this.principal(
          request,
        ),
        paymentId,
        body,
      );
  }

  @Post(
    "orders/:orderId/payments/stripe-checkout",
  )
  stripeCheckout(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "orderId",
      new ParseUUIDPipe(),
    )
    orderId:
      string,
  ): Promise<StripeCheckoutResponse> {
    return this.payments
      .stripeCheckout(
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

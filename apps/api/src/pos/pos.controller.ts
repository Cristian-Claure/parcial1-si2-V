import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  cashMovementRequestSchema,
  closeCashSessionRequestSchema,
  confirmPosPaymentRequestSchema,
  createPointOfSaleRequestSchema,
  createPosSaleRequestSchema,
  openCashSessionRequestSchema,
  paymentActionRequestSchema,
  updatePointOfSaleRequestSchema,
  type CashMovementRequest,
  type CashMovementResponse,
  type CashSessionResponse,
  type CloseCashSessionRequest,
  type ConfirmPosPaymentRequest,
  type CreatePointOfSaleRequest,
  type CreatePosSaleRequest,
  type OpenCashSessionRequest,
  type PaymentActionRequest,
  type PointOfSaleResponse,
  type PosPaymentResolutionResponse,
  type PosSaleResponse,
  type UpdatePointOfSaleRequest,
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
  PosService,
} from "./pos.service.js";

@Controller("api")
@UseGuards(
  BearerAuthGuard,
  RolesGuard,
)
export class PosController {
  constructor(
    private readonly pos:
      PosService,
  ) {}

  @Get("admin/points-of-sale")
  @RequireRoles("ADMIN")
  listAdminPoints(
    @Req()
    request: AuthenticatedRequest,
    @Query(
      "companyId",
      new ParseUUIDPipe(),
    )
    companyId: string,
  ): Promise<PointOfSaleResponse[]> {
    return this.pos.listPoints(
      this.principal(request),
      companyId,
    );
  }

  @Post("admin/points-of-sale")
  @RequireRoles("ADMIN")
  @HttpCode(HttpStatus.CREATED)
  createPoint(
    @Req()
    request: AuthenticatedRequest,
    @Body(
      new ZodValidationPipe(
        createPointOfSaleRequestSchema,
      ),
    )
    body: CreatePointOfSaleRequest,
  ): Promise<PointOfSaleResponse> {
    return this.pos.createPoint(
      this.principal(request),
      body,
    );
  }

  @Get("admin/points-of-sale/:pointOfSaleId")
  @RequireRoles("ADMIN")
  getAdminPoint(
    @Req()
    request: AuthenticatedRequest,
    @Param(
      "pointOfSaleId",
      new ParseUUIDPipe(),
    )
    pointOfSaleId: string,
  ): Promise<PointOfSaleResponse> {
    return this.pos.getPoint(
      this.principal(request),
      pointOfSaleId,
    );
  }

  @Put("admin/points-of-sale/:pointOfSaleId")
  @RequireRoles("ADMIN")
  updatePoint(
    @Req()
    request: AuthenticatedRequest,
    @Param(
      "pointOfSaleId",
      new ParseUUIDPipe(),
    )
    pointOfSaleId: string,
    @Body(
      new ZodValidationPipe(
        updatePointOfSaleRequestSchema,
      ),
    )
    body: UpdatePointOfSaleRequest,
  ): Promise<PointOfSaleResponse> {
    return this.pos.updatePoint(
      this.principal(request),
      pointOfSaleId,
      body,
    );
  }

  @Get("manager/points-of-sale")
  @RequireRoles("STORE_MANAGER")
  listManagerPoints(
    @Req()
    request: AuthenticatedRequest,
  ): Promise<PointOfSaleResponse[]> {
    return this.pos.listPoints(
      this.principal(request),
      null,
    );
  }

  @Get("manager/points-of-sale/:pointOfSaleId")
  @RequireRoles("STORE_MANAGER")
  getManagerPoint(
    @Req()
    request: AuthenticatedRequest,
    @Param(
      "pointOfSaleId",
      new ParseUUIDPipe(),
    )
    pointOfSaleId: string,
  ): Promise<PointOfSaleResponse> {
    return this.pos.getPoint(
      this.principal(request),
      pointOfSaleId,
    );
  }

  @Post([
    "admin/cash-sessions/open",
    "manager/cash-sessions/open",
  ])
  @RequireRoles(
    "ADMIN",
    "STORE_MANAGER",
  )
  @HttpCode(HttpStatus.CREATED)
  openSession(
    @Req()
    request: AuthenticatedRequest,
    @Body(
      new ZodValidationPipe(
        openCashSessionRequestSchema,
      ),
    )
    body: OpenCashSessionRequest,
  ): Promise<CashSessionResponse> {
    return this.pos.openSession(
      this.principal(request),
      body,
    );
  }

  @Get([
    "admin/cash-sessions/open/:pointOfSaleId",
    "manager/cash-sessions/open/:pointOfSaleId",
  ])
  @RequireRoles(
    "ADMIN",
    "STORE_MANAGER",
  )
  getOpenSession(
    @Req()
    request: AuthenticatedRequest,
    @Param(
      "pointOfSaleId",
      new ParseUUIDPipe(),
    )
    pointOfSaleId: string,
  ): Promise<CashSessionResponse> {
    return this.pos.getOpenSession(
      this.principal(request),
      pointOfSaleId,
    );
  }

  @Post([
    "admin/cash-sessions/:sessionId/movements",
    "manager/cash-sessions/:sessionId/movements",
  ])
  @RequireRoles(
    "ADMIN",
    "STORE_MANAGER",
  )
  @HttpCode(HttpStatus.CREATED)
  registerMovement(
    @Req()
    request: AuthenticatedRequest,
    @Param(
      "sessionId",
      new ParseUUIDPipe(),
    )
    sessionId: string,
    @Body(
      new ZodValidationPipe(
        cashMovementRequestSchema,
      ),
    )
    body: CashMovementRequest,
  ): Promise<CashMovementResponse> {
    return this.pos.registerMovement(
      this.principal(request),
      sessionId,
      body,
    );
  }

  @Get([
    "admin/cash-sessions/:sessionId/movements",
    "manager/cash-sessions/:sessionId/movements",
  ])
  @RequireRoles(
    "ADMIN",
    "STORE_MANAGER",
  )
  listMovements(
    @Req()
    request: AuthenticatedRequest,
    @Param(
      "sessionId",
      new ParseUUIDPipe(),
    )
    sessionId: string,
  ): Promise<CashMovementResponse[]> {
    return this.pos.listMovements(
      this.principal(request),
      sessionId,
    );
  }

  @Post([
    "admin/cash-sessions/:sessionId/close",
    "manager/cash-sessions/:sessionId/close",
  ])
  @RequireRoles(
    "ADMIN",
    "STORE_MANAGER",
  )
  @HttpCode(HttpStatus.OK)
  closeSession(
    @Req()
    request: AuthenticatedRequest,
    @Param(
      "sessionId",
      new ParseUUIDPipe(),
    )
    sessionId: string,
    @Body(
      new ZodValidationPipe(
        closeCashSessionRequestSchema,
      ),
    )
    body: CloseCashSessionRequest,
  ): Promise<CashSessionResponse> {
    return this.pos.closeSession(
      this.principal(request),
      sessionId,
      body,
    );
  }

  @Post([
    "admin/pos/sales",
    "manager/pos/sales",
  ])
  @RequireRoles(
    "ADMIN",
    "STORE_MANAGER",
  )
  @HttpCode(HttpStatus.CREATED)
  createSale(
    @Req()
    request: AuthenticatedRequest,
    @Body(
      new ZodValidationPipe(
        createPosSaleRequestSchema,
      ),
    )
    body: CreatePosSaleRequest,
  ): Promise<PosSaleResponse> {
    return this.pos.createSale(
      this.principal(request),
      body,
    );
  }

  @Get([
    "admin/pos/sales/pending/:sessionId",
    "manager/pos/sales/pending/:sessionId",
  ])
  @RequireRoles(
    "ADMIN",
    "STORE_MANAGER",
  )
  pendingSales(
    @Req()
    request: AuthenticatedRequest,
    @Param(
      "sessionId",
      new ParseUUIDPipe(),
    )
    sessionId: string,
  ): Promise<PosSaleResponse[]> {
    return this.pos.pendingSales(
      this.principal(request),
      sessionId,
    );
  }

  @Post([
    "admin/pos/sales/payments/:paymentId/confirm",
    "manager/pos/sales/payments/:paymentId/confirm",
  ])
  @RequireRoles(
    "ADMIN",
    "STORE_MANAGER",
  )
  @HttpCode(HttpStatus.OK)
  confirmPayment(
    @Req()
    request: AuthenticatedRequest,
    @Param(
      "paymentId",
      new ParseUUIDPipe(),
    )
    paymentId: string,
    @Body(
      new ZodValidationPipe(
        confirmPosPaymentRequestSchema,
      ),
    )
    body: ConfirmPosPaymentRequest,
  ): Promise<PosPaymentResolutionResponse> {
    return this.pos.confirmPayment(
      this.principal(request),
      paymentId,
      body,
    );
  }

  @Post([
    "admin/pos/sales/payments/:paymentId/fail",
    "manager/pos/sales/payments/:paymentId/fail",
  ])
  @RequireRoles(
    "ADMIN",
    "STORE_MANAGER",
  )
  @HttpCode(HttpStatus.OK)
  failPayment(
    @Req()
    request: AuthenticatedRequest,
    @Param(
      "paymentId",
      new ParseUUIDPipe(),
    )
    paymentId: string,
    @Body(
      new ZodValidationPipe(
        paymentActionRequestSchema,
      ),
    )
    body: PaymentActionRequest,
  ): Promise<PosPaymentResolutionResponse> {
    return this.pos.failPayment(
      this.principal(request),
      paymentId,
      body,
    );
  }

  @Post([
    "admin/pos/sales/payments/:paymentId/cancel",
    "manager/pos/sales/payments/:paymentId/cancel",
  ])
  @RequireRoles(
    "ADMIN",
    "STORE_MANAGER",
  )
  @HttpCode(HttpStatus.OK)
  cancelPayment(
    @Req()
    request: AuthenticatedRequest,
    @Param(
      "paymentId",
      new ParseUUIDPipe(),
    )
    paymentId: string,
    @Body(
      new ZodValidationPipe(
        paymentActionRequestSchema,
      ),
    )
    body: PaymentActionRequest,
  ): Promise<PosPaymentResolutionResponse> {
    return this.pos.cancelPayment(
      this.principal(request),
      paymentId,
      body,
    );
  }

  private principal(
    request: AuthenticatedRequest,
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

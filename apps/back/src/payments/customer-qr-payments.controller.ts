import { Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { CustomerQrPaymentResponse, QrCharge } from "@velora/contracts";
import { BearerAuthGuard } from "../auth/bearer-auth.guard.js";
import { OrderQrService } from "../billing/order-qr.service.js";
import { QrChargeService } from "../billing/qr-charge.service.js";
import { RequireRoles } from "../common/authz/roles.decorator.js";
import { RolesGuard } from "../common/authz/roles.guard.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import type { AuthenticatedRequest } from "../common/http/authenticated-request.js";
import { PaymentsService } from "./payments.service.js";

/** Pago QR de pedidos (Fase 5): genera el QR y consulta su estado (vencimiento perezoso). */
@Controller("api/customer")
@UseGuards(BearerAuthGuard, RolesGuard)
@RequireRoles("CUSTOMER")
export class CustomerQrPaymentsController {
  constructor(private readonly payments: PaymentsService, private readonly orderQr: OrderQrService, private readonly qr: QrChargeService) {}

  @Post("orders/:orderId/payments/qr")
  async create(@Req() request: AuthenticatedRequest, @Param("orderId", new ParseUUIDPipe()) orderId: string): Promise<CustomerQrPaymentResponse> {
    const principal = this.principal(request);
    const paymentId = await this.orderQr.create(principal.userId, orderId);
    const qr = await this.qr.view(paymentId);
    return { payment: await this.payments.get(principal, paymentId), qr };
  }

  /** El dueño del pago consulta el QR; un pago ajeno responde 404 (PaymentsService.get valida al cliente). */
  @Get("payments/:paymentId/qr")
  async status(@Req() request: AuthenticatedRequest, @Param("paymentId", new ParseUUIDPipe()) paymentId: string): Promise<QrCharge> {
    await this.payments.get(this.principal(request), paymentId);
    return this.qr.view(paymentId);
  }

  private principal(request: AuthenticatedRequest) {
    if (!request.authPrincipal) throw new ApiHttpError(401, "No autenticado.");
    return request.authPrincipal;
  }
}

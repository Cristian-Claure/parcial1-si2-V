import {
  Injectable,
} from "@nestjs/common";

import type {
  CashMovementRequest,
  CashMovementResponse,
  CashSessionResponse,
  CloseCashSessionRequest,
  ConfirmPosPaymentRequest,
  CreatePointOfSaleRequest,
  CreatePosSaleRequest,
  OpenCashSessionRequest,
  PaymentActionRequest,
  PointOfSaleResponse,
  PosPaymentResolutionResponse,
  PosSaleResponse,
  UpdatePointOfSaleRequest,
} from "@velora/contracts";

import type {
  AuthPrincipal,
} from "../auth/security.js";

import {
  AccessContextService,
} from "../common/authz/access-context.service.js";

import {
  PosRepository,
} from "./pos.repository.js";

@Injectable()
export class PosService {
  constructor(
    private readonly access:
      AccessContextService,

    private readonly repository:
      PosRepository,
  ) {}

  async listPoints(
    principal: AuthPrincipal,
    companyId: string | null,
  ): Promise<PointOfSaleResponse[]> {
    return this.repository.listPoints(
      await this.access.resolve(principal),
      companyId,
    );
  }

  async getPoint(
    principal: AuthPrincipal,
    pointOfSaleId: string,
  ): Promise<PointOfSaleResponse> {
    return this.repository.getPoint(
      await this.access.resolve(principal),
      pointOfSaleId,
    );
  }

  async createPoint(
    principal: AuthPrincipal,
    request: CreatePointOfSaleRequest,
  ): Promise<PointOfSaleResponse> {
    return this.repository.createPoint(
      await this.access.resolve(principal),
      request,
    );
  }

  async updatePoint(
    principal: AuthPrincipal,
    pointOfSaleId: string,
    request: UpdatePointOfSaleRequest,
  ): Promise<PointOfSaleResponse> {
    return this.repository.updatePoint(
      await this.access.resolve(principal),
      pointOfSaleId,
      request,
    );
  }

  async openSession(
    principal: AuthPrincipal,
    request: OpenCashSessionRequest,
  ): Promise<CashSessionResponse> {
    return this.repository.openSession(
      await this.access.resolve(principal),
      request,
    );
  }

  async getOpenSession(
    principal: AuthPrincipal,
    pointOfSaleId: string,
  ): Promise<CashSessionResponse> {
    return this.repository.getOpenSession(
      await this.access.resolve(principal),
      pointOfSaleId,
    );
  }

  async registerMovement(
    principal: AuthPrincipal,
    sessionId: string,
    request: CashMovementRequest,
  ): Promise<CashMovementResponse> {
    return this.repository.registerMovement(
      await this.access.resolve(principal),
      sessionId,
      request,
    );
  }

  async listMovements(
    principal: AuthPrincipal,
    sessionId: string,
  ): Promise<CashMovementResponse[]> {
    return this.repository.listMovements(
      await this.access.resolve(principal),
      sessionId,
    );
  }

  async closeSession(
    principal: AuthPrincipal,
    sessionId: string,
    request: CloseCashSessionRequest,
  ): Promise<CashSessionResponse> {
    return this.repository.closeSession(
      await this.access.resolve(principal),
      sessionId,
      request,
    );
  }

  async createSale(
    principal: AuthPrincipal,
    request: CreatePosSaleRequest,
  ): Promise<PosSaleResponse> {
    return this.repository.createSale(
      await this.access.resolve(principal),
      request,
    );
  }

  async pendingSales(
    principal: AuthPrincipal,
    sessionId: string,
  ): Promise<PosSaleResponse[]> {
    return this.repository.pendingSales(
      await this.access.resolve(principal),
      sessionId,
    );
  }

  async confirmPayment(
    principal: AuthPrincipal,
    paymentId: string,
    request: ConfirmPosPaymentRequest,
  ): Promise<PosPaymentResolutionResponse> {
    return this.repository.confirmPayment(
      await this.access.resolve(principal),
      paymentId,
      request,
    );
  }

  async failPayment(
    principal: AuthPrincipal,
    paymentId: string,
    request: PaymentActionRequest,
  ): Promise<PosPaymentResolutionResponse> {
    return this.repository.failPayment(
      await this.access.resolve(principal),
      paymentId,
      request.reason,
    );
  }

  async cancelPayment(
    principal: AuthPrincipal,
    paymentId: string,
    request: PaymentActionRequest,
  ): Promise<PosPaymentResolutionResponse> {
    return this.repository.cancelPayment(
      await this.access.resolve(principal),
      paymentId,
      request.reason,
    );
  }
}

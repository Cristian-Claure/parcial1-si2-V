import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { changePlanWithPaymentRequestSchema, type AdminPlanResponse, type ChangePlanWithPaymentRequest, type Plan } from "@velora/contracts";
import { BearerAuthGuard } from "../auth/bearer-auth.guard.js";
import { RequireRoles } from "../common/authz/roles.decorator.js";
import { RolesGuard } from "../common/authz/roles.guard.js";
import { TenantScopeService } from "../common/authz/tenant-scope.service.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import type { AuthenticatedRequest } from "../common/http/authenticated-request.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { PlanLimitsService } from "./plan-limits.service.js";
import { SubscriptionBillingService } from "./subscription-billing.service.js";

@Controller("api/plans")
export class PublicPlansController {
  constructor(private readonly limits: PlanLimitsService) {}
  @Get() list(): Promise<Plan[]> { return this.limits.listPlans(); }
}

/** Plan por cuenta propietaria (D1): el propietario autenticado es el titular de la suscripción. */
@Controller("api/admin/plan")
@UseGuards(BearerAuthGuard, RolesGuard)
@RequireRoles("ADMIN")
export class AdminPlanController {
  constructor(private readonly limits: PlanLimitsService, private readonly billing: SubscriptionBillingService, private readonly scope: TenantScopeService) {}
  @Get() async get(@Req() request: AuthenticatedRequest): Promise<AdminPlanResponse> {
    return this.limits.adminPlan(await this.ownerId(request));
  }
  /** Upgrade inmediato con cobro DEMO (planes pagos); downgrade 409 si el uso excede (D2). */
  @Post("change") @HttpCode(HttpStatus.OK) async change(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(changePlanWithPaymentRequestSchema)) body: ChangePlanWithPaymentRequest): Promise<AdminPlanResponse> {
    return this.billing.changePlan(await this.ownerId(request), body.planCode, body.card);
  }
  /** El titular se resuelve desde la BD (cuenta ADMIN activa), no desde el JWT. */
  private async ownerId(request: AuthenticatedRequest): Promise<string> {
    if (!request.authPrincipal) throw new ApiHttpError(401, "No autenticado.");
    return (await this.scope.resolve(request.authPrincipal)).userId;
  }
}

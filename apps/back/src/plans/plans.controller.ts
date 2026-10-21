import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { changePlanRequestSchema, type AdminPlanResponse, type ChangePlanRequest, type Plan } from "@velora/contracts";
import { BearerAuthGuard } from "../auth/bearer-auth.guard.js";
import { RequireRoles } from "../common/authz/roles.decorator.js";
import { RolesGuard } from "../common/authz/roles.guard.js";
import { TenantScopeService } from "../common/authz/tenant-scope.service.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import type { AuthenticatedRequest } from "../common/http/authenticated-request.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { PlanLimitsService } from "./plan-limits.service.js";

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
  constructor(private readonly limits: PlanLimitsService, private readonly scope: TenantScopeService) {}
  @Get() async get(@Req() request: AuthenticatedRequest): Promise<AdminPlanResponse> {
    return this.limits.adminPlan(await this.ownerId(request));
  }
  @Post("change") @HttpCode(HttpStatus.OK) async change(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(changePlanRequestSchema)) body: ChangePlanRequest): Promise<AdminPlanResponse> {
    return this.limits.changePlan(await this.ownerId(request), body.planCode);
  }
  /** El titular se resuelve desde la BD (cuenta ADMIN activa), no desde el JWT. */
  private async ownerId(request: AuthenticatedRequest): Promise<string> {
    if (!request.authPrincipal) throw new ApiHttpError(401, "No autenticado.");
    return (await this.scope.resolve(request.authPrincipal)).userId;
  }
}

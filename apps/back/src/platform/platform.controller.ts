import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Req, UseGuards } from "@nestjs/common";
import {
  platformAdjustSubscriptionRequestSchema, platformChangePlanRequestSchema, transferCompanyOwnerRequestSchema,
  type AdminPlanResponse, type PlatformAdjustSubscriptionRequest, type PlatformChangePlanRequest, type PlatformCompany,
  type PlatformOwner, type PlatformSubscription, type TransferCompanyOwnerRequest,
} from "@velora/contracts";
import { BearerAuthGuard } from "../auth/bearer-auth.guard.js";
import { RequireRoles } from "../common/authz/roles.decorator.js";
import { RolesGuard } from "../common/authz/roles.guard.js";
import { TenantScopeService } from "../common/authz/tenant-scope.service.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import type { AuthenticatedRequest } from "../common/http/authenticated-request.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { PlatformService } from "./platform.service.js";

@Controller("api/platform")
@UseGuards(BearerAuthGuard, RolesGuard)
@RequireRoles("PLATFORM_ADMIN")
export class PlatformController {
  constructor(private readonly platform: PlatformService, private readonly scope: TenantScopeService) {}

  @Get("owners") async owners(@Req() request: AuthenticatedRequest): Promise<PlatformOwner[]> {
    await this.requirePlatform(request);
    return this.platform.owners();
  }

  @Get("companies") async companies(@Req() request: AuthenticatedRequest): Promise<PlatformCompany[]> {
    await this.requirePlatform(request);
    return this.platform.companies();
  }

  @Get("subscriptions") async subscriptions(@Req() request: AuthenticatedRequest): Promise<PlatformSubscription[]> {
    await this.requirePlatform(request);
    return this.platform.subscriptions();
  }

  @Put("companies/:companyId/owner") async transferOwner(
    @Req() request: AuthenticatedRequest,
    @Param("companyId", new ParseUUIDPipe()) companyId: string,
    @Body(new ZodValidationPipe(transferCompanyOwnerRequestSchema)) body: TransferCompanyOwnerRequest,
  ): Promise<PlatformCompany> {
    await this.requirePlatform(request);
    return this.platform.transferOwner(companyId, body.ownerEmail);
  }

  @Post("owners/:ownerId/plan") @HttpCode(HttpStatus.OK) async changePlan(
    @Req() request: AuthenticatedRequest,
    @Param("ownerId", new ParseUUIDPipe()) ownerId: string,
    @Body(new ZodValidationPipe(platformChangePlanRequestSchema)) body: PlatformChangePlanRequest,
  ): Promise<AdminPlanResponse> {
    await this.requirePlatform(request);
    return this.platform.changeOwnerPlan(ownerId, body.planCode);
  }

  @Patch("subscriptions/:subscriptionId") async adjust(
    @Req() request: AuthenticatedRequest,
    @Param("subscriptionId", new ParseUUIDPipe()) subscriptionId: string,
    @Body(new ZodValidationPipe(platformAdjustSubscriptionRequestSchema)) body: PlatformAdjustSubscriptionRequest,
  ): Promise<PlatformSubscription> {
    await this.requirePlatform(request);
    return this.platform.adjustSubscription(subscriptionId, body);
  }

  /** El rol se verifica también contra la BD (cuenta activa), no solo con el JWT. */
  private async requirePlatform(request: AuthenticatedRequest): Promise<void> {
    if (!request.authPrincipal) throw new ApiHttpError(401, "No autenticado.");
    const actor = await this.scope.resolve(request.authPrincipal);
    if (actor.role !== "PLATFORM_ADMIN") throw new ApiHttpError(403, "Se requiere rol PLATFORM_ADMIN.");
  }
}

import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  createCompanyRequestSchema, registerOwnerStoreRequestSchema,
  type CompanyResponse, type CreateCompanyRequest, type OnboardingResponse, type RegisterOwnerStoreRequest, type SlugAvailabilityResponse,
} from "@velora/contracts";
import { AuthRateLimitGuard } from "../auth/auth-rate-limit.guard.js";
import { BearerAuthGuard } from "../auth/bearer-auth.guard.js";
import { RequireRoles } from "../common/authz/roles.decorator.js";
import { RolesGuard } from "../common/authz/roles.guard.js";
import { TenantScopeService } from "../common/authz/tenant-scope.service.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import type { AuthenticatedRequest } from "../common/http/authenticated-request.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { OnboardingService } from "./onboarding.service.js";

@Controller("api/onboarding")
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get("slug-availability") slug(@Query("slug") slug: string | undefined): Promise<SlugAvailabilityResponse> {
    return this.onboarding.slugAvailability(slug ?? "");
  }

  @Post("store") @HttpCode(HttpStatus.CREATED) @UseGuards(AuthRateLimitGuard)
  register(@Body(new ZodValidationPipe(registerOwnerStoreRequestSchema)) body: RegisterOwnerStoreRequest): Promise<OnboardingResponse> {
    return this.onboarding.registerOwnerStore(body);
  }
}

@Controller("api/admin/companies")
@UseGuards(BearerAuthGuard, RolesGuard)
@RequireRoles("ADMIN")
export class AdminCompanyProvisioningController {
  constructor(private readonly onboarding: OnboardingService, private readonly scope: TenantScopeService) {}

  @Post() @HttpCode(HttpStatus.CREATED)
  async create(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(createCompanyRequestSchema)) body: CreateCompanyRequest): Promise<CompanyResponse> {
    if (!request.authPrincipal) throw new ApiHttpError(401, "No autenticado.");
    return this.onboarding.createCompany(await this.scope.resolve(request.authPrincipal), body);
  }
}

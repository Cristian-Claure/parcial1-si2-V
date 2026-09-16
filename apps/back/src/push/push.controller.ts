import { Body, Controller, Delete, HttpCode, HttpStatus, Put, Query, Req, UseGuards } from "@nestjs/common";
import { registerPushInstallationRequestSchema, revokePushInstallationQuerySchema, type PushInstallationResponse, type RegisterPushInstallationRequest, type RevokePushInstallationQuery } from "@velora/contracts";
import { BearerAuthGuard } from "../auth/bearer-auth.guard.js";
import type { AuthPrincipal } from "../auth/security.js";
import { RequireRoles } from "../common/authz/roles.decorator.js";
import { RolesGuard } from "../common/authz/roles.guard.js";
import type { AuthenticatedRequest } from "../common/http/authenticated-request.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { PushInstallationService } from "./push-installation.service.js";

@Controller("api/push/installations")
@UseGuards(BearerAuthGuard, RolesGuard)
@RequireRoles("CUSTOMER")
export class PushController {
  constructor(private readonly installations: PushInstallationService) {}

  @Put()
  register(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(registerPushInstallationRequestSchema)) body: RegisterPushInstallationRequest): Promise<PushInstallationResponse> {
    return this.installations.register(this.principal(request), body);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@Req() request: AuthenticatedRequest, @Query(new ZodValidationPipe(revokePushInstallationQuerySchema)) query: RevokePushInstallationQuery): Promise<void> {
    return this.installations.revoke(this.principal(request), query);
  }

  private principal(request: AuthenticatedRequest): AuthPrincipal {
    if (!request.authPrincipal) throw new ApiHttpError(401, "No autenticado.");
    return request.authPrincipal;
  }
}

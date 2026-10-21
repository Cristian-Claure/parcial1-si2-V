import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, UseGuards } from "@nestjs/common";
import { dbIdSchema, syncPushRequestSchema, type SyncPullResponse, type SyncPushRequest, type SyncPushResponse } from "@velora/contracts";
import { BearerAuthGuard } from "../auth/bearer-auth.guard.js";
import { RequireRoles } from "../common/authz/roles.decorator.js";
import { RolesGuard } from "../common/authz/roles.guard.js";
import { TenantScopeService } from "../common/authz/tenant-scope.service.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import type { AuthenticatedRequest } from "../common/http/authenticated-request.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { SyncService } from "./sync.service.js";

/** Fase 2 · sincronización offline de operaciones (propietario y encargado). */
@Controller("api/sync")
@UseGuards(BearerAuthGuard, RolesGuard)
@RequireRoles("ADMIN", "STORE_MANAGER")
export class SyncController {
  constructor(private readonly sync: SyncService, private readonly scope: TenantScopeService) {}

  @Post("push") @HttpCode(HttpStatus.OK)
  async push(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(syncPushRequestSchema)) body: SyncPushRequest): Promise<SyncPushResponse> {
    return this.sync.push(await this.actor(request), body);
  }

  @Get("pull")
  async pull(@Req() request: AuthenticatedRequest, @Query("companyId") companyId: string | undefined, @Query("since") since: string | undefined): Promise<SyncPullResponse> {
    const parsed = dbIdSchema.safeParse(companyId);
    if (!parsed.success) throw new ApiHttpError(400, "Debe indicar una compañía válida.");
    return this.sync.pull(await this.actor(request), parsed.data, since && since !== "0" ? since : null);
  }

  private actor(request: AuthenticatedRequest) {
    if (!request.authPrincipal) throw new ApiHttpError(401, "No autenticado.");
    return this.scope.resolve(request.authPrincipal);
  }
}

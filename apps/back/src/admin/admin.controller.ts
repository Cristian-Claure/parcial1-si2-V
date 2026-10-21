import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import {
  adminCompanyQuerySchema, assignStoreManagerRequestSchema, createManagerRequestSchema,
  type AdminCompanyQuery, type AssignStoreManagerRequest, type AssignStoreManagerResponse, type CreateManagerRequest, type ManagerResponse,
} from "@velora/contracts";
import { BearerAuthGuard } from "../auth/bearer-auth.guard.js";
import type { AuthPrincipal } from "../auth/security.js";
import { RequireRoles } from "../common/authz/roles.decorator.js";
import { RolesGuard } from "../common/authz/roles.guard.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import type { AuthenticatedRequest } from "../common/http/authenticated-request.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { AdminService } from "./admin.service.js";

function principalOf(request: AuthenticatedRequest): AuthPrincipal {
  if (!request.authPrincipal) throw new ApiHttpError(401, "No autenticado.");
  return request.authPrincipal;
}

@Controller("api/admin/users/managers")
@UseGuards(BearerAuthGuard, RolesGuard)
@RequireRoles("ADMIN")
export class AdminController {
  constructor(private readonly admin: AdminService) {}
  @Get() list(@Req() request: AuthenticatedRequest, @Query(new ZodValidationPipe(adminCompanyQuerySchema)) query: AdminCompanyQuery): Promise<ManagerResponse[]> {
    return this.admin.listManagers(principalOf(request), query.companyId);
  }
  @Post() @HttpCode(HttpStatus.OK) create(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(createManagerRequestSchema)) body: CreateManagerRequest): Promise<ManagerResponse> {
    return this.admin.createManager(principalOf(request), body);
  }
}

@Controller("api/admin/stores/:storeId/manager")
@UseGuards(BearerAuthGuard, RolesGuard)
@RequireRoles("ADMIN")
export class AdminStoreManagerController {
  constructor(private readonly admin: AdminService) {}
  @Put() assign(
    @Req() request: AuthenticatedRequest,
    @Param("storeId", new ParseUUIDPipe()) storeId: string,
    @Body(new ZodValidationPipe(assignStoreManagerRequestSchema)) body: AssignStoreManagerRequest,
  ): Promise<AssignStoreManagerResponse> {
    return this.admin.assignStoreManager(principalOf(request), storeId, body);
  }
}

import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { CompanyResponse } from "@velora/contracts";
import { BearerAuthGuard } from "../auth/bearer-auth.guard.js";
import type { AuthPrincipal } from "../auth/security.js";
import { RequireRoles } from "../common/authz/roles.decorator.js";
import { RolesGuard } from "../common/authz/roles.guard.js";
import type { AuthenticatedRequest } from "../common/http/authenticated-request.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { CompaniesService } from "./companies.service.js";

@Controller("api/companies")
export class PublicCompaniesController {
  constructor(private readonly companies: CompaniesService) {}
  @Get() list(): Promise<CompanyResponse[]> { return this.companies.listPublic(); }
}

@Controller("api/admin/companies")
@UseGuards(BearerAuthGuard, RolesGuard)
@RequireRoles("ADMIN")
export class AdminCompaniesController {
  constructor(private readonly companies: CompaniesService) {}
  @Get() list(): Promise<CompanyResponse[]> { return this.companies.listAdmin(); }
}

@Controller("api/manager/company")
@UseGuards(BearerAuthGuard, RolesGuard)
@RequireRoles("STORE_MANAGER")
export class ManagerCompanyController {
  constructor(private readonly companies: CompaniesService) {}
  @Get() get(@Req() request: AuthenticatedRequest): Promise<CompanyResponse> {
    return this.companies.managerCompany(this.principal(request));
  }
  private principal(request: AuthenticatedRequest): AuthPrincipal {
    if (!request.authPrincipal) throw new ApiHttpError(401, "No autenticado.");
    return request.authPrincipal;
  }
}

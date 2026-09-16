import { Injectable } from "@nestjs/common";
import type { CompanyResponse } from "@velora/contracts";
import type { AuthPrincipal } from "../auth/security.js";
import { AccessContextService } from "../common/authz/access-context.service.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { CompaniesRepository } from "./companies.repository.js";

@Injectable()
export class CompaniesService {
  constructor(
    private readonly companies: CompaniesRepository,
    private readonly access: AccessContextService,
  ) {}

  listPublic(): Promise<CompanyResponse[]> { return this.companies.listActive(); }
  listAdmin(): Promise<CompanyResponse[]> { return this.companies.listAll(); }

  async managerCompany(principal: AuthPrincipal): Promise<CompanyResponse> {
    const actor = await this.access.resolve(principal);
    if (actor.role !== "STORE_MANAGER" || !actor.companyId) {
      throw new ApiHttpError(403, "El encargado no tiene una compañía derivable desde su sucursal.");
    }
    const company = await this.companies.findActive(actor.companyId);
    if (!company) throw new ApiHttpError(404, "Compañía no encontrada.");
    return company;
  }
}

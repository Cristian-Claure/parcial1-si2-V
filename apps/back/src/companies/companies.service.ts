import { Injectable } from "@nestjs/common";
import type { CompanyResponse } from "@velora/contracts";
import type { AuthPrincipal } from "../auth/security.js";
import { AccessContextService } from "../common/authz/access-context.service.js";
import { companyFilter } from "../common/authz/tenant-scope.service.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { BrandingService } from "./branding.service.js";
import { CompaniesRepository } from "./companies.repository.js";

@Injectable()
export class CompaniesService {
  constructor(
    private readonly companies: CompaniesRepository,
    private readonly access: AccessContextService,
    private readonly branding: BrandingService,
  ) {}

  async listPublic(): Promise<CompanyResponse[]> { return this.withBrand(await this.companies.listActive()); }
  /** Solo las compañías del alcance del actor (propias para ADMIN; todas para PLATFORM_ADMIN). */
  async listAdmin(principal: AuthPrincipal): Promise<CompanyResponse[]> {
    const allowed = companyFilter(await this.access.resolve(principal));
    return this.withBrand(allowed === null ? await this.companies.listAll() : await this.companies.listByIds(allowed));
  }

  async managerCompany(principal: AuthPrincipal): Promise<CompanyResponse> {
    const actor = await this.access.resolve(principal);
    if (actor.role !== "STORE_MANAGER" || !actor.companyId) {
      throw new ApiHttpError(403, "El encargado no tiene una compañía derivable desde su sucursal.");
    }
    const company = await this.companies.findActive(actor.companyId);
    if (!company) throw new ApiHttpError(404, "Compañía no encontrada.");
    const [branded] = await this.withBrand([company]);
    return branded!;
  }

  /** Marca efectiva (logo y paleta según el plan) para headers, sidebars y selector. */
  private async withBrand(list: CompanyResponse[]): Promise<CompanyResponse[]> {
    return Promise.all(list.map(async (company) => {
      const brand = await this.branding.brandById(company.id);
      return brand ? { ...company, brand } : company;
    }));
  }
}

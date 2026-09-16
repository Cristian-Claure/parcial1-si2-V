import { Injectable } from "@nestjs/common";
import type { OperationalOrderListItem, OperationalOrdersQuery } from "@velora/contracts";
import type { AuthPrincipal } from "../auth/security.js";
import { AccessContextService } from "../common/authz/access-context.service.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { CommerceOperationsRepository } from "./commerce-operations.repository.js";

@Injectable()
export class CommerceOperationsService {
  constructor(private readonly repository: CommerceOperationsRepository, private readonly access: AccessContextService) {}

  async list(principal: AuthPrincipal, query: OperationalOrdersQuery): Promise<OperationalOrderListItem[]> {
    const actor = await this.access.resolve(principal);
    if (actor.role === "STORE_MANAGER") {
      if (!actor.storeId || !actor.companyId) throw new ApiHttpError(403, "El encargado no tiene una sucursal asignada.");
      if (query.companyId && query.companyId !== actor.companyId) throw new ApiHttpError(403, "No puede consultar pedidos de otra compañía.");
      return this.repository.list({ companyId: actor.companyId, storeId: actor.storeId });
    }
    if (actor.role !== "ADMIN") throw new ApiHttpError(403, "No tiene permisos para consultar pedidos operativos.");
    return this.repository.list({ companyId: query.companyId ?? null, storeId: null });
  }
}

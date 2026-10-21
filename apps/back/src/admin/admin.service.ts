import { Injectable } from "@nestjs/common";
import type { AssignStoreManagerRequest, AssignStoreManagerResponse, CreateManagerRequest, ManagerResponse } from "@velora/contracts";
import { hashPassword, type AuthPrincipal } from "../auth/security.js";
import { TenantScopeService, assertStoreAccess } from "../common/authz/tenant-scope.service.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { AdminRepository } from "./admin.repository.js";

const DUPLICATE_EMAIL = "Ya existe un usuario con este correo.";
const STORE_HAS_MANAGER = "La sucursal ya tiene un encargado activo. Use \"reemplazar encargado\".";

@Injectable()
export class AdminService {
  constructor(private readonly admin: AdminRepository, private readonly scope: TenantScopeService) {}

  async listManagers(principal: AuthPrincipal, companyId: string): Promise<ManagerResponse[]> {
    await this.scope.requireCompany(principal, companyId);
    if (!(await this.admin.companyActive(companyId))) throw new ApiHttpError(400, "La compañía seleccionada no existe o está inactiva.");
    return this.admin.listManagers(companyId);
  }

  async createManager(principal: AuthPrincipal, request: CreateManagerRequest): Promise<ManagerResponse> {
    await this.scope.requireCompany(principal, request.companyId);
    if (!(await this.admin.companyActive(request.companyId))) throw new ApiHttpError(400, "La compañía seleccionada no existe o está inactiva.");
    if (!(await this.admin.storeValid(request.companyId, request.storeId))) throw new ApiHttpError(400, "La sucursal seleccionada no existe, está inactiva o pertenece a otra compañía.");
    if (await this.admin.emailExists(request.email)) throw new ApiHttpError(409, DUPLICATE_EMAIL);
    if (await this.admin.activeManagerId(request.storeId)) throw new ApiHttpError(409, STORE_HAS_MANAGER);
    const passwordHash = await hashPassword(request.password);
    try { return await this.admin.createManager(request, passwordHash); }
    catch (error) { throw this.translateUniqueViolation(error); }
  }

  /** Asigna o reemplaza el encargado de una sucursal propia; el anterior queda INACTIVE. */
  async assignStoreManager(principal: AuthPrincipal, storeId: string, request: AssignStoreManagerRequest): Promise<AssignStoreManagerResponse> {
    const actor = await this.scope.resolve(principal);
    assertStoreAccess(actor, storeId);
    const store = await this.admin.findStore(storeId);
    if (!store) throw new ApiHttpError(404, "Sucursal no encontrada.");
    if (!store.active) throw new ApiHttpError(400, "La sucursal está inactiva.");

    if ("userId" in request) {
      const candidate = await this.admin.findManager(request.userId);
      if (!candidate || candidate.companyId !== store.companyId) throw new ApiHttpError(404, "Encargado no encontrado en esta compañía.");
      return this.admin.assignManager(store, { kind: "EXISTING", userId: candidate.id });
    }

    if (await this.admin.emailExists(request.email)) throw new ApiHttpError(409, DUPLICATE_EMAIL);
    const passwordHash = await hashPassword(request.password);
    try {
      return await this.admin.assignManager(store, { kind: "NEW", request: { ...request, companyId: store.companyId, storeId }, passwordHash });
    } catch (error) { throw this.translateUniqueViolation(error); }
  }

  private translateUniqueViolation(error: unknown): unknown {
    if (!this.admin.isUniqueViolation(error)) return error;
    return new ApiHttpError(409, this.admin.constraintOf(error) === "uq_app_users_active_manager_per_store" ? STORE_HAS_MANAGER : DUPLICATE_EMAIL);
  }
}

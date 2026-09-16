import { Injectable } from "@nestjs/common";
import type { CreateManagerRequest, ManagerResponse } from "@velora/contracts";
import { hashPassword } from "../auth/security.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { AdminRepository } from "./admin.repository.js";

@Injectable()
export class AdminService {
  constructor(private readonly admin: AdminRepository) {}

  async listManagers(companyId: string): Promise<ManagerResponse[]> {
    if (!(await this.admin.companyActive(companyId))) throw new ApiHttpError(400, "La compañía seleccionada no existe o está inactiva.");
    return this.admin.listManagers(companyId);
  }

  async createManager(request: CreateManagerRequest): Promise<ManagerResponse> {
    if (!(await this.admin.companyActive(request.companyId))) throw new ApiHttpError(400, "La compañía seleccionada no existe o está inactiva.");
    if (!(await this.admin.storeValid(request.companyId, request.storeId))) throw new ApiHttpError(400, "La sucursal seleccionada no existe, está inactiva o pertenece a otra compañía.");
    if (await this.admin.emailExists(request.email)) throw new ApiHttpError(409, "Ya existe un usuario con este correo.");
    const passwordHash = await hashPassword(request.password);
    try { return await this.admin.createManager(request, passwordHash); }
    catch (error) {
      if (this.admin.isUniqueViolation(error)) throw new ApiHttpError(409, "Ya existe un usuario con este correo.");
      throw error;
    }
  }
}

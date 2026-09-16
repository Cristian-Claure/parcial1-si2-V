import { Injectable } from "@nestjs/common";
import type { PushInstallationResponse, RevokePushInstallationQuery, RegisterPushInstallationRequest } from "@velora/contracts";
import type { AuthPrincipal } from "../auth/security.js";
import { AccessContextService } from "../common/authz/access-context.service.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { PushRepository } from "./push.repository.js";

@Injectable()
export class PushInstallationService {
  constructor(private readonly repository: PushRepository, private readonly access: AccessContextService) {}

  async register(principal: AuthPrincipal, request: RegisterPushInstallationRequest): Promise<PushInstallationResponse> {
    const userId = await this.customerId(principal);
    if (!(await this.repository.isActiveCustomer(userId))) throw new ApiHttpError(403, "La cuenta de cliente no está activa.");
    return this.repository.register(userId, { ...request, installationId: request.installationId.trim(), deviceLabel: request.deviceLabel?.trim() || null });
  }

  async revoke(principal: AuthPrincipal, query: RevokePushInstallationQuery): Promise<void> {
    const userId = await this.customerId(principal);
    await this.repository.revoke(userId, query.platform, query.installationId.trim());
  }

  private async customerId(principal: AuthPrincipal): Promise<string> {
    const actor = await this.access.resolve(principal);
    if (actor.role !== "CUSTOMER") throw new ApiHttpError(403, "La operación está disponible únicamente para clientes.");
    return actor.userId;
  }
}

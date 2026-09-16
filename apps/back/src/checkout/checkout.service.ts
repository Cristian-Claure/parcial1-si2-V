import { Injectable } from "@nestjs/common";
import type { CheckoutWarehouseResponse } from "@velora/contracts";
import type { AuthPrincipal } from "../auth/security.js";
import { AccessContextService } from "../common/authz/access-context.service.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { CheckoutRepository } from "./checkout.repository.js";
@Injectable()
export class CheckoutService {
  constructor(private readonly checkout: CheckoutRepository, private readonly access: AccessContextService) {}
  async eligibleWarehouses(principal: AuthPrincipal, companyId: string): Promise<CheckoutWarehouseResponse[]> {
    const context = await this.access.resolve(principal); if (context.role !== "CUSTOMER") throw new ApiHttpError(403, "La operación está disponible únicamente para clientes.");
    const lines = await this.checkout.activeCartLines(context.userId, companyId); if (lines.length === 0) return [];
    const candidates = await this.checkout.activeDefaultWarehouses(companyId); const result: CheckoutWarehouseResponse[] = [];
    for (const warehouse of candidates) { const pickupEligible = await this.checkout.canFulfillPickup(warehouse.warehouseId, lines); const deliveryEligible = await this.checkout.canFulfillDelivery(warehouse.storeId, lines); if (pickupEligible || deliveryEligible) result.push({ ...warehouse, pickupEligible, deliveryEligible }); }
    return result;
  }
}

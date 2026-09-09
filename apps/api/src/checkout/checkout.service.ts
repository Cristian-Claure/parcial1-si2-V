import {
  Injectable,
} from "@nestjs/common";

import type {
  CheckoutWarehouseResponse,
} from "@velora/contracts";

import type {
  AuthPrincipal,
} from "../auth/security.js";

import {
  AccessContextService,
} from "../common/authz/access-context.service.js";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import {
  CheckoutRepository,
} from "./checkout.repository.js";

@Injectable()
export class CheckoutService {
  constructor(
    private readonly checkout:
      CheckoutRepository,

    private readonly access:
      AccessContextService,
  ) {}

  async eligibleWarehouses(
    principal:
      AuthPrincipal,
  ): Promise<
    CheckoutWarehouseResponse[]
  > {
    const customerId =
      await this.requireCustomer(
        principal,
      );

    const lines =
      await this.checkout
        .activeCartLines(
          customerId,
        );

    if (
      lines.length ===
      0
    ) {
      return [];
    }

    const candidates =
      await this.checkout
        .activeDefaultWarehouses();

    const eligible:
      CheckoutWarehouseResponse[] =
      [];

    for (
      const warehouse of
      candidates
    ) {
      if (
        await this.checkout
          .canFulfill(
            warehouse.warehouseId,
            lines,
          )
      ) {
        eligible.push(
          warehouse,
        );
      }
    }

    return eligible;
  }

  private async requireCustomer(
    principal:
      AuthPrincipal,
  ): Promise<string> {
    const context =
      await this.access
        .resolve(
          principal,
        );

    if (
      context.role !==
      "CUSTOMER"
    ) {
      throw new ApiHttpError(
        403,
        "La operación está disponible únicamente para clientes.",
      );
    }

    return context.userId;
  }
}
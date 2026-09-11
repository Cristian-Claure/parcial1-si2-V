import {
  Injectable,
} from "@nestjs/common";

import type {
  OperationalOrderResponse,
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
  OrderOperationsRepository,
} from "./order-operations.repository.js";

import { CustomerPushService } from "../push/customer-push.service.js";

@Injectable()
export class OrderOperationsService {
  constructor(
    private readonly orders:
      OrderOperationsRepository,

    private readonly access:
      AccessContextService,

    private readonly push?:
      CustomerPushService,
  ) {}

  async fulfill(
    principal:
      AuthPrincipal,
    orderId:
      string,
  ): Promise<OperationalOrderResponse> {
    const actor =
      await this.access
        .resolve(
          principal,
        );

    if (
      actor.role !==
        "ADMIN" &&
      actor.role !==
        "STORE_MANAGER"
    ) {
      throw new ApiHttpError(
        403,
        "No tiene permisos para completar pedidos.",
      );
    }

    await this.orders
      .fulfill(
        actor,
        orderId,
      );

    const order =
      await this.orders
        .get(
          orderId,
        );

    if (!order) {
      throw new ApiHttpError(
        500,
        "El pedido fue completado pero no pudo recuperarse.",
      );
    }

    this.push?.orderFulfilled(order.id);

    return order;
  }
}

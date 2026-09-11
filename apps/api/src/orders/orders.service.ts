import { createHash } from "node:crypto";

import {
  Injectable,
} from "@nestjs/common";

import type {
  CreateOrderRequest,
  OfflineOrderItemRequest,
  OrderResponse,
  SyncOfflineOrderRequest,
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
  OrdersRepository,
  type OrderFailure,
  type OrderMutationResult,
} from "./orders.repository.js";

import { CustomerPushService } from "../push/customer-push.service.js";

@Injectable()
export class OrdersService {
  constructor(
    private readonly orders:
      OrdersRepository,

    private readonly access:
      AccessContextService,

    private readonly push?:
      CustomerPushService,
  ) {}

  async create(
    principal:
      AuthPrincipal,
    request:
      CreateOrderRequest,
    idempotencyKey:
      string |
      undefined,
  ): Promise<OrderResponse> {
    const customerId =
      await this.requireCustomer(
        principal,
      );

    const idempotencyKeyHash =
      this.idempotencyHash(
        idempotencyKey,
      );

    const result =
      await this.orders
        .createOnline(
          customerId,
          request,
          idempotencyKeyHash,
        );

    const shouldNotify =
      result.kind === "OK" &&
      result.idempotent !== true;

    const order = await this.requireMutationOrder(
      customerId,
      result,
      false,
    );

    if (shouldNotify) this.push?.orderConfirmed(customerId, order.id, order.orderNumber);
    return order;
  }

  async syncOffline(
    principal:
      AuthPrincipal,
    request:
      SyncOfflineOrderRequest,
  ): Promise<OrderResponse> {
    const customerId =
      await this.requireCustomer(
        principal,
      );

    const normalizedItems =
      this.normalizeOfflineItems(
        request.items,
      );

    const result =
      await this.orders
        .syncOffline(
          customerId,
          {
            ...request,

            notes:
              this.trimToNull(
                request.notes,
              ),
          },
          normalizedItems,
        );

    const shouldNotify =
      result.kind === "OK" &&
      result.idempotent !== true;

    const order = await this.requireMutationOrder(
      customerId,
      result,
      true,
    );

    if (shouldNotify) this.push?.orderConfirmed(customerId, order.id, order.orderNumber);
    return order;
  }

  async list(
    principal:
      AuthPrincipal,
  ): Promise<
    OrderResponse[]
  > {
    const customerId =
      await this.requireCustomer(
        principal,
      );

    return this.orders
      .listForCustomer(
        customerId,
      );
  }

  async get(
    principal:
      AuthPrincipal,
    orderId: string,
  ): Promise<OrderResponse> {
    const customerId =
      await this.requireCustomer(
        principal,
      );

    const order =
      await this.orders
        .getForCustomer(
          customerId,
          orderId,
        );

    if (!order) {
      throw new ApiHttpError(
        404,
        "Pedido no encontrado.",
      );
    }

    return order;
  }

  async cancel(
    principal:
      AuthPrincipal,
    orderId: string,
  ): Promise<OrderResponse> {
    const customerId =
      await this.requireCustomer(
        principal,
      );

    const result =
      await this.orders
        .cancel(
          customerId,
          orderId,
        );

    const order = await this.requireMutationOrder(
      customerId,
      result,
      false,
    );

    this.push?.orderCancelled(customerId, order.id, order.orderNumber);
    return order;
  }

  private async requireMutationOrder(
    customerId: string,
    result:
      OrderMutationResult,
    offline:
      boolean,
  ): Promise<OrderResponse> {
    if (
      result.kind !==
      "OK"
    ) {
      this.throwFailure(
        result,
        offline,
      );
    }

    const order =
      await this.orders
        .getForCustomer(
          customerId,
          result.orderId,
        );

    if (!order) {
      throw new ApiHttpError(
        500,
        "El pedido fue procesado pero no pudo recuperarse.",
      );
    }

    return order;
  }

  private throwFailure(
    failure:
      OrderFailure,
    offline:
      boolean,
  ): never {
    switch (
      failure.kind
    ) {
      case "NO_ACTIVE_CART":
        throw new ApiHttpError(
          400,
          "No existe un carrito activo.",
        );

      case "EMPTY_CART":
        throw new ApiHttpError(
          400,
          offline
            ? "El pedido offline no contiene productos."
            : "No se puede crear un pedido con el carrito vacío.",
        );

      case "WAREHOUSE_NOT_FOUND":
        throw new ApiHttpError(
          404,
          "Almacén no encontrado.",
        );

      case "WAREHOUSE_INACTIVE":
        throw new ApiHttpError(
          409,
          "El almacén seleccionado está inactivo.",
        );

      case "PICKUP_WAREHOUSE_INVALID":
        throw new ApiHttpError(
          409,
          "El retiro en tienda solo puede abastecerse desde el almacén principal de una sucursal activa.",
        );

      case "STORE_WAREHOUSE_INVALID":
        throw new ApiHttpError(
          409,
          "La sucursal debe seleccionarse mediante su almacén principal activo.",
        );

      case "CART_STORE_MISMATCH":
        throw new ApiHttpError(
          409,
          "La bolsa está ligada a otra sucursal.",
        );

      case "DELIVERY_ADDRESS_REQUIRED":
        throw new ApiHttpError(
          400,
          "La dirección de entrega es obligatoria.",
        );

      case "PICKUP_ADDRESS_FORBIDDEN":
        throw new ApiHttpError(
          400,
          "Los pedidos para recojo en tienda no deben incluir dirección de entrega.",
        );

      case "ADDRESS_NOT_FOUND":
        throw new ApiHttpError(
          404,
          offline
            ? "La dirección seleccionada ya no está disponible."
            : "Dirección de entrega no encontrada.",
        );

      case "VARIANT_MISSING":
        throw new ApiHttpError(
          409,
          "Una variante del pedido ya no existe.",
        );

      case "VARIANT_UNAVAILABLE":
        throw new ApiHttpError(
          409,
          "Una variante del carrito ya no está disponible para la venta.",
        );

      case "CURRENCY_MISMATCH":
        throw new ApiHttpError(
          409,
          offline
            ? "El pedido contiene variantes con monedas diferentes."
            : "El carrito contiene variantes con monedas diferentes.",
        );

      case "COMPANY_MISMATCH":
        throw new ApiHttpError(
          409,
          "Los productos deben pertenecer a la misma compañía que la sucursal seleccionada.",
        );

      case "STOCK_MISSING":
        throw new ApiHttpError(
          409,
          "La variante " +
          failure.sku +
          (
            offline
              ? " no tiene stock en la sucursal seleccionada."
              : " no tiene stock en el almacén seleccionado."
          ),
        );

      case "STOCK_INSUFFICIENT":
        throw new ApiHttpError(
          409,
          "Stock disponible insuficiente para " +
          failure.sku +
          ". Disponible: " +
          failure.available +
          ", solicitado: " +
          failure.requested +
          ".",
        );

      case "OPERATION_ALREADY_USED":
        throw new ApiHttpError(
          409,
          "El identificador de operación ya fue utilizado.",
        );

      case "OPERATION_CONFLICT":
        throw new ApiHttpError(
          409,
          "El identificador de operación ya pertenece a otro pedido.",
        );

      case "ORDER_NOT_FOUND":
        throw new ApiHttpError(
          404,
          "Pedido no encontrado.",
        );

      case "ORDER_NOT_RESERVED":
        throw new ApiHttpError(
          409,
          "Solo pueden cancelarse pedidos reservados.",
        );

      case "PAYMENT_PAID":
        throw new ApiHttpError(
          409,
          "El pedido tiene un pago confirmado. Debe reembolsarse antes de cancelar el pedido.",
        );

      case "PAYMENT_PENDING":
        throw new ApiHttpError(
          409,
          "El pedido tiene un pago pendiente. Debe cancelarse el pago antes de cancelar el pedido.",
        );

      case "RESERVATION_STOCK_MISSING":
        throw new ApiHttpError(
          409,
          "No existe el stock asociado a la reserva del pedido.",
        );

      case "RESERVATION_INCONSISTENT":
        throw new ApiHttpError(
          409,
          "La reserva de inventario del pedido es inconsistente.",
        );
    }
  }

  private normalizeOfflineItems(
    requestedItems:
      OfflineOrderItemRequest[],
  ): OfflineOrderItemRequest[] {
    const quantities =
      new Map<
        string,
        number
      >();

    for (
      const item of
      requestedItems
    ) {
      quantities.set(
        item.variantId,
        (
          quantities.get(
            item.variantId,
          ) ??
          0
        ) +
        item.quantity,
      );
    }

    return Array.from(
      quantities.entries(),
    ).map(
      (
        [
          variantId,
          quantity,
        ],
      ) => ({
        variantId,
        quantity,
      }),
    );
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

  private idempotencyHash(
    value:
      string |
      undefined,
  ): string {
    const normalized =
      value?.trim() ??
      "";

    if (
      normalized.length < 8 ||
      normalized.length > 128
    ) {
      throw new ApiHttpError(
        400,
        "Idempotency-Key es obligatorio y debe tener entre 8 y 128 caracteres.",
      );
    }

    return createHash("sha256")
      .update(normalized, "utf8")
      .digest("hex");
  }

  private trimToNull(
    value:
      string |
      null |
      undefined,
  ): string |
    null {
    if (
      value ===
        null ||
      value ===
        undefined ||
      value.trim().length ===
        0
    ) {
      return null;
    }

    return value.trim();
  }
}
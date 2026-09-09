import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  AccessContextService,
} from "../common/authz/access-context.service.js";

import type {
  OrdersRepository,
} from "./orders.repository.js";

import {
  OrdersService,
} from "./orders.service.js";

const principal = {
  userId:
    "30000000-0000-4000-8000-000000000001",

  email:
    "customer@velora.test",

  role:
    "CUSTOMER" as const,

  name:
    "Customer",
};

const order = {
  id:
    "80000000-0000-4000-8000-000000000001",

  orderNumber:
    "VEL-20260909-AAAAAAAAAAAA",

  warehouseId:
    "30000000-0000-4000-8000-000000000001",

  storeId:
    "20000000-0000-4000-8000-000000000001",

  storeName:
    "Equipetrol",

  fulfillmentType:
    "PICKUP" as const,

  status:
    "RESERVED" as const,

  currency:
    "BOB",

  subtotal:
    100,

  total:
    100,

  recipientName:
    null,

  recipientPhone:
    null,

  department:
    null,

  city:
    null,

  zone:
    null,

  addressLine:
    null,

  addressReference:
    null,

  notes:
    null,

  createdAt:
    "2026-09-09T01:00:00.000Z",

  cancelledAt:
    null,

  fulfilledAt:
    null,

  items:
    [],
};

function access():
  AccessContextService {
  return {
    resolve:
      vi.fn()
        .mockResolvedValue({
          userId:
            principal.userId,

          role:
            "CUSTOMER",

          storeId:
            null,

          companyId:
            null,
        }),
  } as unknown as
    AccessContextService;
}

function repository(
  overrides:
    Partial<OrdersRepository> =
      {},
): OrdersRepository {
  return {
    createOnline:
      vi.fn()
        .mockResolvedValue({
          kind:
            "OK",

          orderId:
            order.id,
        }),

    syncOffline:
      vi.fn()
        .mockResolvedValue({
          kind:
            "OK",

          orderId:
            order.id,

          idempotent:
            true,
        }),

    getForCustomer:
      vi.fn()
        .mockResolvedValue(
          order,
        ),

    listForCustomer:
      vi.fn()
        .mockResolvedValue([
          order,
        ]),

    cancel:
      vi.fn()
        .mockResolvedValue({
          kind:
            "PAYMENT_PENDING",
        }),

    ...overrides,
  } as unknown as
    OrdersRepository;
}

describe(
  "OrdersService",
  () => {
    it(
      "returns the created order",
      async () => {
        const service =
          new OrdersService(
            repository(),
            access(),
          );

        await expect(
          service.create(
            principal,
            {
              warehouseId:
                order.warehouseId,

              fulfillmentType:
                "PICKUP",

              addressId:
                null,

              notes:
                null,
            },
          ),
        ).resolves.toEqual(
          order,
        );
      },
    );

    it(
      "merges duplicate offline variants before persistence",
      async () => {
        const syncOffline =
          vi.fn()
            .mockResolvedValue({
              kind:
                "OK",

              orderId:
                order.id,

              idempotent:
                true,
            });

        const service =
          new OrdersService(
            repository({
              syncOffline,
            }),
            access(),
          );

        await service
          .syncOffline(
            principal,
            {
              clientOperationId:
                "90000000-0000-4000-8000-000000000001",

              clientCreatedAt:
                "2026-09-09T01:00:00.000Z",

              sourceCartId:
                null,

              warehouseId:
                order.warehouseId,

              fulfillmentType:
                "PICKUP",

              addressId:
                null,

              notes:
                "  ",

              items: [
                {
                  variantId:
                    "60000000-0000-4000-8000-000000000001",

                  quantity:
                    2,
                },
                {
                  variantId:
                    "60000000-0000-4000-8000-000000000001",

                  quantity:
                    3,
                },
              ],
            },
          );

        expect(
          syncOffline,
        ).toHaveBeenCalledWith(
          principal.userId,
          expect.objectContaining({
            notes:
              null,
          }),
          [
            {
              variantId:
                "60000000-0000-4000-8000-000000000001",

              quantity:
                5,
            },
          ],
        );
      },
    );

    it(
      "blocks cancellation while a payment is pending",
      async () => {
        const service =
          new OrdersService(
            repository(),
            access(),
          );

        await expect(
          service.cancel(
            principal,
            order.id,
          ),
        ).rejects.toMatchObject({
          status:
            409,

          message:
            "El pedido tiene un pago pendiente. Debe cancelarse el pago antes de cancelar el pedido.",
        });
      },
    );
  },
);
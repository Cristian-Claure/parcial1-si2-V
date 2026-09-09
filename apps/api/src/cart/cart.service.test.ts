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
  CartRepository,
} from "./cart.repository.js";

import {
  CartService,
} from "./cart.service.js";

const customerPrincipal = {
  userId:
    "30000000-0000-4000-8000-000000000001",

  email:
    "customer@velora.test",

  role:
    "CUSTOMER" as const,

  name:
    "Customer",
};

function access(
  role:
    "CUSTOMER" |
    "ADMIN" =
      "CUSTOMER",
): AccessContextService {
  return {
    resolve:
      vi.fn()
        .mockResolvedValue({
          userId:
            customerPrincipal.userId,

          role,

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
    Partial<CartRepository> = {},
): CartRepository {
  return {
    getActiveCart:
      vi.fn()
        .mockResolvedValue({
          id:
            null,

          status:
            "ACTIVE",

          items:
            [],

          totalItems:
            0,

          subtotal:
            0,

          currency:
            "BOB",
        }),

    findVariantForSale:
      vi.fn()
        .mockResolvedValue({
          id:
            "60000000-0000-4000-8000-000000000001",

          variantActive:
            true,

          productActive:
            true,
        }),

    addItem:
      vi.fn()
        .mockResolvedValue({
          kind:
            "MAX_EXCEEDED",
        }),

    ...overrides,
  } as unknown as
    CartRepository;
}

describe(
  "CartService",
  () => {
    it(
      "allows only customers",
      async () => {
        const service =
          new CartService(
            repository(),
            access(
              "ADMIN",
            ),
          );

        await expect(
          service.getCart(
            {
              ...customerPrincipal,
              role:
                "ADMIN",
            },
          ),
        ).rejects.toMatchObject({
          status:
            403,
        });
      },
    );

    it(
      "rejects unavailable variants",
      async () => {
        const service =
          new CartService(
            repository({
              findVariantForSale:
                vi.fn()
                  .mockResolvedValue({
                    id:
                      "60000000-0000-4000-8000-000000000001",

                    variantActive:
                      false,

                    productActive:
                      true,
                  }),
            }),
            access(),
          );

        await expect(
          service.addItem(
            customerPrincipal,
            {
              variantId:
                "60000000-0000-4000-8000-000000000001",

              quantity:
                1,
            },
          ),
        ).rejects.toMatchObject({
          status:
            409,
        });
      },
    );

    it(
      "enforces the cumulative quantity limit",
      async () => {
        const service =
          new CartService(
            repository(),
            access(),
          );

        await expect(
          service.addItem(
            customerPrincipal,
            {
              variantId:
                "60000000-0000-4000-8000-000000000001",

              quantity:
                99,
            },
          ),
        ).rejects.toMatchObject({
          status:
            400,
        });
      },
    );
  },
);

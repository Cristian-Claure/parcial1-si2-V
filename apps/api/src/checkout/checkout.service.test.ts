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
  CheckoutRepository,
} from "./checkout.repository.js";

import {
  CheckoutService,
} from "./checkout.service.js";

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

function access():
  AccessContextService {
  return {
    resolve:
      vi.fn()
        .mockResolvedValue({
          userId:
            customerPrincipal.userId,

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

function repository():
  CheckoutRepository {
  return {
    activeCartLines:
      vi.fn()
        .mockResolvedValue([
          {
            variantId:
              "60000000-0000-4000-8000-000000000001",

            quantity:
              2,
          },
        ]),

    activeDefaultWarehouses:
      vi.fn()
        .mockResolvedValue([
          {
            warehouseId:
              "30000000-0000-4000-8000-000000000001",

            warehouseCode:
              "MAIN",

            warehouseName:
              "Principal",

            storeId:
              "20000000-0000-4000-8000-000000000001",

            storeName:
              "Equipetrol",

            storeAddress:
              null,
          },
          {
            warehouseId:
              "30000000-0000-4000-8000-000000000002",

            warehouseCode:
              "MAIN",

            warehouseName:
              "Principal",

            storeId:
              "20000000-0000-4000-8000-000000000002",

            storeName:
              "Urubó",

            storeAddress:
              null,
          },
        ]),

    canFulfill:
      vi.fn()
        .mockImplementation(
          async (
            warehouseId:
              string,
          ) =>
            warehouseId.endsWith(
              "0001",
            ),
        ),
  } as unknown as
    CheckoutRepository;
}

describe(
  "CheckoutService",
  () => {
    it(
      "returns only default warehouses that can fulfill the whole cart",
      async () => {
        const service =
          new CheckoutService(
            repository(),
            access(),
          );

        const result =
          await service
            .eligibleWarehouses(
              customerPrincipal,
            );

        expect(
          result,
        ).toHaveLength(1);

        expect(
          result[0]?.warehouseId,
        ).toBe(
          "30000000-0000-4000-8000-000000000001",
        );
      },
    );

    it(
      "returns no warehouses for an empty cart",
      async () => {
        const repo = {
          ...repository(),

          activeCartLines:
            vi.fn()
              .mockResolvedValue(
                [],
              ),
        } as unknown as
          CheckoutRepository;

        const service =
          new CheckoutService(
            repo,
            access(),
          );

        await expect(
          service
            .eligibleWarehouses(
              customerPrincipal,
            ),
        ).resolves.toEqual(
          [],
        );
      },
    );
  },
);
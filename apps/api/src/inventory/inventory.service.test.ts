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
  InventoryRepository,
} from "./inventory.repository.js";

import {
  InventoryService,
} from "./inventory.service.js";

const principal = {
  userId:
    "30000000-0000-4000-8000-000000000001",

  email:
    "manager@velora.test",

  role:
    "STORE_MANAGER" as const,

  name:
    "Manager",
};

function access(
  storeId: string,
  companyId:
    string =
      "10000000-0000-0000-0000-000000000001",
): AccessContextService {
  return {
    resolve:
      vi.fn()
        .mockResolvedValue({
          userId:
            principal.userId,

          role:
            principal.role,

          storeId,

          companyId,
        }),
  } as unknown as
    AccessContextService;
}

function repository(
  overrides:
    Partial<InventoryRepository> = {},
): InventoryRepository {
  return {
    findWarehouse:
      vi.fn()
        .mockResolvedValue({
          id:
            "70000000-0000-4000-8000-000000000001",

          storeId:
            "20000000-0000-4000-8000-000000000001",

          storeName:
            "Equipetrol",

          storeCompanyId:
            "10000000-0000-0000-0000-000000000001",

          code:
            "MAIN",

          name:
            "Principal",

          description:
            null,

          active:
            true,

          defaultWarehouse:
            true,
        }),

    findVariant:
      vi.fn()
        .mockResolvedValue({
          id:
            "60000000-0000-4000-8000-000000000001",

          companyId:
            "10000000-0000-0000-0000-000000000001",

          active:
            true,

          sku:
            "SKU-1",
        }),

    ...overrides,
  } as unknown as
    InventoryRepository;
}

describe(
  "InventoryService",
  () => {
    it(
      "forbids a manager from another store",
      async () => {
        const service =
          new InventoryService(
            repository(),
            access(
              "20000000-0000-4000-8000-000000000099",
            ),
          );

        await expect(
          service.listStock(
            principal,
            "70000000-0000-4000-8000-000000000001",
          ),
        ).rejects.toMatchObject({
          status:
            403,
        });
      },
    );

    it(
      "forbids manual SALE movements",
      async () => {
        const service =
          new InventoryService(
            repository(),
            access(
              "20000000-0000-4000-8000-000000000001",
            ),
          );

        await expect(
          service.registerMovement(
            principal,
            {
              warehouseId:
                "70000000-0000-4000-8000-000000000001",

              variantId:
                "60000000-0000-4000-8000-000000000001",

              movementType:
                "SALE",

              quantity:
                1,

              reason:
                "No permitido.",
            },
          ),
        ).rejects.toMatchObject({
          status:
            400,
        });
      },
    );

    it(
      "rejects cross-company variants",
      async () => {
        const service =
          new InventoryService(
            repository({
              findVariant:
                vi.fn()
                  .mockResolvedValue({
                    id:
                      "60000000-0000-4000-8000-000000000002",

                    companyId:
                      "10000000-0000-0000-0000-000000000002",

                    active:
                      true,

                    sku:
                      "SKU-2",
                  }),
            }),
            access(
              "20000000-0000-4000-8000-000000000001",
            ),
          );

        await expect(
          service.registerMovement(
            principal,
            {
              warehouseId:
                "70000000-0000-4000-8000-000000000001",

              variantId:
                "60000000-0000-4000-8000-000000000002",

              movementType:
                "ENTRY",

              quantity:
                1,

              reason:
                "Cruce inválido.",
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

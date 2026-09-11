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
      "forbids manual TRANSFER_OUT movements",
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
                "TRANSFER_OUT",

              quantity:
                1,

              reason:
                "Debe usar transferencia atómica.",
            },
          ),
        ).rejects.toMatchObject({
          status:
            400,
        });
      },
    );

    it(
      "rejects transfers across stores",
      async () => {
        const inventory =
          repository({
            findWarehouse:
              vi.fn()
                .mockImplementation(
                  async (
                    id:
                      string,
                  ) => ({
                    id,
                    storeId:
                      id.endsWith("1")
                        ? "20000000-0000-4000-8000-000000000001"
                        : "20000000-0000-4000-8000-000000000002",
                    storeName:
                      "Store",
                    storeCompanyId:
                      "10000000-0000-0000-0000-000000000001",
                    code:
                      "WH",
                    name:
                      "Warehouse",
                    description:
                      null,
                    active:
                      true,
                    defaultWarehouse:
                      false,
                  }),
                ),
          });

        const service =
          new InventoryService(
            inventory,
            access(
              "20000000-0000-4000-8000-000000000001",
            ),
          );

        await expect(
          service.transfer(
            principal,
            {
              sourceWarehouseId:
                "70000000-0000-4000-8000-000000000001",

              destinationWarehouseId:
                "70000000-0000-4000-8000-000000000002",

              variantId:
                "60000000-0000-4000-8000-000000000001",

              quantity:
                2,

              reason:
                "Cruce de sucursal no permitido.",
            },
          ),
        ).rejects.toMatchObject({
          status:
            403,
        });
      },
    );

    it(
      "returns both stocks for an atomic same-store transfer",
      async () => {
        const sourceId =
          "70000000-0000-4000-8000-000000000001";

        const destinationId =
          "70000000-0000-4000-8000-000000000002";

        const inventory =
          repository({
            findWarehouse:
              vi.fn()
                .mockImplementation(
                  async (
                    id:
                      string,
                  ) => ({
                    id,
                    storeId:
                      "20000000-0000-4000-8000-000000000001",
                    storeName:
                      "Equipetrol",
                    storeCompanyId:
                      "10000000-0000-0000-0000-000000000001",
                    code:
                      "WH",
                    name:
                      "Warehouse",
                    description:
                      null,
                    active:
                      true,
                    defaultWarehouse:
                      id === sourceId,
                  }),
                ),

            transfer:
              vi.fn()
                .mockResolvedValue({
                  kind:
                    "OK",
                  transferId:
                    "90000000-0000-4000-8000-000000000001",
                  source: {
                    id:
                      "91000000-0000-4000-8000-000000000001",
                    warehouseId:
                      sourceId,
                    variantId:
                      "60000000-0000-4000-8000-000000000001",
                    productName:
                      "Chaqueta",
                    sku:
                      "SKU-1",
                    size:
                      "M",
                    color:
                      "Negro",
                    physicalQuantity:
                      8,
                    committedQuantity:
                      0,
                    availableQuantity:
                      8,
                    version:
                      2,
                  },
                  destination: {
                    id:
                      "91000000-0000-4000-8000-000000000002",
                    warehouseId:
                      destinationId,
                    variantId:
                      "60000000-0000-4000-8000-000000000001",
                    productName:
                      "Chaqueta",
                    sku:
                      "SKU-1",
                    size:
                      "M",
                    color:
                      "Negro",
                    physicalQuantity:
                      2,
                    committedQuantity:
                      0,
                    availableQuantity:
                      2,
                    version:
                      1,
                  },
                }),
          });

        const service =
          new InventoryService(
            inventory,
            access(
              "20000000-0000-4000-8000-000000000001",
            ),
          );

        const result =
          await service.transfer(
            principal,
            {
              sourceWarehouseId:
                sourceId,

              destinationWarehouseId:
                destinationId,

              variantId:
                "60000000-0000-4000-8000-000000000001",

              quantity:
                2,

              reason:
                "Redistribución interna.",
            },
          );

        expect(
          result.transferId,
        ).toBe(
          "90000000-0000-4000-8000-000000000001",
        );

        expect(
          result.source.physicalQuantity,
        ).toBe(8);

        expect(
          result.destination.physicalQuantity,
        ).toBe(2);
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

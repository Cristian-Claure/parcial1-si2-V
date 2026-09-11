import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  StoresRepository,
} from "./stores.repository.js";

import {
  StoresService,
} from "./stores.service.js";

function repository(
  overrides: Partial<
    StoresRepository
  > = {},
): StoresRepository {
  return {
    companyIsActive:
      vi.fn()
        .mockResolvedValue(
          true,
        ),

    listByCompany:
      vi.fn()
        .mockResolvedValue(
          [],
        ),

    codeExists:
      vi.fn()
        .mockResolvedValue(
          false,
        ),

    create:
      vi.fn()
        .mockResolvedValue({
          id:
            "20000000-0000-0000-0000-000000000001",

          companyId:
            "10000000-0000-0000-0000-000000000001",

          code:
            "EQP",

          name:
            "Equipetrol",

          address:
            null,

          active:
            true,
        }),

    isUniqueViolation:
      vi.fn()
        .mockReturnValue(
          false,
        ),

    ...overrides,
  } as unknown as
    StoresRepository;
}

describe(
  "StoresService",
  () => {
    it(
      "rejects inactive or unknown companies",
      async () => {
        const service =
          new StoresService(
            repository({
              companyIsActive:
                vi.fn()
                  .mockResolvedValue(
                    false,
                  ),
            }),
          );

        await expect(
          service.listStores(
            "10000000-0000-0000-0000-000000000099",
          ),
        ).rejects.toMatchObject({
          status:
            400,
        });
      },
    );

    it(
      "preserves case-insensitive duplicate store protection",
      async () => {
        const service =
          new StoresService(
            repository({
              codeExists:
                vi.fn()
                  .mockResolvedValue(
                    true,
                  ),
            }),
          );

        await expect(
          service.createStore({
            companyId:
              "10000000-0000-0000-0000-000000000001",

            code:
              "eqp",

            name:
              "Equipetrol",

            address:
              null,
          }),
        ).rejects.toMatchObject({
          status:
            409,

          message:
            "Ya existe una sucursal con ese código.",
        });
      },
    );
  },
);

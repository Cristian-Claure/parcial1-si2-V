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
  CatalogRepository,
} from "./catalog.repository.js";

import {
  CatalogService,
} from "./catalog.service.js";

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

function repository(
  overrides:
    Partial<CatalogRepository> = {},
): CatalogRepository {
  return {
    companyIsActive:
      vi.fn()
        .mockResolvedValue(
          true,
        ),

    categorySlugExists:
      vi.fn()
        .mockResolvedValue(
          false,
        ),

    findCategory:
      vi.fn()
        .mockResolvedValue(
          null,
        ),

    ...overrides,
  } as unknown as
    CatalogRepository;
}

function access(
  companyId:
    string | null,
): AccessContextService {
  return {
    resolve:
      vi.fn()
        .mockResolvedValue({
          userId:
            principal.userId,

          role:
            principal.role,

          storeId:
            "20000000-0000-4000-8000-000000000001",

          companyId,
        }),
  } as unknown as
    AccessContextService;
}

describe(
  "CatalogService company scope",
  () => {
    it(
      "forbids a manager from another company",
      async () => {
        const service =
          new CatalogService(
            repository(),
            access(
              "10000000-0000-0000-0000-000000000001",
            ),
          );

        await expect(
          service.listManagedCategories(
            principal,
            "10000000-0000-0000-0000-000000000002",
          ),
        ).rejects.toMatchObject({
          status:
            403,
        });
      },
    );

    it(
      "rejects a parent category from another company",
      async () => {
        const service =
          new CatalogService(
            repository({
              findCategory:
                vi.fn()
                  .mockResolvedValue(
                    null,
                  ),
            }),
            access(
              "10000000-0000-0000-0000-000000000001",
            ),
          );

        await expect(
          service.createCategory(
            principal,
            {
              companyId:
                "10000000-0000-0000-0000-000000000001",

              name:
                "Prueba",

              slug:
                "prueba",

              parentId:
                "40000000-0000-4000-8000-000000000001",
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

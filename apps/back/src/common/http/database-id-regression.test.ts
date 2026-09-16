import {
  describe,
  expect,
  it,
} from "vitest";

import {
  addCartItemRequestSchema,
  createOrderRequestSchema,
} from "@velora/contracts";

describe(
  "company identifier compatibility",
  () => {
    const migratedCompanyId =
      "10000000-0000-0000-0000-000000000001";

    const validVariantId =
      "11111111-1111-4111-8111-111111111111";

    const validWarehouseId =
      "22222222-2222-4222-8222-222222222222";

    it(
      "accepts the canonical migrated company id in cart requests",
      () => {
        const result =
          addCartItemRequestSchema.safeParse({
            companyId:
              migratedCompanyId,
            variantId:
              validVariantId,
            quantity: 1,
          });

        expect(
          result.success,
        ).toBe(true);
      },
    );

    it(
      "accepts the canonical migrated company id in order requests",
      () => {
        const result =
          createOrderRequestSchema.safeParse({
            companyId:
              migratedCompanyId,
            warehouseId:
              validWarehouseId,
            fulfillmentType:
              "PICKUP",
            addressId: null,
            notes:
              "company id compatibility test",
          });

        expect(
          result.success,
        ).toBe(true);
      },
    );
  },
);

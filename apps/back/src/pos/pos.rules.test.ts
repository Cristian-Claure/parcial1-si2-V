import {
  describe,
  expect,
  it,
} from "vitest";

import {
  calculateExpectedCash,
  normalizePosItems,
  samePosReplay,
} from "./pos.rules.js";

const one =
  "10000000-0000-4000-8000-000000000001";
const two =
  "10000000-0000-4000-8000-000000000002";

describe(
  "POS rules",
  () => {
    it(
      "ordena líneas de forma estable y rechaza variantes duplicadas",
      () => {
        expect(
          normalizePosItems([
            {
              variantId:
                two,
              quantity:
                1,
            },
            {
              variantId:
                one,
              quantity:
                2,
            },
          ]).map(
            (item) =>
              item.variantId,
          ),
        ).toEqual([
          one,
          two,
        ]);

        expect(
          () =>
            normalizePosItems([
              {
                variantId:
                  one,
                quantity:
                  1,
              },
              {
                variantId:
                  one,
                quantity:
                  2,
              },
            ]),
        ).toThrow(
          "DUPLICATE_VARIANT",
        );
      },
    );

    it(
      "considera idempotente solo el mismo snapshot comercial",
      () => {
        const header = {
          cashSessionId:
            "20000000-0000-4000-8000-000000000001",
          customerId:
            null,
          paymentMethod:
            "CASH" as const,
        };

        expect(
          samePosReplay(
            header,
            header,
            [
              {
                variantId:
                  one,
                quantity:
                  2,
              },
            ],
            [
              {
                variantId:
                  one,
                quantity:
                  2,
              },
            ],
          ),
        ).toBe(true);

        expect(
          samePosReplay(
            header,
            {
              ...header,
              paymentMethod:
                "CARD",
            },
            [
              {
                variantId:
                  one,
                quantity:
                  2,
              },
            ],
            [
              {
                variantId:
                  one,
                quantity:
                  2,
              },
            ],
          ),
        ).toBe(false);
      },
    );

    it(
      "calcula efectivo esperado con entradas, salidas y pagos CASH PAID",
      () => {
        expect(
          calculateExpectedCash(
            100,
            [
              {
                movementType:
                  "CASH_IN",
                amount:
                  25,
              },
              {
                movementType:
                  "CASH_OUT",
                amount:
                  10,
              },
            ],
            80,
          ),
        ).toBe(195);
      },
    );
  },
);

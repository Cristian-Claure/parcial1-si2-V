import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  OfflinePosSaleEntry,
} from "../../../core/offline/offlineDb";

import {
  posPaymentAllowedOffline,
  queuedPosQuantity,
} from "../../../core/offline/posOfflineLogic";

const entry =
  (
    id: string,
    quantity: number,
    warehouseId = "30000000-0000-4000-8000-000000000001",
  ): OfflinePosSaleEntry => ({
    id,
    userId:
      "40000000-0000-4000-8000-000000000002",
    status: "PENDING",
    pointOfSaleId:
      "90000000-0000-4000-8000-000000000001",
    warehouseId,
    cashSessionId:
      "91000000-0000-4000-8000-000000000001",
    request: {
      clientOperationId:
        id,
      clientCreatedAt:
        "2026-09-09T12:00:00.000Z",
      cashSessionId:
        "91000000-0000-4000-8000-000000000001",
      customerId: null,
      paymentMethod:
        "CASH",
      items: [
        {
          variantId:
            "70000000-0000-4000-8000-000000000001",
          quantity,
        },
      ],
      notes: null,
    },
    items: [
      {
        variantId:
          "70000000-0000-4000-8000-000000000001",
        productName:
          "Producto",
        sku: "SKU-1",
        size: "M",
        color: "Negro",
        quantity,
        unitPrice: 10,
        currency: "BOB",
      },
    ],
    total:
      quantity * 10,
    currency: "BOB",
    createdAt:
      "2026-09-09T12:00:00.000Z",
    errorMessage: null,
  });

describe(
  "POS offline rules",
  () => {
    it(
      "resta todas las ventas locales del warehouse",
      () => {
        expect(
          queuedPosQuantity(
            [
              entry(
                "a0000000-0000-4000-8000-000000000001",
                2,
              ),
              entry(
                "a0000000-0000-4000-8000-000000000002",
                3,
              ),
            ],
            "30000000-0000-4000-8000-000000000001",
            "70000000-0000-4000-8000-000000000001",
          ),
        ).toBe(5);
      },
    );

    it(
      "permite offline únicamente efectivo",
      () => {
        expect(
          posPaymentAllowedOffline(
            "CASH",
          ),
        ).toBe(true);

        expect(
          posPaymentAllowedOffline(
            "CARD",
          ),
        ).toBe(false);

        expect(
          posPaymentAllowedOffline(
            "QR",
          ),
        ).toBe(false);
      },
    );
  },
);

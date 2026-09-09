import type {
  PosSaleItemRequest,
} from "@velora/contracts";

export interface PosReplayHeader {
  cashSessionId: string;
  customerId: string | null;
  paymentMethod: "CASH" | "CARD" | "QR";
}

export function normalizePosItems(
  items:
    PosSaleItemRequest[],
): PosSaleItemRequest[] {
  const seen =
    new Set<string>();

  const normalized =
    [...items]
      .sort(
        (
          left,
          right,
        ) =>
          left.variantId.localeCompare(
            right.variantId,
          ),
      );

  for (
    const item of
    normalized
  ) {
    if (
      seen.has(
        item.variantId,
      )
    ) {
      throw new Error(
        "DUPLICATE_VARIANT",
      );
    }

    seen.add(
      item.variantId,
    );
  }

  return normalized;
}

export function samePosReplay(
  existing:
    PosReplayHeader,
  requested:
    PosReplayHeader,
  storedItems:
    PosSaleItemRequest[],
  requestedItems:
    PosSaleItemRequest[],
): boolean {
  if (
    existing.cashSessionId !==
      requested.cashSessionId ||
    existing.customerId !==
      requested.customerId ||
    existing.paymentMethod !==
      requested.paymentMethod
  ) {
    return false;
  }

  const left =
    normalizePosItems(
      storedItems,
    );

  const right =
    normalizePosItems(
      requestedItems,
    );

  if (
    left.length !==
    right.length
  ) {
    return false;
  }

  return left.every(
    (
      item,
      index,
    ) => {
      const candidate =
        right[index];

      return Boolean(
        candidate &&
        item.variantId ===
          candidate.variantId &&
        item.quantity ===
          candidate.quantity,
      );
    },
  );
}

export function calculateExpectedCash(
  openingAmount: number,
  cashMovements:
    Array<{
      movementType:
        "CASH_IN" |
        "CASH_OUT";

      amount: number;
    }>,
  paidCashAmount: number,
): number {
  let expected =
    openingAmount;

  for (
    const movement of
    cashMovements
  ) {
    expected +=
      movement.movementType ===
        "CASH_IN"
        ? movement.amount
        : -movement.amount;
  }

  expected +=
    paidCashAmount;

  return Number(
    expected.toFixed(2),
  );
}

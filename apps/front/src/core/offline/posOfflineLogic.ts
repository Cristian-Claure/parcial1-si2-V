import type {
  OfflinePosSaleEntry,
} from "./offlineDb";

export function queuedPosQuantity(
  entries: OfflinePosSaleEntry[],
  warehouseId: string,
  variantId: string,
): number {
  return entries
    .filter(
      (entry) =>
        entry.warehouseId ===
          warehouseId,
    )
    .reduce(
      (
        total,
        entry,
      ) =>
        total +
        entry.items
          .filter(
            (item) =>
              item.variantId ===
              variantId,
          )
          .reduce(
            (
              itemTotal,
              item,
            ) =>
              itemTotal +
              item.quantity,
            0,
          ),
      0,
    );
}

export function posPaymentAllowedOffline(
  method:
    "CASH" |
    "CARD" |
    "QR",
): boolean {
  return method ===
    "CASH";
}

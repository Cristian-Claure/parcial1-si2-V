import type { CartResponse, CustomerFulfillmentType, SyncOfflineOrderRequest } from "@velora/contracts";

export function buildOfflineOrder(input: {
  clientOperationId: string; clientCreatedAt: string; cart: CartResponse; warehouseId: string;
  fulfillmentType: CustomerFulfillmentType; addressId: string | null; notes: string | null;
}): SyncOfflineOrderRequest {
  return {
    clientOperationId: input.clientOperationId,
    clientCreatedAt: input.clientCreatedAt,
    sourceCartId: input.cart.id,
    warehouseId: input.warehouseId,
    fulfillmentType: input.fulfillmentType,
    addressId: input.fulfillmentType === "DELIVERY" ? input.addressId : null,
    notes: input.notes,
    items: input.cart.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
  };
}

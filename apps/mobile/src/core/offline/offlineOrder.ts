import type {
  CartResponse,
  CustomerFulfillmentType,
  SyncOfflineOrderRequest,
} from "@velora/contracts";

export function createClientOperationId(): string {
  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return template.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function buildOfflineOrder(input: {
  cart: CartResponse;
  warehouseId: string;
  fulfillmentType: CustomerFulfillmentType;
  addressId: string | null;
  notes: string | null;
  clientOperationId?: string;
  clientCreatedAt?: string;
}): SyncOfflineOrderRequest {
  if (input.cart.items.length === 0) {
    throw new Error("La bolsa está vacía.");
  }

  return {
    clientOperationId:
      input.clientOperationId ?? createClientOperationId(),
    clientCreatedAt:
      input.clientCreatedAt ?? new Date().toISOString(),
    sourceCartId: input.cart.id,
    warehouseId: input.warehouseId,
    fulfillmentType: input.fulfillmentType,
    addressId:
      input.fulfillmentType === "DELIVERY"
        ? input.addressId
        : null,
    notes: input.notes,
    items: input.cart.items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
    })),
  };
}
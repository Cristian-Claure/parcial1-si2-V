import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOfflineOrder,
  createClientOperationId,
} from "../src/core/offline/offlineOrder.ts";

const cart = {
  id: "30000000-0000-4000-8000-000000000001",
  status: "ACTIVE",
  totalItems: 2,
  subtotal: 100,
  currency: "BOB",
  items: [
    {
      id: "31000000-0000-4000-8000-000000000001",
      variantId: "32000000-0000-4000-8000-000000000001",
      productId: "33000000-0000-4000-8000-000000000001",
      productName: "Vestido",
      sku: "VEL-01",
      size: "M",
      color: "Negro",
      colorHex: "#000000",
      unitPrice: 50,
      currency: "BOB",
      quantity: 2,
      subtotal: 100,
    },
  ],
} as never;

test("creates an immutable offline snapshot with idempotency fields", () => {
  const request = buildOfflineOrder({
    cart,
    warehouseId: "40000000-0000-4000-8000-000000000001",
    fulfillmentType: "DELIVERY",
    addressId: "50000000-0000-4000-8000-000000000001",
    notes: "Puerta principal",
    clientOperationId: "60000000-0000-4000-8000-000000000001",
    clientCreatedAt: "2026-09-09T18:00:00.000Z",
  });

  assert.equal(request.sourceCartId, cart.id);
  assert.equal(request.items.length, 1);
  assert.equal(request.items[0]!.variantId, cart.items[0]!.variantId);
  assert.equal(request.items[0]!.quantity, 2);
  assert.equal(request.addressId, "50000000-0000-4000-8000-000000000001");
});

test("PICKUP never carries a delivery address", () => {
  const request = buildOfflineOrder({
    cart,
    warehouseId: "40000000-0000-4000-8000-000000000001",
    fulfillmentType: "PICKUP",
    addressId: "50000000-0000-4000-8000-000000000001",
    notes: null,
  });

  assert.equal(request.addressId, null);
  assert.match(
    request.clientOperationId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  assert.match(createClientOperationId(), /^[0-9a-f-]{36}$/i);
});

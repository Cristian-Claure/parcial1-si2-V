import { describe, expect, it } from "vitest";
import type { CartResponse } from "@velora/contracts";
import { buildOfflineOrder } from "./offlineOrder";
const cart: CartResponse = { id: "10000000-0000-4000-8000-000000000001", status: "ACTIVE", currency: "BOB", totalItems: 2, subtotal: 100, items: [{ id: "20000000-0000-4000-8000-000000000001", variantId: "30000000-0000-4000-8000-000000000001", productId: "40000000-0000-4000-8000-000000000001", productName: "Vestido", sku: "SKU", size: "M", color: "Negro", colorHex: null, unitPrice: 50, currency: "BOB", quantity: 2, subtotal: 100 }] };
describe("buildOfflineOrder", () => {
  it("preserva snapshot e idempotencia sin inventar reserva", () => { const order = buildOfflineOrder({ clientOperationId: "50000000-0000-4000-8000-000000000001", clientCreatedAt: "2026-09-09T12:00:00.000Z", cart, warehouseId: "60000000-0000-4000-8000-000000000001", fulfillmentType: "PICKUP", addressId: "70000000-0000-4000-8000-000000000001", notes: null }); expect(order.sourceCartId).toBe(cart.id); expect(order.addressId).toBeNull(); expect(order.items).toEqual([{ variantId: cart.items[0]!.variantId, quantity: 2 }]); });
});

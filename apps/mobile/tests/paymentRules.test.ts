import assert from "node:assert/strict";
import test from "node:test";
import {
  paymentMethodLabel,
  paymentMethodsForOrder,
} from "../src/core/payments/paymentRules.ts";

test("DELIVERY and PICKUP preserve the authoritative payment matrix", () => {
  const delivery = paymentMethodsForOrder({ fulfillmentType: "DELIVERY" });
  const pickup = paymentMethodsForOrder({ fulfillmentType: "PICKUP" });

  assert.deepEqual(delivery, ["COD", "WEB", "CARD", "QR"]);
  assert.deepEqual(pickup, ["CASH", "WEB", "CARD", "QR"]);
  assert.equal(delivery.includes("CASH"), false);
  assert.equal(pickup.includes("COD"), false);
});

test("payment labels remain customer-facing", () => {
  assert.equal(paymentMethodLabel("WEB"), "Stripe Checkout");
  assert.equal(paymentMethodLabel("COD"), "Contra entrega");
  assert.equal(paymentMethodLabel("CASH"), "Efectivo en sucursal");
});

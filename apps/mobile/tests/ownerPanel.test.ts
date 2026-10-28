import assert from "node:assert/strict";
import test from "node:test";
import type { ProductResponse, VariantResponse } from "@velora/contracts";
import { chartBars, formatChange, formatKpiValue, lockedLabel, orderActions, parsePrice, productUpdateBody, rangeFor, variantPriceBody } from "../src/features/owner/panelLogic.ts";

const variant: VariantResponse = { id: "v1", sku: "VLR-1", barcode: "779", size: "M", color: "Negro", colorHex: "#000000", price: 199.9, compareAtPrice: 249.9, currency: "BOB", active: true } as VariantResponse;

test("editar precio conserva el resto de la variante (PUT completo)", () => {
  assert.deepEqual(variantPriceBody(variant, 210), { sku: "VLR-1", barcode: "779", size: "M", color: "Negro", colorHex: "#000000", price: 210, compareAtPrice: 249.9, currency: "BOB", active: true });
});

test("activar/desactivar reconstruye el producto desde la respuesta", () => {
  const product = { companyId: "c1", id: "p1", categoryId: "k1", categoryName: "Vestidos", name: "Vestido", slug: "vestido", description: null, brand: "X", composition: null, careInstructions: null, fitNotes: null, status: "ACTIVE", tryOnEnabled: true, tryOnCategory: "upper_body", variants: [], images: [] } as unknown as ProductResponse;
  const body = productUpdateBody(product, "INACTIVE");
  assert.equal(body.status, "INACTIVE");
  assert.equal(body.companyId, "c1");
  assert.equal(body.slug, "vestido");
  assert.equal(body.tryOnCategory, "upper_body");
  assert.equal("variants" in body, false);
});

test("precio en formato boliviano", () => {
  assert.equal(parsePrice("1.234,50"), 1234.5);
  assert.equal(parsePrice("249,9"), 249.9);
  assert.equal(parsePrice("249.90"), 249.9);
  assert.equal(parsePrice("Bs 99"), 99);
  assert.equal(parsePrice("0"), null);
  assert.equal(parsePrice("-5"), null);
  assert.equal(parsePrice("12,345"), null);
  assert.equal(parsePrice(""), null);
});

test("rango de fechas en La Paz (UTC−4)", () => {
  assert.deepEqual(rangeFor(7, new Date("2026-10-28T02:00:00Z")), { from: "2026-10-21", to: "2026-10-27" });
  assert.deepEqual(rangeFor(1, new Date("2026-10-28T12:00:00Z")), { from: "2026-10-28", to: "2026-10-28" });
});

test("KPIs, comparación y gráficos", () => {
  assert.equal(formatKpiValue({ value: 12345.5, format: "CURRENCY" }), "Bs 12.345,50");
  assert.equal(formatKpiValue({ value: 1520, format: "COUNT" }), "1.520");
  assert.equal(formatKpiValue({ value: 12.34, format: "PERCENT" }), "12,3 %");
  assert.deepEqual(formatChange(12.5), { text: "▲ 12,5 % vs. periodo anterior", trend: "up" });
  assert.equal(formatChange(-3)?.trend, "down");
  assert.equal(formatChange(null), null);
  assert.deepEqual(chartBars({ categories: ["a", "b", "c"], series: [{ name: "s", data: [5, 10, 0] }] }).map((bar) => bar.ratio), [0.5, 1, 0]);
  assert.deepEqual(chartBars({ categories: ["a"], series: [] }), [{ label: "a", value: 0, ratio: 0 }]);
  assert.equal(lockedLabel({ requiredPlan: "PLUS", minTier: "STANDARD" }), "Disponible en PLUS/MAX");
  assert.equal(lockedLabel({ requiredPlan: "MAX", minTier: "ADVANCED" }), "Disponible en MAX");
  assert.equal(lockedLabel({ requiredPlan: null, minTier: "ADVANCED" }), "Disponible en MAX");
});

test("acciones de pedido iguales a la web", () => {
  const payment = (id: string, status: string, provider = "MANUAL") => ({ id, status, provider }) as never;
  assert.deepEqual(orderActions({ status: "RESERVED", payments: [payment("p1", "PENDING")] }), { pendingPaymentId: "p1", canFulfill: false, refundPaymentId: null });
  assert.deepEqual(orderActions({ status: "RESERVED", payments: [payment("p1", "PENDING", "STRIPE")] }), { pendingPaymentId: null, canFulfill: false, refundPaymentId: null });
  assert.deepEqual(orderActions({ status: "RESERVED", payments: [payment("p2", "PAID")] }), { pendingPaymentId: null, canFulfill: true, refundPaymentId: "p2" });
  assert.deepEqual(orderActions({ status: "FULFILLED", payments: [payment("p2", "PAID")] }), { pendingPaymentId: null, canFulfill: false, refundPaymentId: null });
});

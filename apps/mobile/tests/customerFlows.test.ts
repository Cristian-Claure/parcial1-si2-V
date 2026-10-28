import assert from "node:assert/strict";
import test from "node:test";
import type { ProductResponse } from "@velora/contracts";
import { estimateLoyaltyDiscount } from "../src/features/cart/loyalty.ts";
import { activeFilterCount, EMPTY_FILTERS, filterProducts, variantOptions } from "../src/features/catalog/catalogFilters.ts";
import { monthStartLaPaz, remainingTryOns } from "../src/features/try-on/tryOnQuota.ts";

const variant = (id: string, size: string, color: string, price: number, active = true) => ({ id, sku: id, barcode: null, size, color, colorHex: null, price, compareAtPrice: null, currency: "BOB", active });
const product = (id: string, name: string, categoryId: string, variants: ReturnType<typeof variant>[]) =>
  ({ id, name, categoryId, categoryName: categoryId, brand: "Marca", description: null, variants, images: [] }) as unknown as ProductResponse;

const catalog = [
  product("p1", "Vestido lino", "c-vestidos", [variant("v1", "M", "Arena", 320), variant("v2", "S", "Negro", 300)]),
  product("p2", "Zapatilla runner", "c-calzado", [variant("v3", "40", "Blanco", 450)]),
  product("p3", "Chaqueta denim", "c-abrigos", [variant("v4", "L", "Azul", 280), variant("v5", "M", "Negro", 999, false)]),
];

test("catálogo: búsqueda, categoría, talla, color y orden", () => {
  assert.deepEqual(filterProducts(catalog, { ...EMPTY_FILTERS, search: "LINO" }).map((p) => p.id), ["p1"]);
  assert.deepEqual(filterProducts(catalog, { ...EMPTY_FILTERS, categoryId: "c-calzado" }).map((p) => p.id), ["p2"]);
  assert.deepEqual(filterProducts(catalog, { ...EMPTY_FILTERS, size: "M" }).map((p) => p.id), ["p1"], "la variante inactiva M de p3 no cuenta");
  assert.deepEqual(filterProducts(catalog, { ...EMPTY_FILTERS, color: "Negro" }).map((p) => p.id), ["p1"]);
  assert.deepEqual(filterProducts(catalog, { ...EMPTY_FILTERS, sort: "price-asc" }).map((p) => p.id), ["p3", "p1", "p2"]);
  assert.deepEqual(filterProducts(catalog, { ...EMPTY_FILTERS, sort: "price-desc" }).map((p) => p.id), ["p2", "p1", "p3"]);
  assert.deepEqual(variantOptions(catalog), { sizes: ["40", "L", "M", "S"], colors: ["Arena", "Azul", "Blanco", "Negro"] });
  assert.equal(activeFilterCount({ ...EMPTY_FILTERS, size: "M", sort: "name" }), 2);
});

const rules = { basis: "FULFILLED_AMOUNT" as const, windowDays: 365, tiers: [{ minAmount: 1500, percent: 5 }, { minAmount: 4000, percent: 10 }] };
const now = new Date("2026-10-28T12:00:00Z");
const order = (storeId: string, total: number, status: "FULFILLED" | "RESERVED" | "CANCELLED", daysAgo: number) =>
  ({ storeId, total, status, fulfilledAt: status === "FULFILLED" ? new Date(now.getTime() - daysAgo * 86_400_000).toISOString() : null, createdAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString() });

test("descuento por compras: misma regla que el backend (monto entregado en la ventana, escalón más alto)", () => {
  const stores = new Set(["s1", "s2"]);
  const orders = [order("s1", 1000, "FULFILLED", 10), order("s2", 700, "FULFILLED", 100), order("s1", 5000, "RESERVED", 1), order("otra", 9000, "FULFILLED", 5), order("s1", 3000, "FULFILLED", 400)];
  const estimate = estimateLoyaltyDiscount(rules, orders, stores, 200, now);
  assert.deepEqual(estimate, { fulfilledAmount: 1700, percent: 5, amount: 10, next: { percent: 10, missing: 2300 } });
  assert.equal(estimateLoyaltyDiscount(null, orders, stores, 200, now), null, "tiendas sin descuento (FREE/PLUS)");
  assert.equal(estimateLoyaltyDiscount(rules, [], stores, 200, now)?.percent, 0);
});

test("probador: cuota restante del mes calendario en La Paz", () => {
  // 1-nov-2026 00:00 en La Paz = 04:00 UTC.
  assert.equal(new Date(monthStartLaPaz(new Date("2026-11-01T03:59:00Z"))).toISOString(), "2026-10-01T04:00:00.000Z");
  assert.equal(new Date(monthStartLaPaz(new Date("2026-11-01T04:00:00Z"))).toISOString(), "2026-11-01T04:00:00.000Z");
  const products = new Set(["p1", "p2"]);
  const jobs = [
    { productId: "p1", status: "COMPLETED", createdAt: "2026-10-05T10:00:00Z" },
    { productId: "p2", status: "PROCESSING", createdAt: "2026-10-20T10:00:00Z" },
    { productId: "p1", status: "FAILED", createdAt: "2026-10-21T10:00:00Z" },
    { productId: "x9", status: "COMPLETED", createdAt: "2026-10-21T10:00:00Z" },
    { productId: "p1", status: "COMPLETED", createdAt: "2026-09-30T10:00:00Z" },
  ];
  assert.deepEqual(remainingTryOns(3, jobs, products, now), { limit: 3, used: 2, remaining: 1 });
  assert.deepEqual(remainingTryOns(1, jobs, products, now), { limit: 1, used: 2, remaining: 0 });
  assert.equal(remainingTryOns(null, jobs, products, now), null, "ilimitado");
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { VariantAvailability } from "@velora/contracts";
import { createMigratedDatabase, integrationDatabaseAvailable, type TestDatabase } from "./integration-database.js";
import { http, seedTenant, startTestApp, type SeededTenant, type TestApp } from "./integration-app.js";

const available = await integrationDatabaseAvailable();

/**
 * Fase 4C · Disponibilidad pública por variante (`GET /api/catalog/products/:id/availability`).
 * Solo expone un nivel (IN_STOCK/LOW/OUT), nunca cantidades, y respeta el aislamiento A/B:
 * un producto de A consultado con el companyId de B es 404 y el stock de B no suma en A.
 */
describe.skipIf(!available)("disponibilidad por variante (integración, A/B)", () => {
  let db: TestDatabase;
  let server: TestApp;
  let a: SeededTenant;
  let b: SeededTenant;
  const availability = (companyId: string, productId: string) =>
    http<VariantAvailability[]>(server.baseUrl, "GET", `/api/catalog/products/${productId}/availability?companyId=${companyId}`);

  beforeAll(async () => {
    db = await createMigratedDatabase("availability");
    a = await seedTenant(db, "A", { planCode: "MAX" });
    b = await seedTenant(db, "B", { planCode: "FREE" });
    server = await startTestApp(db);
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  it("devuelve solo el nivel por variante, sin cantidades", async () => {
    const result = await availability(a.companyId, a.productId);
    expect(result.status, result.text).toBe(200);
    expect(result.body).toEqual([{ variantId: a.variantId, level: "IN_STOCK" }]);
    // Solo nivel: ni cantidades físicas, comprometidas ni disponibles.
    for (const entry of result.body) expect(Object.keys(entry).sort()).toEqual(["level", "variantId"]);
    expect(result.text).not.toMatch(/quantity|available/i);
  });

  it("refleja lo comprometido: LOW con pocas unidades vendibles y OUT sin ellas", async () => {
    await db.query("update inventory_stocks set committed_quantity = 47 where variant_id = $1", [a.variantId]);
    expect((await availability(a.companyId, a.productId)).body[0]?.level).toBe("LOW");
    await db.query("update inventory_stocks set committed_quantity = 50 where variant_id = $1", [a.variantId]);
    expect((await availability(a.companyId, a.productId)).body[0]?.level).toBe("OUT");
    await db.query("update inventory_stocks set committed_quantity = 0 where variant_id = $1", [a.variantId]);
  });

  it("A/B: el producto de A no existe para el companyId de B", async () => {
    expect((await availability(b.companyId, a.productId)).status).toBe(404);
    expect((await availability(a.companyId, b.productId)).status).toBe(404);
  });

  it("no cuenta almacenes inactivos", async () => {
    await db.query("update warehouses set active = false where id = $1", [a.warehouseId]);
    expect((await availability(a.companyId, a.productId)).body[0]?.level).toBe("OUT");
    await db.query("update warehouses set active = true where id = $1", [a.warehouseId]);
  });
});

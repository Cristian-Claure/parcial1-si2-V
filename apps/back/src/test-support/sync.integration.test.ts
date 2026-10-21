import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SyncOperation, SyncPullResponse, SyncPushResponse } from "@velora/contracts";
import { createMigratedDatabase, integrationDatabaseAvailable, type TestDatabase } from "./integration-database.js";
import { http, login, seedTenant, startTestApp, type SeededTenant, type TestApp } from "./integration-app.js";

const available = await integrationDatabaseAvailable();

describe.skipIf(!available)("sincronización offline (integración)", () => {
  let db: TestDatabase;
  let server: TestApp;
  let A: SeededTenant;
  let B: SeededTenant;
  let F: SeededTenant;
  const tokens: Record<string, string> = {};
  let cursor = "";

  const push = (token: string, companyId: string, operations: SyncOperation[]) =>
    http<SyncPushResponse>(server.baseUrl, "POST", "/api/sync/push", { token, body: { companyId, operations } });
  const pull = (token: string, companyId: string, since?: string) =>
    http<SyncPullResponse>(server.baseUrl, "GET", `/api/sync/pull?companyId=${companyId}${since ? `&since=${since}` : ""}`, { token });
  const productOp = (tenant: SeededTenant, overrides: { sku?: string; warehouseId?: string; quantity?: number } = {}): SyncOperation => {
    const id = randomUUID(); const variantId = randomUUID();
    return {
      clientOperationId: randomUUID(), type: "PRODUCT_CREATE",
      payload: {
        id, categoryId: tenant.categoryId, name: "Blusa offline", variants: [{ id: variantId, sku: overrides.sku ?? `OFF-${randomUUID().slice(0, 8)}`, size: "M", color: "Crema", price: 180 }],
        initialStock: overrides.quantity ? [{ variantId, warehouseId: overrides.warehouseId ?? tenant.warehouseId, quantity: overrides.quantity }] : undefined,
      },
    };
  };

  beforeAll(async () => {
    db = await createMigratedDatabase("sync");
    A = await seedTenant(db, "SA", { planCode: "MAX" });
    B = await seedTenant(db, "SB", { planCode: "MAX" });
    F = await seedTenant(db, "SF", { planCode: "FREE" });
    server = await startTestApp(db);
    for (const [key, email] of Object.entries({ managerA: A.managerEmail, ownerA: A.ownerEmail, managerB: B.managerEmail, managerF: F.managerEmail })) tokens[key] = await login(server.baseUrl, email);
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  it("pull inicial (snapshot) del alcance del encargado con cursor", async () => {
    const result = await pull(tokens.managerA!, A.companyId);
    expect(result.status, result.text).toBe(200);
    expect(result.body.snapshot).toBe(true);
    expect(result.body.cursor).toMatch(/^\d+$/);
    expect(result.body.products.map((product) => product.id)).toEqual([A.productId]);
    expect(result.body.products[0]?.stock).toEqual([{ variantId: A.variantId, warehouseId: A.warehouseId, available: 50 }]);
    expect(result.body.stores.map((store) => store.id)).toEqual([A.storeId]);
    expect(result.body.warehouses.map((warehouse) => warehouse.id)).toEqual([A.warehouseId]);
    cursor = result.body.cursor;
  });

  it("cliente sin red: APPLIED y el reenvío del mismo clientOperationId es DUPLICATE", async () => {
    const operation: SyncOperation = { clientOperationId: randomUUID(), type: "CUSTOMER_CREATE", payload: { id: randomUUID(), firstName: "Rosa", lastName: "Mendez", phone: "70011122", taxId: "4455667", email: "rosa.offline@test.local" } };
    const first = await push(tokens.managerA!, A.companyId, [operation]);
    expect(first.body.results[0]).toMatchObject({ status: "APPLIED", entityId: operation.payload.id, version: 1 });
    const again = await push(tokens.managerA!, A.companyId, [operation]);
    expect(again.body.results[0]).toMatchObject({ status: "DUPLICATE", entityId: operation.payload.id });
    const [row] = await db.query<{ password_hash: string | null; registered_company_id: string; role: string }>("select password_hash, registered_company_id, role from app_users where id = $1", [operation.payload.id]);
    expect(row).toEqual({ password_hash: null, registered_company_id: A.companyId, role: "CUSTOMER" });
    expect((await http(server.baseUrl, "POST", "/api/auth/login", { body: { email: "rosa.offline@test.local", password: "Cualquiera1" } })).status).toBe(401);
  });

  it("conflictos de unicidad de cliente: documento y correo con opciones; correo de propietario REJECTED", async () => {
    const base = { firstName: "Otra", lastName: "Persona" };
    const result = await push(tokens.managerA!, A.companyId, [
      { clientOperationId: randomUUID(), type: "CUSTOMER_CREATE", payload: { ...base, id: randomUUID(), taxId: "4455667" } },
      { clientOperationId: randomUUID(), type: "CUSTOMER_CREATE", payload: { ...base, id: randomUUID(), email: "ROSA.offline@test.local" } },
      { clientOperationId: randomUUID(), type: "CUSTOMER_CREATE", payload: { ...base, id: randomUUID(), email: A.ownerEmail } },
    ]);
    expect(result.body.results.map((item) => [item.status, item.code])).toEqual([["CONFLICT", "DOCUMENT_TAKEN"], ["CONFLICT", "EMAIL_TAKEN"], ["REJECTED", "EMAIL_RESERVED"]]);
    expect(result.body.results[0]?.options).toEqual(["USE_EXISTING", "ADJUST_AND_RETRY", "DISCARD"]);
    expect(result.body.results[0]?.server).toMatchObject({ firstName: "Rosa", sameCompany: true });
  });

  it("producto sin red con stock inicial: entra como movimiento ENTRY y el reenvío no duplica stock", async () => {
    const operation = productOp(A, { quantity: 12 });
    const first = await push(tokens.managerA!, A.companyId, [operation]);
    expect(first.body.results[0], JSON.stringify(first.body)).toMatchObject({ status: "APPLIED", version: 1 });
    expect((await push(tokens.managerA!, A.companyId, [operation])).body.results[0]?.status).toBe("DUPLICATE");
    const variantId = (operation.payload as { variants: { id: string }[] }).variants[0]!.id;
    const [stock] = await db.query<{ physical_quantity: number }>("select physical_quantity from inventory_stocks where variant_id = $1", [variantId]);
    expect(stock?.physical_quantity).toBe(12);
    const movements = await db.query<{ movement_type: string; reference_type: string }>("select movement_type, reference_type from inventory_movements where variant_id = $1", [variantId]);
    expect(movements).toEqual([{ movement_type: "ENTRY", reference_type: "OFFLINE_SYNC" }]);
  });

  it("SKU repetido: CONFLICT con 'usar el existente' en la misma tienda; de otra tienda no revela datos", async () => {
    const own = await push(tokens.managerA!, A.companyId, [productOp(A, { sku: `SKU-${A.label}` })]);
    expect(own.body.results[0]).toMatchObject({ status: "CONFLICT", code: "SKU_TAKEN", options: ["USE_EXISTING", "ADJUST_AND_RETRY", "DISCARD"], server: { productId: A.productId } });
    const foreign = await push(tokens.managerA!, A.companyId, [productOp(A, { sku: `SKU-${B.label}` })]);
    expect(foreign.body.results[0]).toMatchObject({ status: "CONFLICT", code: "SKU_TAKEN", options: ["ADJUST_AND_RETRY", "DISCARD"] });
    expect(JSON.stringify(foreign.body)).not.toContain(B.productId);
    expect(JSON.stringify(foreign.body)).not.toContain("Producto SB");
  });

  it("stock inicial en un almacén ajeno → REJECTED; límite del plan → REJECTED PLAN_LIMIT_PRODUCTS (no CONFLICT)", async () => {
    const foreign = await push(tokens.managerA!, A.companyId, [productOp(A, { warehouseId: B.warehouseId, quantity: 3 })]);
    expect(foreign.body.results[0]).toMatchObject({ status: "REJECTED", code: "WAREHOUSE_NOT_FOUND" });
    for (let index = 0; index < 24; index += 1) {
      await db.query("insert into products (id, company_id, category_id, name, slug, status, created_at, updated_at) values ($1, $2, $3, 'P', $4, 'ACTIVE', now(), now())", [randomUUID(), F.companyId, F.categoryId, `relleno-${index}`]);
    }
    const limited = await push(tokens.managerF!, F.companyId, [productOp(F)]);
    expect(limited.body.results[0]).toMatchObject({ status: "REJECTED", code: "PLAN_LIMIT_PRODUCTS" });
  });

  it("edición con versión: desactualizada → CONFLICT VERSION_MISMATCH; 'conservar el mío' reenvía con la versión del servidor", async () => {
    const update = (baseVersion: number, name: string): SyncOperation => ({ clientOperationId: randomUUID(), type: "PRODUCT_UPDATE", baseVersion, payload: { id: A.productId, name } });
    expect((await push(tokens.ownerA!, A.companyId, [update(1, "Nombre del servidor")])).body.results[0]).toMatchObject({ status: "APPLIED", version: 2 });
    const stale = await push(tokens.managerA!, A.companyId, [update(1, "Nombre offline")]);
    expect(stale.body.results[0]).toMatchObject({ status: "CONFLICT", code: "VERSION_MISMATCH", options: ["KEEP_MINE", "KEEP_SERVER"], server: { version: 2, name: "Nombre del servidor" } });
    expect((await push(tokens.managerA!, A.companyId, [update(2, "Nombre offline")])).body.results[0]).toMatchObject({ status: "APPLIED", version: 3 });
  });

  it("pull incremental: trae lo nuevo desde el cursor y tombstones de lo desactivado", async () => {
    const changes = await pull(tokens.managerA!, A.companyId, cursor);
    expect(changes.body.snapshot).toBe(false);
    expect(changes.body.customers.map((customer) => customer.firstName)).toContain("Rosa");
    expect(changes.body.products.find((product) => product.id === A.productId)?.name).toBe("Nombre offline");
    expect(changes.body.products.some((product) => product.name === "Blusa offline")).toBe(true);
    expect(BigInt(changes.body.cursor) >= BigInt(cursor)).toBe(true);

    await db.query("update products set status = 'INACTIVE' where id = $1", [A.productId]);
    await db.query("update categories set active = false where id = $1", [A.categoryId]);
    const next = await pull(tokens.managerA!, A.companyId, changes.body.cursor);
    expect(next.body.tombstones).toEqual(expect.arrayContaining([{ entityType: "PRODUCT", id: A.productId }, { entityType: "CATEGORY", id: A.categoryId }]));
    // Sin cambios nuevos, un pull posterior solo puede reenviar (idempotente) lo ya recibido.
    const seen = new Set([...changes.body.products.map((product) => product.id), ...next.body.products.map((product) => product.id), ...next.body.tombstones.map((tombstone) => tombstone.id), ...changes.body.customers.map((customer) => customer.id)]);
    const quiet = await pull(tokens.managerA!, A.companyId, next.body.cursor);
    expect([...quiet.body.products.map((product) => product.id), ...quiet.body.tombstones.map((tombstone) => tombstone.id)].every((id) => seen.has(id))).toBe(true);
  });

  it("aislamiento: push y pull sobre otra compañía → 403 (encargado) / 404 (propietario); el pull nunca trae datos de otra tienda", async () => {
    expect((await push(tokens.managerA!, B.companyId, [productOp(B)])).status).toBe(403);
    expect((await pull(tokens.managerA!, B.companyId)).status).toBe(403);
    expect((await push(tokens.ownerA!, B.companyId, [productOp(B)])).status).toBe(404);
    expect((await pull(tokens.ownerA!, B.companyId)).status).toBe(404);
    const own = await pull(tokens.managerB!, B.companyId);
    expect(JSON.stringify(own.body)).not.toContain(A.productId);
    expect(own.body.customers).toEqual([]);
  });

  it("vinculación: si el cliente luego se registra con el mismo correo, obtiene acceso sobre su ficha", async () => {
    const register = await http<{ user: { id: string } }>(server.baseUrl, "POST", "/api/auth/register", { body: { firstName: "Rosa", lastName: "Mendez", email: "rosa.offline@test.local", password: "Rosa12345" } });
    expect(register.status, register.text).toBe(200);
    const [row] = await db.query<{ id: string; has_access: boolean; registered_company_id: string }>("select id, password_hash is not null as has_access, registered_company_id from app_users where email = 'rosa.offline@test.local'");
    expect(row).toMatchObject({ id: register.body.user.id, has_access: true, registered_company_id: A.companyId });
  });
});

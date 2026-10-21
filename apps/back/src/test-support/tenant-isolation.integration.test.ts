import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminReportAiNarrativeRequestSchema, adminReportAiQueryRequestSchema, assignStoreManagerRequestSchema, cashMovementRequestSchema,
  categoryRequestSchema, closeCashSessionRequestSchema, createManagerRequestSchema, createPointOfSaleRequestSchema, createPosSaleRequestSchema,
  createStoreRequestSchema, imageRequestSchema, inventoryMovementRequestSchema, inventoryTransferRequestSchema, openCashSessionRequestSchema,
  productRequestSchema, updatePointOfSaleRequestSchema, variantRequestSchema, warehouseRequestSchema,
} from "@velora/contracts";
import type { z } from "zod";
import { createMigratedDatabase, integrationDatabaseAvailable, type TestDatabase } from "./integration-database.js";
import { http, insertUser, listRoutes, login, seedTenant, startTestApp, type RouteInfo, type SeededTenant, type TestApp } from "./integration-app.js";

const available = await integrationDatabaseAvailable();

/** Valida el cuerpo contra el contrato real: un 400 por cuerpo inválido no prueba el aislamiento. */
function valid<T extends z.ZodType>(schema: T, body: z.input<T>): z.input<T> {
  schema.parse(body);
  return body;
}

interface Fixtures {
  pointOfSaleId: string;
  cashSessionId: string;
  posPaymentId: string;
  orderId: string;
  orderPaymentId: string;
}

interface Ctx { A: SeededTenant; B: SeededTenant; b: Fixtures }

type Expectation = "DENIED" | "NO_LEAK" | "SELF";
interface Attack { path: string; body?: unknown; raw?: { contentType: string; data: Uint8Array }; expect: Expectation }

/**
 * Casos A→B por ruta (sin el prefijo /api/admin o /api/manager, que comparten handler).
 * DENIED: 403/404 sin datos de B. NO_LEAK: listado sin compañía explícita → no debe contener datos de B.
 * SELF: ruta del propio titular sin parámetro de tenant (cualquier estado, nunca datos de B).
 */
const ATTACKS: Record<string, (ctx: Ctx) => Attack[]> = {
  "GET audit": () => [{ path: "/api/admin/audit", expect: "NO_LEAK" }],
  "GET companies": () => [{ path: "/api/admin/companies", expect: "NO_LEAK" }],
  "POST companies": () => [{ path: "/api/admin/companies", body: { name: "Otra tienda A", slug: `otra-a-${Date.now()}` }, expect: "SELF" }],
  "GET plan": () => [{ path: "/api/admin/plan", expect: "NO_LEAK" }],
  "POST plan/change": () => [{ path: "/api/admin/plan/change", body: { planCode: "MAX" }, expect: "SELF" }],
  "GET orders": ({ B }) => [{ path: "@/orders", expect: "NO_LEAK" }, { path: `@/orders?companyId=${B.companyId}`, expect: "DENIED" }],
  "POST orders/:orderId/fulfill": ({ b }) => [{ path: `@/orders/${b.orderId}/fulfill`, body: {}, expect: "DENIED" }],
  "POST payments/:paymentId/confirm": ({ b }) => [{ path: `@/payments/${b.orderPaymentId}/confirm`, body: {}, expect: "DENIED" }],
  "POST payments/:paymentId/fail": ({ b }) => [{ path: `@/payments/${b.orderPaymentId}/fail`, body: {}, expect: "DENIED" }],
  "POST payments/:paymentId/refund": ({ b }) => [{ path: `@/payments/${b.orderPaymentId}/refund`, body: {}, expect: "DENIED" }],
  "GET points-of-sale": ({ B }) => [{ path: `/api/admin/points-of-sale?companyId=${B.companyId}`, expect: "DENIED" }],
  "POST points-of-sale": ({ B }) => [{ path: "/api/admin/points-of-sale", body: valid(createPointOfSaleRequestSchema, { storeId: B.storeId, warehouseId: B.warehouseId, code: "INTRUSO", name: "Intruso" }), expect: "DENIED" }],
  "GET points-of-sale/:pointOfSaleId": ({ b }) => [{ path: `/api/admin/points-of-sale/${b.pointOfSaleId}`, expect: "DENIED" }],
  "PUT points-of-sale/:pointOfSaleId": ({ B, b }) => [{ path: `/api/admin/points-of-sale/${b.pointOfSaleId}`, body: valid(updatePointOfSaleRequestSchema, { warehouseId: B.warehouseId, code: "HACK", name: "Hack", active: false }), expect: "DENIED" }],
  "POST cash-sessions/open": ({ b }) => [{ path: "@/cash-sessions/open", body: valid(openCashSessionRequestSchema, { pointOfSaleId: b.pointOfSaleId, openingAmount: 0 }), expect: "DENIED" }],
  "GET cash-sessions/open/:pointOfSaleId": ({ b }) => [{ path: `@/cash-sessions/open/${b.pointOfSaleId}`, expect: "DENIED" }],
  "GET cash-sessions/:sessionId/movements": ({ b }) => [{ path: `@/cash-sessions/${b.cashSessionId}/movements`, expect: "DENIED" }],
  "POST cash-sessions/:sessionId/movements": ({ b }) => [{ path: `@/cash-sessions/${b.cashSessionId}/movements`, body: valid(cashMovementRequestSchema, { movementType: "CASH_OUT", amount: 1, reason: "intruso" }), expect: "DENIED" }],
  "POST cash-sessions/:sessionId/close": ({ b }) => [{ path: `@/cash-sessions/${b.cashSessionId}/close`, body: valid(closeCashSessionRequestSchema, { countedCashAmount: 0 }), expect: "DENIED" }],
  "POST pos/sales": ({ B, b }) => [{ path: "@/pos/sales", body: valid(createPosSaleRequestSchema, { clientOperationId: randomUUID(), cashSessionId: b.cashSessionId, paymentMethod: "CASH", items: [{ variantId: B.variantId, quantity: 1 }] }), expect: "DENIED" }],
  "GET pos/sales/pending/:sessionId": ({ b }) => [{ path: `@/pos/sales/pending/${b.cashSessionId}`, expect: "DENIED" }],
  "POST pos/sales/payments/:paymentId/confirm": ({ b }) => [{ path: `@/pos/sales/payments/${b.posPaymentId}/confirm`, body: {}, expect: "DENIED" }],
  "POST pos/sales/payments/:paymentId/fail": ({ b }) => [{ path: `@/pos/sales/payments/${b.posPaymentId}/fail`, body: {}, expect: "DENIED" }],
  "POST pos/sales/payments/:paymentId/cancel": ({ b }) => [{ path: `@/pos/sales/payments/${b.posPaymentId}/cancel`, body: {}, expect: "DENIED" }],
  "GET reports/overview": ({ B }) => [{ path: `/api/admin/reports/overview?companyId=${B.companyId}`, expect: "DENIED" }],
  "GET reports/period-bounds": ({ B }) => [{ path: `/api/admin/reports/period-bounds?companyId=${B.companyId}`, expect: "DENIED" }],
  "POST reports/ai-query": ({ B }) => [{ path: "/api/admin/reports/ai-query", body: valid(adminReportAiQueryRequestSchema, { companyId: B.companyId, question: "ventas del mes" }), expect: "DENIED" }],
  "POST reports/ai-narrative": ({ B }) => [{ path: "/api/admin/reports/ai-narrative", body: valid(adminReportAiNarrativeRequestSchema, { companyId: B.companyId, question: "resumen" }), expect: "DENIED" }],
  "POST reports/voice-transcribe": ({ B }) => [{ path: `/api/admin/reports/voice-transcribe?companyId=${B.companyId}`, raw: { contentType: "audio/webm", data: new Uint8Array([1, 2, 3, 4]) }, expect: "DENIED" }],
  "GET stores": ({ B }) => [{ path: `/api/admin/stores?companyId=${B.companyId}`, expect: "DENIED" }],
  "POST stores": ({ B }) => [{ path: "/api/admin/stores", body: valid(createStoreRequestSchema, { companyId: B.companyId, code: "INTRUSA", name: "Intrusa" }), expect: "DENIED" }],
  "PUT stores/:storeId/manager": ({ A, B }) => [
    { path: `/api/admin/stores/${B.storeId}/manager`, body: valid(assignStoreManagerRequestSchema, { userId: A.managerId }), expect: "DENIED" },
    { path: `/api/admin/stores/${A.storeId}/manager`, body: valid(assignStoreManagerRequestSchema, { userId: B.managerId }), expect: "DENIED" },
  ],
  "GET users/managers": ({ B }) => [{ path: `/api/admin/users/managers?companyId=${B.companyId}`, expect: "DENIED" }],
  "POST users/managers": ({ B }) => [{ path: "/api/admin/users/managers", body: valid(createManagerRequestSchema, { companyId: B.companyId, storeId: B.storeId, firstName: "In", lastName: "Truso", email: `intruso-${randomUUID()}@test.local`, password: "Intruso123" }), expect: "DENIED" }],
  "GET catalog/manage/categories": ({ B }) => [{ path: `/api/catalog/manage/categories?companyId=${B.companyId}`, expect: "DENIED" }],
  "POST catalog/manage/categories": ({ B }) => [{ path: "/api/catalog/manage/categories", body: valid(categoryRequestSchema, { companyId: B.companyId, name: "Intrusa", slug: `intrusa-${Date.now()}` }), expect: "DENIED" }],
  "PUT catalog/manage/categories/:id": ({ B }) => [{ path: `/api/catalog/manage/categories/${B.categoryId}`, body: valid(categoryRequestSchema, { companyId: B.companyId, name: "Hack", slug: "hack" }), expect: "DENIED" }],
  "GET catalog/manage/products": ({ B }) => [{ path: `/api/catalog/manage/products?companyId=${B.companyId}`, expect: "DENIED" }],
  "POST catalog/manage/products": ({ B }) => [{ path: "/api/catalog/manage/products", body: valid(productRequestSchema, { companyId: B.companyId, categoryId: B.categoryId, name: "Intruso", slug: `intruso-${Date.now()}` }), expect: "DENIED" }],
  "GET catalog/manage/products/:id": ({ B }) => [{ path: `/api/catalog/manage/products/${B.productId}?companyId=${B.companyId}`, expect: "DENIED" }],
  "PUT catalog/manage/products/:id": ({ B }) => [{ path: `/api/catalog/manage/products/${B.productId}`, body: valid(productRequestSchema, { companyId: B.companyId, categoryId: B.categoryId, name: "Hack", slug: "hack" }), expect: "DENIED" }],
  "POST catalog/manage/products/:productId/assets": ({ B }) => [{ path: `/api/catalog/manage/products/${B.productId}/assets`, body: { purpose: "GALLERY" }, expect: "DENIED" }],
  "POST catalog/manage/products/:productId/images": ({ B }) => [{ path: `/api/catalog/manage/products/${B.productId}/images`, body: valid(imageRequestSchema, { imageUrl: "https://example.com/x.jpg" }), expect: "DENIED" }],
  "POST catalog/manage/products/:productId/variants": ({ B }) => [{ path: `/api/catalog/manage/products/${B.productId}/variants`, body: valid(variantRequestSchema, { sku: `HACK-${Date.now()}`, size: "S", color: "Rojo", price: 1 }), expect: "DENIED" }],
  "PUT catalog/manage/variants/:id": ({ B }) => [{ path: `/api/catalog/manage/variants/${B.variantId}`, body: valid(variantRequestSchema, { sku: `HACK2-${Date.now()}`, size: "S", color: "Rojo", price: 1 }), expect: "DENIED" }],
  "GET inventory/warehouses": () => [{ path: "/api/inventory/warehouses", expect: "NO_LEAK" }],
  "POST inventory/warehouses": ({ B }) => [{ path: "/api/inventory/warehouses", body: valid(warehouseRequestSchema, { storeId: B.storeId, code: "INTRUSO", name: "Intruso" }), expect: "DENIED" }],
  "GET inventory/warehouses/:warehouseId/stock": ({ B }) => [{ path: `/api/inventory/warehouses/${B.warehouseId}/stock`, expect: "DENIED" }],
  "GET inventory/warehouses/:warehouseId/movements": ({ B }) => [{ path: `/api/inventory/warehouses/${B.warehouseId}/movements`, expect: "DENIED" }],
  "POST inventory/movements": ({ B }) => [{ path: "/api/inventory/movements", body: valid(inventoryMovementRequestSchema, { warehouseId: B.warehouseId, variantId: B.variantId, movementType: "ADJUSTMENT_OUT", quantity: 1, reason: "intruso" }), expect: "DENIED" }],
  "POST inventory/transfers": ({ A, B }) => [{ path: "/api/inventory/transfers", body: valid(inventoryTransferRequestSchema, { sourceWarehouseId: B.warehouseId, destinationWarehouseId: A.warehouseId, variantId: B.variantId, quantity: 1, reason: "intruso" }), expect: "DENIED" }],
};

function routeKey(route: Pick<RouteInfo, "method" | "path">): string {
  return `${route.method} ${route.path.replace(/^\/api\/(admin|manager)\//, "").replace(/^\/api\//, "")}`;
}

/** "@/x" = la misma ruta bajo el prefijo de la ruta reflejada (/api/admin o /api/manager). */
function resolvePath(attack: Attack, route: RouteInfo): string {
  if (!attack.path.startsWith("@/")) return attack.path;
  const prefix = route.path.startsWith("/api/manager/") ? "/api/manager" : "/api/admin";
  return `${prefix}${attack.path.slice(1)}`;
}

describe.skipIf(!available)("aislamiento multi-tenant A/B (integración)", () => {
  let db: TestDatabase;
  let server: TestApp;
  let ctx: Ctx;
  let routes: RouteInfo[];
  const tokens: Record<string, string> = {};
  let markers: string[];

  beforeAll(async () => {
    db = await createMigratedDatabase("isolation");
    const A = await seedTenant(db, "A", { planCode: "MAX" });
    const B = await seedTenant(db, "B", { planCode: "MAX" });
    const customerEmail = "cliente-iso@test.local";
    await insertUser(db, { email: customerEmail, role: "CUSTOMER" });
    server = await startTestApp(db);
    routes = listRoutes(server.app);
    for (const [key, email] of Object.entries({ ownerA: A.ownerEmail, ownerB: B.ownerEmail, managerA: A.managerEmail, managerB: B.managerEmail, customer: customerEmail })) {
      tokens[key] = await login(server.baseUrl, email);
    }
    const call = async <T>(token: string, method: string, path: string, body?: unknown, headers?: Record<string, string>) => {
      const result = await http<T>(server.baseUrl, method, path, { token, body, headers });
      if (result.status >= 300) throw new Error(`${method} ${path} → ${result.status} ${result.text}`);
      return result.body;
    };

    // Recursos reales de B creados por sus propios usuarios (también valida los caminos legítimos).
    const point = await call<{ id: string }>(tokens.ownerB!, "POST", "/api/admin/points-of-sale", { storeId: B.storeId, warehouseId: B.warehouseId, code: "CAJA-B", name: "Caja B" });
    const session = await call<{ id: string }>(tokens.managerB!, "POST", "/api/manager/cash-sessions/open", { pointOfSaleId: point.id, openingAmount: 100 });
    const sale = await call<{ paymentId: string }>(tokens.managerB!, "POST", "/api/manager/pos/sales", { clientOperationId: randomUUID(), cashSessionId: session.id, paymentMethod: "QR", items: [{ variantId: B.variantId, quantity: 1 }] });
    await call(tokens.customer!, "POST", "/api/customer/cart/items", { companyId: B.companyId, variantId: B.variantId, quantity: 1 });
    const order = await call<{ id: string }>(tokens.customer!, "POST", "/api/customer/orders", { companyId: B.companyId, warehouseId: B.warehouseId, fulfillmentType: "PICKUP" }, { "Idempotency-Key": randomUUID() });
    let orderPaymentId: string | null = null;
    for (const method of ["CASH", "COD", "QR", "CARD"]) {
      const created = await http<{ id: string }>(server.baseUrl, "POST", `/api/customer/orders/${order.id}/payments`, { token: tokens.customer, body: { method } });
      if (created.status < 300) { orderPaymentId = created.body.id; break; }
    }
    if (!orderPaymentId) throw new Error("No se pudo crear un pago de pedido para B.");
    ctx = { A, B, b: { pointOfSaleId: point.id, cashSessionId: session.id, posPaymentId: sale.paymentId, orderId: order.id, orderPaymentId } };
    markers = [B.companyId, B.storeId, B.warehouseId, B.productId, B.variantId, B.categoryId, B.managerId, B.ownerId, point.id, session.id, order.id, orderPaymentId, B.ownerEmail, B.managerEmail, "Compania B", "Sucursal B"];
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  const adminRoutes = () => routes.filter((route) => route.roles.includes("ADMIN"));

  it("toda ruta accesible por ADMIN (enumerada por reflexión de Nest) tiene un caso A/B", () => {
    const missing = [...new Set(adminRoutes().map(routeKey))].filter((key) => !ATTACKS[key]);
    expect(adminRoutes().length).toBeGreaterThan(40);
    expect(missing).toEqual([]);
  });

  async function runAttacks(token: string, routeFilter: (route: RouteInfo) => boolean): Promise<{ checked: number; failures: string[] }> {
    const failures: string[] = [];
    let checked = 0;
    for (const route of routes.filter(routeFilter)) {
      for (const attack of ATTACKS[routeKey(route)]?.(ctx) ?? []) {
        const path = resolvePath(attack, route);
        const result = await http(server.baseUrl, route.method, path, { token, body: attack.body, raw: attack.raw });
        checked += 1;
        const leaked = markers.filter((marker) => result.text.includes(marker));
        if (leaked.length > 0) failures.push(`${route.method} ${path} filtró ${leaked.join(", ")} (status ${result.status})`);
        if (attack.expect === "DENIED" && result.status !== 403 && result.status !== 404) failures.push(`${route.method} ${path} → ${result.status} (se esperaba 403/404): ${result.text.slice(0, 160)}`);
        if (attack.expect === "NO_LEAK" && result.status >= 400) failures.push(`${route.method} ${path} → ${result.status} en un listado propio: ${result.text.slice(0, 160)}`);
      }
    }
    return { checked, failures };
  }

  it("el propietario A no puede leer ni modificar recursos del propietario B en ninguna ruta ADMIN", async () => {
    const { checked, failures } = await runAttacks(tokens.ownerA!, (route) => route.roles.includes("ADMIN"));
    expect(checked).toBeGreaterThan(50);
    expect(failures).toEqual([]);
  });

  it("el encargado de A no accede a la compañía de B en las rutas compartidas con STORE_MANAGER", async () => {
    const { checked, failures } = await runAttacks(tokens.managerA!, (route) => route.roles.includes("STORE_MANAGER") && route.roles.includes("ADMIN"));
    expect(checked).toBeGreaterThan(20);
    expect(failures).toEqual([]);
  });

  it("el propietario B sí opera sus propios recursos (control positivo: no hay 401/403/404 por alcance)", async () => {
    const own: [string, string][] = [
      ["GET", `/api/admin/stores?companyId=${ctx.B.companyId}`],
      ["GET", `/api/admin/users/managers?companyId=${ctx.B.companyId}`],
      ["GET", `/api/admin/points-of-sale?companyId=${ctx.B.companyId}`],
      ["GET", `/api/admin/points-of-sale/${ctx.b.pointOfSaleId}`],
      ["GET", `/api/admin/reports/period-bounds?companyId=${ctx.B.companyId}`],
      ["GET", `/api/admin/reports/overview?companyId=${ctx.B.companyId}`],
      ["GET", `/api/catalog/manage/products?companyId=${ctx.B.companyId}`],
      ["GET", `/api/catalog/manage/products/${ctx.B.productId}?companyId=${ctx.B.companyId}`],
      ["GET", `/api/inventory/warehouses/${ctx.B.warehouseId}/stock`],
      ["GET", `/api/admin/pos/sales/pending/${ctx.b.cashSessionId}`],
      ["GET", `/api/admin/orders?companyId=${ctx.B.companyId}`],
    ];
    for (const [method, path] of own) {
      const result = await http(server.baseUrl, method, path, { token: tokens.ownerB });
      expect(result.status, `${method} ${path}: ${result.text.slice(0, 200)}`).toBeLessThan(300);
    }
    const companies = await http<{ id: string }[]>(server.baseUrl, "GET", "/api/admin/companies", { token: tokens.ownerB });
    expect(companies.body.map((company) => company.id)).toEqual([ctx.B.companyId]);
    const orders = await http<{ id: string }[]>(server.baseUrl, "GET", "/api/admin/orders", { token: tokens.ownerB });
    expect(orders.body.map((order) => order.id)).toContain(ctx.b.orderId);
    const audit = await http(server.baseUrl, "GET", "/api/admin/audit", { token: tokens.ownerB });
    expect(audit.text).toContain(ctx.B.ownerEmail);
  });

  it("reemplazar el encargado deja un solo encargado activo y desactiva el anterior", async () => {
    const result = await http<{ manager: { id: string; status: string }; replacedManagerId: string | null }>(server.baseUrl, "PUT", `/api/admin/stores/${ctx.A.storeId}/manager`, {
      token: tokens.ownerA,
      body: { firstName: "Nuevo", lastName: "Encargado", email: "nuevo-encargado-a@test.local", password: "Nuevo1234" },
    });
    expect(result.status, result.text).toBe(200);
    expect(result.body.replacedManagerId).toBe(ctx.A.managerId);
    const active = await db.query<{ id: string }>("select id from app_users where store_id = $1 and role = 'STORE_MANAGER' and status = 'ACTIVE'", [ctx.A.storeId]);
    expect(active.map((row) => row.id)).toEqual([result.body.manager.id]);
    const second = await http(server.baseUrl, "POST", "/api/admin/users/managers", {
      token: tokens.ownerA,
      body: { companyId: ctx.A.companyId, storeId: ctx.A.storeId, firstName: "Otro", lastName: "Mas", email: "otro-a@test.local", password: "Otro12345" },
    });
    expect(second.status).toBe(409);
  });
});

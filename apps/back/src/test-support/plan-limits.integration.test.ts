import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AdminPlanResponse, ApiError, OrderResponse, Plan, ReportOverview } from "@velora/contracts";
import { createMigratedDatabase, integrationDatabaseAvailable, type TestDatabase } from "./integration-database.js";
import { http, insertUser, login, seedTenant, startTestApp, subscribe, type SeededTenant, type TestApp } from "./integration-app.js";

const available = await integrationDatabaseAvailable();

describe.skipIf(!available)("planes, suscripciones y límites (integración)", () => {
  let db: TestDatabase;
  let server: TestApp;
  let free: SeededTenant;
  let plus: SeededTenant;
  let max: SeededTenant;
  let expired: SeededTenant;
  const tokens: Record<string, string> = {};
  const customerEmail = "cliente-planes@test.local";
  let customerId: string;

  const call = <T = unknown>(token: string | undefined, method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
    http<T>(server.baseUrl, method, path, { token, body, headers });

  beforeAll(async () => {
    db = await createMigratedDatabase("plans");
    free = await seedTenant(db, "F", { planCode: "FREE" });
    plus = await seedTenant(db, "P", { planCode: "PLUS" });
    max = await seedTenant(db, "M", { planCode: "MAX" });
    expired = await seedTenant(db, "E");
    await subscribe(db, expired.ownerId, "PLUS", { status: "ACTIVE", periodEnd: new Date(Date.now() - 60_000) });
    customerId = await insertUser(db, { email: customerEmail, role: "CUSTOMER" });
    server = await startTestApp(db);
    for (const tenant of [free, plus, max, expired]) {
      tokens[`owner${tenant.label}`] = await login(server.baseUrl, tenant.ownerEmail);
      tokens[`manager${tenant.label}`] = await login(server.baseUrl, tenant.managerEmail);
    }
    tokens.customer = await login(server.baseUrl, customerEmail);
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  const newStore = (tenant: SeededTenant) => ({ companyId: tenant.companyId, code: `S-${randomUUID().slice(0, 8)}`, name: "Sucursal extra" });
  const newProduct = (tenant: SeededTenant) => ({ companyId: tenant.companyId, categoryId: tenant.categoryId, name: "Producto extra", slug: `extra-${randomUUID().slice(0, 8)}` });

  it("publica los planes sembrados (datos, no código)", async () => {
    const plans = await call<Plan[]>(undefined, "GET", "/api/plans");
    expect(plans.status).toBe(200);
    expect(plans.body.map((plan) => [plan.code, plan.limits.maxCompanies, plan.limits.maxStoresPerCompany, plan.reports.tier])).toEqual([
      ["FREE", 1, 1, "BASIC"], ["PLUS", 2, 3, "STANDARD"], ["MAX", 5, 10, "ADVANCED"],
    ]);
  });

  it("FREE: 1 sucursal por tienda; la segunda devuelve PLAN_LIMIT_STORES sugiriendo PLUS", async () => {
    const result = await call<ApiError>(tokens.ownerF, "POST", "/api/admin/stores", newStore(free));
    expect(result.status).toBe(402);
    expect(result.body).toMatchObject({ code: "PLAN_LIMIT_STORES", details: { limit: 1, used: 1, requiredPlan: "PLUS" } });
  });

  it("PLUS: crea sucursales hasta 3 y rechaza la cuarta", async () => {
    for (let index = 0; index < 2; index += 1) {
      const created = await call(tokens.ownerP, "POST", "/api/admin/stores", newStore(plus));
      expect(created.status, created.text).toBeLessThan(300);
    }
    const rejected = await call<ApiError>(tokens.ownerP, "POST", "/api/admin/stores", newStore(plus));
    expect(rejected.body).toMatchObject({ code: "PLAN_LIMIT_STORES", details: { limit: 3, used: 3, requiredPlan: "MAX" } });
  });

  it("FREE: 25 productos por tienda; archivar uno libera cupo", async () => {
    for (let index = 0; index < 24; index += 1) {
      await db.query("insert into products (id, company_id, category_id, name, slug, status, created_at, updated_at) values ($1, $2, $3, 'P', $4, 'ACTIVE', now(), now())", [randomUUID(), free.companyId, free.categoryId, `relleno-${index}`]);
    }
    const rejected = await call<ApiError>(tokens.ownerF, "POST", "/api/catalog/manage/products", newProduct(free));
    expect(rejected.body).toMatchObject({ code: "PLAN_LIMIT_PRODUCTS", details: { limit: 25, used: 25 } });
    await db.query("update products set status = 'INACTIVE' where company_id = $1 and slug = 'relleno-0'", [free.companyId]);
    const created = await call(tokens.ownerF, "POST", "/api/catalog/manage/products", newProduct(free));
    expect(created.status, created.text).toBeLessThan(300);
  });

  it("MAX: productos ilimitados", async () => {
    const created = await call(tokens.ownerM, "POST", "/api/catalog/manage/products", newProduct(max));
    expect(created.status, created.text).toBeLessThan(300);
  });

  it("suscripción vencida: pasa a PAST_DUE de forma perezosa, aplica FREE, bloquea crear y no oculta lo existente", async () => {
    const plan = await call<AdminPlanResponse>(tokens.ownerE, "GET", "/api/admin/plan");
    expect(plan.body).toMatchObject({ restricted: true, effectivePlan: { code: "FREE" }, subscription: { status: "PAST_DUE", planCode: "PLUS" } });
    const [row] = await db.query<{ status: string }>("select status from subscriptions where owner_user_id = $1", [expired.ownerId]);
    expect(row?.status).toBe("PAST_DUE");
    const blocked = await call<ApiError>(tokens.ownerE, "POST", "/api/catalog/manage/products", newProduct(expired));
    expect(blocked.body).toMatchObject({ code: "SUBSCRIPTION_INACTIVE" });
    const listed = await call<unknown[]>(tokens.ownerE, "GET", `/api/catalog/manage/products?companyId=${expired.companyId}`);
    expect(listed.status).toBe(200);
    expect(listed.body.length).toBe(1);
  });

  it("probador: FREE permite 3 usos/mes por cliente y compañía; no cuentan otros meses ni otras compañías", async () => {
    await db.query("update products set try_on_enabled = true, try_on_category = 'TOP' where id = any($1::uuid[])", [[free.productId, max.productId]]);
    const garment = async (productId: string) => {
      const id = randomUUID();
      await db.query("insert into product_images (id, product_id, image_url, purpose, created_at) values ($1, $2, 'https://x/y.png', 'TRY_ON_GARMENT', now())", [id, productId]);
      return id;
    };
    const freeGarment = await garment(free.productId);
    const maxGarment = await garment(max.productId);
    const job = (productId: string, imageId: string, createdAt: string) => db.query(
      `insert into try_on_jobs (id, user_id, product_id, garment_image_id, provider, status, result_storage_key, result_content_type, result_size_bytes, created_at, updated_at, completed_at)
       values ($1, $2, $3, $4, 'LOCAL', 'SUCCEEDED', $5, 'image/png', 10, ${createdAt}, now(), now())`,
      [randomUUID(), customerId, productId, imageId, `${randomUUID()}.png`],
    );
    await job(free.productId, freeGarment, "now() - interval '3 months'");
    await job(max.productId, maxGarment, "now()");
    await job(free.productId, freeGarment, "now()");
    await job(free.productId, freeGarment, "now()");

    const underQuota = await call<ApiError>(tokens.customer, "POST", "/api/customer/try-on/jobs", { productId: free.productId });
    expect(underQuota.body?.code).not.toBe("PLAN_LIMIT_TRY_ON");

    await job(free.productId, freeGarment, "now()");
    const overQuota = await call<ApiError>(tokens.customer, "POST", "/api/customer/try-on/jobs", { productId: free.productId });
    expect(overQuota.status).toBe(402);
    expect(overQuota.body).toMatchObject({ code: "PLAN_LIMIT_TRY_ON", details: { limit: 3, used: 3, requiredPlan: "PLUS" } });

    const unlimited = await call<ApiError>(tokens.customer, "POST", "/api/customer/try-on/jobs", { productId: max.productId });
    expect(unlimited.body?.code).not.toBe("PLAN_LIMIT_TRY_ON");
  });

  it("dashboard: widgets distintos por nivel (BASIC / STANDARD / ADVANCED) filtrados en el backend", async () => {
    const overview = async (token: string | undefined, tenant: SeededTenant, query = "") => call<ReportOverview>(token, "GET", `/api/admin/reports/overview?companyId=${tenant.companyId}${query}`);
    const basic = await overview(tokens.ownerF, free, "&from=2020-01-01");
    expect(basic.status, basic.text).toBe(200);
    expect(basic.body.tier).toBe("BASIC");
    expect(basic.body.kpis.map((kpi) => kpi.key)).toEqual(["NET_SALES", "PAID_ORDERS", "AVERAGE_TICKET", "LOW_STOCK_VARIANTS"]);
    expect(basic.body.charts.map((chart) => chart.id)).toEqual(["sales-daily"]);
    expect(basic.body.locked?.find((widget) => widget.id === "GROSS_SALES")).toMatchObject({ minTier: "STANDARD", requiredPlan: "PLUS" });
    expect(basic.body.locked?.find((widget) => widget.id === "REPEAT_CUSTOMERS")).toMatchObject({ minTier: "ADVANCED", requiredPlan: "MAX" });
    expect(basic.body.policy).toMatchObject({ historyDays: 30, clamped: true, canExport: false, canAiNarrative: false });
    expect(basic.body.from > "2020-01-01").toBe(true);

    const standard = await overview(tokens.ownerP, plus);
    expect(standard.status, standard.text).toBe(200);
    expect(standard.body.tier).toBe("STANDARD");
    expect(standard.body.kpis.map((kpi) => kpi.key)).toContain("GROSS_SALES");
    expect(standard.body.charts.map((chart) => chart.id)).toEqual(expect.arrayContaining(["sales-store", "orders-channel", "payments-method"]));
    expect(standard.body.locked?.length).toBeGreaterThan(0);
    expect(standard.body.locked?.every((widget) => widget.minTier === "ADVANCED")).toBe(true);

    const advanced = await overview(tokens.ownerM, max);
    expect(advanced.body.tier).toBe("ADVANCED");
    expect(advanced.body.kpis.map((kpi) => kpi.key)).toEqual(expect.arrayContaining(["TICKET_PER_CUSTOMER", "REPEAT_CUSTOMERS"]));
    expect(advanced.body.locked).toEqual([]);

    const managerBasic = await call<ReportOverview>(tokens.managerF, "GET", "/api/manager/reports/overview");
    expect(managerBasic.body.tier).toBe("BASIC");
  });

  it("reportes: filtro por sucursal, IA y voz según el plan (D3)", async () => {
    const storeFilter = await call<ApiError>(tokens.ownerF, "GET", `/api/admin/reports/overview?companyId=${free.companyId}&storeId=${free.storeId}`);
    expect(storeFilter.body).toMatchObject({ code: "PLAN_LIMIT_REPORT_FEATURE", details: { feature: "STORE_FILTER", requiredPlan: "PLUS" } });
    const narrativeFree = await call<ApiError>(tokens.ownerF, "POST", "/api/admin/reports/ai-narrative", { companyId: free.companyId, question: "resumen" });
    expect(narrativeFree.body).toMatchObject({ code: "PLAN_LIMIT_REPORT_FEATURE", details: { feature: "AI_NARRATIVE", requiredPlan: "PLUS" } });
    const narrativePlus = await call<ApiError>(tokens.ownerP, "POST", "/api/admin/reports/ai-narrative", { companyId: plus.companyId, question: "resumen" });
    expect(narrativePlus.body?.code).not.toBe("PLAN_LIMIT_REPORT_FEATURE");
    const voicePlus = await http<ApiError>(server.baseUrl, "POST", `/api/admin/reports/voice-transcribe?companyId=${plus.companyId}`, { token: tokens.ownerP, raw: { contentType: "audio/webm", data: new Uint8Array([1, 2, 3]) } });
    expect(voicePlus.body).toMatchObject({ code: "PLAN_LIMIT_REPORT_FEATURE", details: { feature: "VOICE", requiredPlan: "MAX" } });
  });

  async function placeOrder(tenant: SeededTenant, quantity: number): Promise<OrderResponse> {
    const added = await call(tokens.customer, "POST", "/api/customer/cart/items", { companyId: tenant.companyId, variantId: tenant.variantId, quantity });
    expect(added.status, added.text).toBeLessThan(300);
    const order = await call<OrderResponse>(tokens.customer, "POST", "/api/customer/orders", { companyId: tenant.companyId, warehouseId: tenant.warehouseId, fulfillmentType: "PICKUP" }, { "Idempotency-Key": randomUUID() });
    expect(order.status, order.text).toBeLessThan(300);
    return order.body;
  }

  it("MAX: descuento automático por compras entregadas en los últimos 12 meses (escalones del seed)", async () => {
    const first = await placeOrder(max, 2);
    expect(first).toMatchObject({ subtotal: 200, total: 200, discountAmount: 0 });
    // Historial: 1600 BOB entregados (>= 1500 → 5%).
    const history = await placeOrder(max, 16);
    await db.query("update orders set status = 'FULFILLED', fulfilled_at = now() where id = $1", [history.id]);
    const discounted = await placeOrder(max, 2);
    expect(discounted).toMatchObject({ subtotal: 200, total: 190, discountAmount: 10 });
    expect(discounted.discountReason).toContain("5%");

    // Las compras en FREE no generan descuento aunque el cliente tenga historial allí.
    const freeHistory = await placeOrder(free, 16);
    await db.query("update orders set status = 'FULFILLED', fulfilled_at = now() where id = $1", [freeHistory.id]);
    const noDiscount = await placeOrder(free, 1);
    expect(noDiscount).toMatchObject({ subtotal: 100, total: 100, discountAmount: 0 });
  });

  it("MAX: el descuento también se aplica en POS cuando la venta identifica al cliente", async () => {
    const point = await call<{ id: string }>(tokens.ownerM, "POST", "/api/admin/points-of-sale", { storeId: max.storeId, warehouseId: max.warehouseId, code: "CAJA-M", name: "Caja M" });
    const session = await call<{ id: string }>(tokens.managerM, "POST", "/api/manager/cash-sessions/open", { pointOfSaleId: point.body.id, openingAmount: 0 });
    const sale = await call<{ orderId: string; subtotal: number; total: number; paymentId: string }>(tokens.managerM, "POST", "/api/manager/pos/sales", {
      clientOperationId: randomUUID(), cashSessionId: session.body.id, customerId, paymentMethod: "CASH", items: [{ variantId: max.variantId, quantity: 1 }],
    });
    expect(sale.status, sale.text).toBeLessThan(300);
    expect(sale.body).toMatchObject({ subtotal: 100, total: 95 });
    const [payment] = await db.query<{ amount: string }>("select amount from payments where id = $1", [sale.body.paymentId]);
    expect(Number(payment?.amount)).toBe(95);
  });

  it("cambio de plan: upgrade inmediato y downgrade bloqueado con 409 si el uso excede (D2)", async () => {
    const upgraded = await call<AdminPlanResponse>(tokens.ownerF, "POST", "/api/admin/plan/change", { planCode: "PLUS", card: { cardNumber: "4242 4242 4242 4242", holderName: "Dueno F" } });
    expect(upgraded.status, upgraded.text).toBe(200);
    expect(upgraded.body).toMatchObject({ effectivePlan: { code: "PLUS" }, restricted: false, subscription: { status: "ACTIVE", planCode: "PLUS" } });
    const nowAllowed = await call(tokens.ownerF, "POST", "/api/admin/stores", newStore(free));
    expect(nowAllowed.status, nowAllowed.text).toBeLessThan(300);

    const downgrade = await call<ApiError>(tokens.ownerP, "POST", "/api/admin/plan/change", { planCode: "FREE" });
    expect(downgrade.status).toBe(409);
    expect(downgrade.body).toMatchObject({ code: "PLAN_DOWNGRADE_EXCEEDS" });
    expect((downgrade.body.details as { excess: { resource: string; used: number; limit: number }[] }).excess).toEqual(
      expect.arrayContaining([expect.objectContaining({ resource: "stores", used: 3, limit: 1 })]),
    );
  });
});

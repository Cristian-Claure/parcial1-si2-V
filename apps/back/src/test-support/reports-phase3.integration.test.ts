import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ReportChart, ReportOverview } from "@velora/contracts";
import { createMigratedDatabase, integrationDatabaseAvailable, type TestDatabase } from "./integration-database.js";
import { http, insertUser, login, seedTenant, startTestApp, type SeededTenant, type TestApp } from "./integration-app.js";

const available = await integrationDatabaseAvailable();
const LOCAL = "America/La_Paz";

/**
 * Fase 3: widgets por nivel, ventana de historial y cifras de cada widget nuevo frente a una
 * referencia independiente (filas crudas de la BD agregadas en JS). Los pedidos se crean por el
 * flujo HTTP real y solo se reubican sus fechas, como en el generador de datos.
 */
describe.skipIf(!available)("reportes Fase 3: catálogo completo de widgets (integración)", () => {
  let db: TestDatabase;
  let server: TestApp;
  let free: SeededTenant;
  let plus: SeededTenant;
  let max: SeededTenant;
  let other: SeededTenant;
  let today: string;
  const store2 = { storeId: randomUUID(), warehouseId: randomUUID(), name: "Sucursal M2" };
  const product2 = { categoryId: randomUUID(), productId: randomUUID(), variantId: randomUUID() };
  const criticalVariant = { productId: randomUUID(), variantId: randomUUID(), sku: "SKU-CRITICO" };
  const tokens: Record<string, string> = {};

  const call = <T = unknown>(token: string | undefined, method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
    http<T>(server.baseUrl, method, path, { token, body, headers });
  const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const ok = (result: { status: number; text: string }) => expect(result.status, result.text).toBeLessThan(300);

  async function order(customer: string, tenant: SeededTenant, warehouseId: string, items: { variantId: string; quantity: number }[]) {
    await call(tokens[customer], "DELETE", `/api/customer/cart?companyId=${tenant.companyId}`);
    for (const item of items) ok(await call(tokens[customer], "POST", "/api/customer/cart/items", { companyId: tenant.companyId, ...item }));
    const created = await call<{ id: string }>(tokens[customer], "POST", "/api/customer/orders", { companyId: tenant.companyId, warehouseId, fulfillmentType: "PICKUP" }, { "Idempotency-Key": randomUUID() });
    ok(created);
    const payment = await call<{ id: string }>(tokens[customer], "POST", `/api/customer/orders/${created.body.id}/payments`, { method: "CASH" });
    ok(payment);
    return { orderId: created.body.id, paymentId: payment.body.id };
  }

  /** Reubica un pedido (y su pago) en `day` a la hora local indicada. */
  async function placeAt(orderId: string, day: string, hour: number, refundHour?: number) {
    const at = `('${day}'::date + make_interval(hours => ${hour})) at time zone '${LOCAL}'`;
    await db.query(`update orders set created_at = ${at}, updated_at = ${at},
      fulfilled_at = case when fulfilled_at is not null then ${at} + interval '1 hour' end,
      cancelled_at = case when cancelled_at is not null then ${at} + interval '1 hour' end where id = $1`, [orderId]);
    const refund = refundHour === undefined ? "null::timestamptz" : `('${day}'::date + make_interval(hours => ${refundHour})) at time zone '${LOCAL}'`;
    await db.query(`update payments set created_at = ${at}, updated_at = ${at},
      paid_at = case when paid_at is not null then ${at} + interval '10 minutes' end,
      failed_at = case when failed_at is not null then ${at} + interval '10 minutes' end,
      refunded_at = case when refunded_at is not null then ${refund} end where order_id = $1`, [orderId]);
  }

  beforeAll(async () => {
    db = await createMigratedDatabase("reports3");
    free = await seedTenant(db, "F", { planCode: "FREE" });
    plus = await seedTenant(db, "P", { planCode: "PLUS" });
    max = await seedTenant(db, "M", { planCode: "MAX" });
    other = await seedTenant(db, "X", { planCode: "MAX" });

    // MAX: segunda sucursal, segunda categoría y una variante en stock crítico.
    await db.query("insert into stores (id, code, name, active, company_id, created_at, updated_at) values ($1, 'S_M2', $2, true, $3, now(), now())", [store2.storeId, store2.name, max.companyId]);
    await db.query("insert into warehouses (id, store_id, code, name, active, default_warehouse, created_at, updated_at) values ($1, $2, 'W_M2', 'Almacen M2', true, true, now(), now())", [store2.warehouseId, store2.storeId]);
    await db.query("insert into categories (id, company_id, name, slug, active, created_at, updated_at) values ($1, $2, 'Abrigos M', 'abrigos-m', true, now(), now())", [product2.categoryId, max.companyId]);
    for (const [productId, categoryId, name, slug] of [[product2.productId, product2.categoryId, "Abrigo M", "abrigo-m"], [criticalVariant.productId, max.categoryId, "Bufanda M", "bufanda-m"]]) {
      await db.query("insert into products (id, company_id, category_id, name, slug, description, status, created_at, updated_at) values ($1, $2, $3, $4, $5, 'x', 'ACTIVE', now(), now())", [productId, max.companyId, categoryId, name, slug]);
    }
    await db.query("insert into product_variants (id, product_id, sku, size, color, price, currency, active, created_at, updated_at) values ($1, $2, 'SKU-ABRIGO', 'M', 'Camel', 250, 'BOB', true, now(), now())", [product2.variantId, product2.productId]);
    await db.query("insert into product_variants (id, product_id, sku, size, color, price, currency, active, created_at, updated_at) values ($1, $2, $3, 'U', 'Gris', 80, 'BOB', true, now(), now())", [criticalVariant.variantId, criticalVariant.productId, criticalVariant.sku]);
    for (const [warehouseId, variantId, quantity] of [[max.warehouseId, product2.variantId, 50], [store2.warehouseId, product2.variantId, 50], [store2.warehouseId, max.variantId, 50], [max.warehouseId, criticalVariant.variantId, 2]] as const) {
      await db.query("insert into inventory_stocks (id, warehouse_id, variant_id, physical_quantity, committed_quantity, created_at, updated_at) values ($1, $2, $3, $4, 0, now(), now())", [randomUUID(), warehouseId, variantId, quantity]);
    }
    for (const label of ["c1", "c2", "cx"]) await insertUser(db, { email: `${label}-fase3@test.local`, role: "CUSTOMER" });

    server = await startTestApp(db);
    for (const tenant of [free, plus, max, other]) tokens[`owner${tenant.label}`] = await login(server.baseUrl, tenant.ownerEmail);
    for (const label of ["c1", "c2", "cx"]) tokens[label] = await login(server.baseUrl, `${label}-fase3@test.local`);
    today = (await db.query<{ day: string }>(`select to_char(now() at time zone '${LOCAL}', 'YYYY-MM-DD') as day`))[0]!.day;

    // A: periodo anterior (c1, sucursal 1). B: actual (c1, sucursal 2). C: cancelado. D: pagado y reembolsado.
    const a = await order("c1", max, max.warehouseId, [{ variantId: max.variantId, quantity: 2 }]);
    ok(await call(tokens.ownerM, "POST", `/api/admin/payments/${a.paymentId}/confirm`, {}));
    ok(await call(tokens.ownerM, "POST", `/api/admin/orders/${a.orderId}/fulfill`, {}));
    const b = await order("c1", max, store2.warehouseId, [{ variantId: product2.variantId, quantity: 1 }]);
    ok(await call(tokens.ownerM, "POST", `/api/admin/payments/${b.paymentId}/confirm`, {}));
    ok(await call(tokens.ownerM, "POST", `/api/admin/orders/${b.orderId}/fulfill`, {}));
    const c = await order("c2", max, max.warehouseId, [{ variantId: max.variantId, quantity: 1 }]);
    ok(await call(tokens.ownerM, "POST", `/api/admin/payments/${c.paymentId}/fail`, { reason: "Pago no completado" }));
    ok(await call(tokens.c2, "POST", `/api/customer/orders/${c.orderId}/cancel`, {}));
    const d = await order("c2", max, max.warehouseId, [{ variantId: product2.variantId, quantity: 2 }]);
    ok(await call(tokens.ownerM, "POST", `/api/admin/payments/${d.paymentId}/confirm`, {}));
    ok(await call(tokens.ownerM, "POST", `/api/admin/payments/${d.paymentId}/refund`, { reason: "Devolución" }));
    // Otra empresa MAX con ventas los mismos días: no debe filtrarse a M.
    const x = await order("cx", other, other.warehouseId, [{ variantId: other.variantId, quantity: 3 }]);
    ok(await call(tokens.ownerX, "POST", `/api/admin/payments/${x.paymentId}/confirm`, {}));

    await placeAt(a.orderId, shift(today, -40), 15);
    await placeAt(b.orderId, shift(today, -3), 13);
    await placeAt(c.orderId, shift(today, -2), 10);
    await placeAt(d.orderId, shift(today, -1), 20, 21);
    await placeAt(x.orderId, shift(today, -3), 13);
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  const overview = (token: string | undefined, tenant: SeededTenant, from: string, to: string) =>
    call<ReportOverview>(token, "GET", `/api/admin/reports/overview?companyId=${tenant.companyId}&from=${from}&to=${to}`);
  const chart = (result: ReportOverview, id: string) => result.charts.find((candidate) => candidate.id === id) as ReportChart;
  const kpi = (result: ReportOverview, key: string) => result.kpis.find((candidate) => candidate.key === key);

  /** Referencia independiente: filas crudas de la compañía y agregación en JS. */
  async function reference(tenant: SeededTenant, from: string, to: string) {
    const rows = await db.query<{ order_id: string; store: string; customer_id: string | null; status: string; fulfillment_type: string; created_day: string; created_dow: number; created_hour: number;
      cancelled_day: string | null; payment_status: string | null; amount: string | null; paid_day: string | null; refunded_day: string | null }>(`
      select o.id order_id, s.name store, o.customer_id, o.status, o.fulfillment_type,
        to_char(o.created_at at time zone '${LOCAL}', 'YYYY-MM-DD') created_day,
        extract(isodow from o.created_at at time zone '${LOCAL}')::int created_dow, extract(hour from o.created_at at time zone '${LOCAL}')::int created_hour,
        to_char(o.cancelled_at at time zone '${LOCAL}', 'YYYY-MM-DD') cancelled_day, p.status payment_status, p.amount,
        to_char(p.paid_at at time zone '${LOCAL}', 'YYYY-MM-DD') paid_day, to_char(p.refunded_at at time zone '${LOCAL}', 'YYYY-MM-DD') refunded_day
      from orders o join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id left join payments p on p.order_id = o.id
      where s.company_id = $1`, [tenant.companyId]);
    const items = await db.query<{ order_id: string; category: string; quantity: number; subtotal: string }>(`
      select i.order_id, c.name category, i.quantity, i.subtotal from order_items i join product_variants v on v.id = i.variant_id join products p on p.id = v.product_id join categories c on c.id = p.category_id`);
    const inRange = (day: string | null, start: string, end: string) => day !== null && day >= start && day <= end;
    const window = (start: string, end: string) => {
      const sold = rows.filter((row) => (row.payment_status === "PAID" || row.payment_status === "REFUNDED") && inRange(row.paid_day, start, end));
      const gross = sold.reduce((sum, row) => sum + Number(row.amount), 0);
      const refunds = rows.filter((row) => row.payment_status === "REFUNDED" && inRange(row.refunded_day, start, end)).reduce((sum, row) => sum + Number(row.amount), 0);
      const created = rows.filter((row) => inRange(row.created_day, start, end));
      const paidIds = new Set(rows.filter((row) => row.payment_status === "PAID" && inRange(row.paid_day, start, end)).map((row) => row.order_id));
      const paidItems = items.filter((item) => paidIds.has(item.order_id));
      const byCategory = new Map<string, number>();
      for (const item of paidItems) byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + Number(item.subtotal));
      const byStore = new Map<string, number>();
      for (const row of sold) byStore.set(row.store, (byStore.get(row.store) ?? 0) + Number(row.amount));
      for (const row of rows.filter((candidate) => candidate.payment_status === "REFUNDED" && inRange(candidate.refunded_day, start, end))) byStore.set(row.store, (byStore.get(row.store) ?? 0) - Number(row.amount));
      return {
        net: gross - refunds, units: paidItems.reduce((sum, item) => sum + item.quantity, 0),
        cancellationRate: created.length ? Math.round((10_000 * created.filter((row) => inRange(row.cancelled_day, start, end)).length) / created.length) / 100 : 0,
        fulfillment: created.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.fulfillment_type]: (acc[row.fulfillment_type] ?? 0) + 1 }), {}),
        byCategory, byStore,
        heat: created.filter((row) => row.status !== "CANCELLED").map((row) => [row.created_dow, row.created_hour] as const),
      };
    };
    const paidByCustomer = new Map<string, string[]>();
    for (const row of rows.filter((candidate) => candidate.customer_id && (candidate.payment_status === "PAID" || candidate.payment_status === "REFUNDED") && candidate.paid_day && candidate.paid_day <= to)) {
      paidByCustomer.set(row.customer_id!, [...(paidByCustomer.get(row.customer_id!) ?? []), row.paid_day!]);
    }
    const buyers = [...paidByCustomer.values()].filter((days) => days.some((day) => day >= from));
    const length = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
    return {
      current: window(from, to), previous: window(shift(from, -length), shift(from, -1)),
      repurchase: buyers.length ? Math.round((1000 * buyers.filter((days) => days.length >= 2).length) / buyers.length) / 10 : 0,
      newCustomers: [...paidByCustomer.values()].filter((days) => days.every((day) => day >= from)).length,
    };
  }

  it("MAX: cada widget nuevo coincide con la referencia y no mezcla datos de otra compañía", async () => {
    const from = shift(today, -29);
    const result = await overview(tokens.ownerM, max, from, today);
    expect(result.status, result.text).toBe(200);
    const body = result.body;
    const ref = await reference(max, from, today);
    const pct = (current: number, previous: number) => Math.round(((current - previous) / previous) * 1000) / 10;

    // Datos sembrados: B (250) pagado; D (500) pagado y reembolsado; C cancelado; A (200) en el periodo anterior.
    expect(ref.current.net).toBe(250);
    expect(ref.previous.net).toBe(200);
    expect(kpi(body, "NET_SALES")).toMatchObject({ value: ref.current.net, previousValue: ref.previous.net, changePct: pct(250, 200) });
    expect(kpi(body, "UNITS_SOLD")).toMatchObject({ value: ref.current.units, previousValue: ref.previous.units });
    expect(kpi(body, "CANCELLATION_RATE")?.value).toBe(ref.current.cancellationRate);
    expect(kpi(body, "CANCELLATION_RATE")?.value).toBe(33.33);
    expect(kpi(body, "GROWTH_RATE")?.value).toBe(pct(ref.current.net, ref.previous.net));
    expect(kpi(body, "REPURCHASE_RATE")?.value).toBe(ref.repurchase);
    expect(kpi(body, "REPURCHASE_RATE")?.value).toBe(50);
    expect(kpi(body, "NEW_CUSTOMERS")?.value).toBe(ref.newCustomers);
    expect(kpi(body, "NEW_CUSTOMERS")?.value).toBe(1);

    const categories = chart(body, "sales-category");
    expect(Object.fromEntries(categories.categories.map((name, index) => [name, categories.series[0]!.data[index]]))).toEqual(Object.fromEntries(ref.current.byCategory));

    const mix = chart(body, "fulfillment-mix");
    expect(mix.categories).toEqual(["Retiro en tienda"]);
    expect(mix.series[0]!.data).toEqual([ref.current.fulfillment.PICKUP]);

    const heat = chart(body, "sales-heatmap");
    expect(heat.series.flatMap((series) => series.data).reduce((sum, value) => sum + value, 0)).toBe(ref.current.heat.length);
    for (const [dow, hour] of ref.current.heat) expect(heat.series[dow - 1]!.data[hour]).toBeGreaterThanOrEqual(1);

    const stores = chart(body, "store-comparison");
    for (const [index, name] of stores.categories.entries()) {
      expect(stores.series[0]!.data[index]).toBe(ref.current.byStore.get(name) ?? 0);
      expect(stores.series[1]!.data[index]).toBe(ref.previous.byStore.get(name) ?? 0);
    }

    const trend = chart(body, "sales-trend");
    expect(trend.series[0]!.data).toHaveLength(12);
    expect(trend.series[0]!.data.reduce((sum, value) => sum + value, 0)).toBe(ref.current.net + ref.previous.net);

    const daily = chart(body, "sales-daily");
    expect(daily.series.map((series) => series.name)).toContain("Período anterior");

    const critical = body.tables.find((table) => table.id === "critical-inventory");
    expect(critical?.rows.map((row) => row[1])).toEqual([criticalVariant.sku]);
    expect(body.locked).toEqual([]);
  });

  it("PLUS (STANDARD): widgets intermedios y comparación; los ADVANCED vuelven bloqueados sin datos", async () => {
    const result = await overview(tokens.ownerP, plus, shift(today, -29), today);
    expect(result.status, result.text).toBe(200);
    const keys = result.body.kpis.map((candidate) => candidate.key);
    expect(keys).toEqual(expect.arrayContaining(["CANCELLATION_RATE", "UNITS_SOLD"]));
    expect(keys).not.toContain("REPURCHASE_RATE");
    expect(result.body.charts.map((candidate) => candidate.id)).toEqual(expect.arrayContaining(["sales-category", "fulfillment-mix"]));
    expect(result.body.charts.map((candidate) => candidate.id)).not.toContain("sales-heatmap");
    expect(result.body.tables.map((table) => table.id)).toContain("critical-inventory");
    expect(kpi(result.body, "NET_SALES")).toHaveProperty("previousValue");
    expect(result.body.locked?.map((widget) => widget.id).sort()).toEqual(
      ["GROWTH_RATE", "NEW_CUSTOMERS", "REPEAT_CUSTOMERS", "REPURCHASE_RATE", "TICKET_PER_CUSTOMER", "sales-heatmap", "sales-trend", "store-comparison"],
    );
    expect(result.body.locked?.every((widget) => widget.requiredPlan === "MAX")).toBe(true);
  });

  it("FREE (BASIC): sin widgets nuevos ni comparación; bloqueados con el plan que los habilita", async () => {
    const result = await overview(tokens.ownerF, free, shift(today, -29), today);
    expect(result.status, result.text).toBe(200);
    expect(result.body.kpis.map((candidate) => candidate.key)).toEqual(["NET_SALES", "PAID_ORDERS", "AVERAGE_TICKET", "LOW_STOCK_VARIANTS"]);
    expect(result.body.kpis.every((candidate) => candidate.previousValue === undefined || candidate.previousValue === null)).toBe(true);
    expect(result.body.charts.map((candidate) => candidate.id)).toEqual(["sales-daily"]);
    expect(chart(result.body, "sales-daily").series.map((series) => series.name)).not.toContain("Período anterior");
    const locked = new Map(result.body.locked?.map((widget) => [widget.id, widget.requiredPlan]));
    expect(locked.get("sales-category")).toBe("PLUS");
    expect(locked.get("critical-inventory")).toBe("PLUS");
    expect(locked.get("sales-heatmap")).toBe("MAX");
  });

  it("ventana de historial: FREE 30 días, PLUS 12 meses y MAX completo (recorte en el backend)", async () => {
    const free30 = await overview(tokens.ownerF, free, "2020-01-01", today);
    expect(free30.body.policy).toMatchObject({ historyDays: 30, clamped: true });
    expect(free30.body.from).toBe(shift(today, -29));
    const plus12 = await overview(tokens.ownerP, plus, "2020-01-01", today);
    expect(plus12.body.policy?.clamped).toBe(true);
    expect(plus12.body.from >= shift(today, -366)).toBe(true);
    const maxAll = await overview(tokens.ownerM, max, shift(today, -800), today);
    expect(maxAll.body.policy?.clamped ?? false).toBe(false);
    expect(maxAll.body.from).toBe(shift(today, -800));
  });
});

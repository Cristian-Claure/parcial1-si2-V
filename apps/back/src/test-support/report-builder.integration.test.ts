import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ReportBuilderResult, ReportDefinition, ReportOverview, ReportSemanticCatalog } from "@velora/contracts";
import { createMigratedDatabase, integrationDatabaseAvailable, type TestDatabase } from "./integration-database.js";
import { http, insertUser, login, seedTenant, startTestApp, type SeededTenant, type TestApp } from "./integration-app.js";
import { pdfText } from "./pdf-text.js";

const available = await integrationDatabaseAvailable();
const LOCAL = "America/La_Paz";

/**
 * Fase 3 · Constructor dinámico por HTTP: niveles de plan (FREE 403), ventana de historial,
 * entradas maliciosas, alcance de compañía/sucursal, exportaciones válidas y definiciones.
 * Los pedidos se crean por el flujo HTTP real y solo se reubican sus fechas.
 */
describe.skipIf(!available)("constructor dinámico y exportación (integración)", () => {
  let db: TestDatabase;
  let server: TestApp;
  let free: SeededTenant;
  let plus: SeededTenant;
  let max: SeededTenant;
  let other: SeededTenant;
  let today: string;
  const tokens: Record<string, string> = {};
  const store2 = { storeId: randomUUID(), warehouseId: randomUUID(), name: "Sucursal Norte M" };
  const coat = { categoryId: randomUUID(), productId: randomUUID(), variantId: randomUUID() };

  const call = <T = unknown>(token: string | undefined, method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
    http<T>(server.baseUrl, method, path, { token, body, headers });
  const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const ok = (result: { status: number; text: string }) => expect(result.status, result.text).toBeLessThan(300);
  const binary = async (token: string, method: string, path: string, body?: unknown) => {
    const response = await fetch(`${server.baseUrl}${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : null,
    });
    return { status: response.status, type: response.headers.get("content-type") ?? "", disposition: response.headers.get("content-disposition") ?? "", buffer: Buffer.from(await response.arrayBuffer()) };
  };

  async function order(customer: string, tenant: SeededTenant, warehouseId: string, items: { variantId: string; quantity: number }[]) {
    await call(tokens[customer], "DELETE", `/api/customer/cart?companyId=${tenant.companyId}`);
    for (const item of items) ok(await call(tokens[customer], "POST", "/api/customer/cart/items", { companyId: tenant.companyId, ...item }));
    const created = await call<{ id: string }>(tokens[customer], "POST", "/api/customer/orders", { companyId: tenant.companyId, warehouseId, fulfillmentType: "PICKUP" }, { "Idempotency-Key": randomUUID() });
    ok(created);
    const payment = await call<{ id: string }>(tokens[customer], "POST", `/api/customer/orders/${created.body.id}/payments`, { method: "CASH" });
    ok(payment);
    return { orderId: created.body.id, paymentId: payment.body.id };
  }

  async function placeAt(orderId: string, day: string, hour: number, refundHour?: number) {
    const at = `('${day}'::date + make_interval(hours => ${hour})) at time zone '${LOCAL}'`;
    await db.query(`update orders set created_at = ${at}, updated_at = ${at},
      fulfilled_at = case when fulfilled_at is not null then ${at} + interval '1 hour' end,
      cancelled_at = case when cancelled_at is not null then ${at} + interval '1 hour' end where id = $1`, [orderId]);
    const refund = refundHour === undefined ? "null::timestamptz" : `('${day}'::date + make_interval(hours => ${refundHour})) at time zone '${LOCAL}'`;
    await db.query(`update payments set created_at = ${at}, updated_at = ${at},
      paid_at = case when paid_at is not null then ${at} + interval '10 minutes' end,
      refunded_at = case when refunded_at is not null then ${refund} end where order_id = $1`, [orderId]);
  }

  beforeAll(async () => {
    db = await createMigratedDatabase("builder");
    free = await seedTenant(db, "F", { planCode: "FREE" });
    plus = await seedTenant(db, "P", { planCode: "PLUS" });
    max = await seedTenant(db, "M", { planCode: "MAX" });
    other = await seedTenant(db, "X", { planCode: "MAX" });
    // Nombre con tildes y ñ para verificar las fuentes del PDF.
    await db.query("update companies set display_name = 'Moda Ñandú Señorial', brand_palette = $2 where id = $1", [max.companyId, JSON.stringify({ accent: "#1F3A5F" })]);
    await db.query("insert into stores (id, code, name, active, company_id, created_at, updated_at) values ($1, 'S_M2', $2, true, $3, now(), now())", [store2.storeId, store2.name, max.companyId]);
    await db.query("insert into warehouses (id, store_id, code, name, active, default_warehouse, created_at, updated_at) values ($1, $2, 'W_M2', 'Almacen M2', true, true, now(), now())", [store2.warehouseId, store2.storeId]);
    await db.query("insert into categories (id, company_id, name, slug, active, created_at, updated_at) values ($1, $2, 'Abrigos Señoriales', 'abrigos-m', true, now(), now())", [coat.categoryId, max.companyId]);
    await db.query("insert into products (id, company_id, category_id, name, slug, description, brand, status, created_at, updated_at) values ($1, $2, $3, 'Abrigo Camel', 'abrigo-m', 'x', 'Andes', 'ACTIVE', now(), now())", [coat.productId, max.companyId, coat.categoryId]);
    await db.query("insert into product_variants (id, product_id, sku, size, color, price, currency, active, created_at, updated_at) values ($1, $2, 'SKU-ABRIGO', 'L', 'Camel', 250, 'BOB', true, now(), now())", [coat.variantId, coat.productId]);
    for (const [warehouseId, variantId] of [[max.warehouseId, coat.variantId], [store2.warehouseId, coat.variantId], [store2.warehouseId, max.variantId]] as const) {
      await db.query("insert into inventory_stocks (id, warehouse_id, variant_id, physical_quantity, committed_quantity, created_at, updated_at) values ($1, $2, $3, 50, 0, now(), now())", [randomUUID(), warehouseId, variantId]);
    }
    for (const label of ["c1", "c2", "cx", "cp"]) await insertUser(db, { email: `${label}-builder@test.local`, role: "CUSTOMER" });

    server = await startTestApp(db);
    for (const tenant of [free, plus, max, other]) {
      tokens[`owner${tenant.label}`] = await login(server.baseUrl, tenant.ownerEmail);
      tokens[`manager${tenant.label}`] = await login(server.baseUrl, tenant.managerEmail);
    }
    for (const label of ["c1", "c2", "cx", "cp"]) tokens[label] = await login(server.baseUrl, `${label}-builder@test.local`);
    today = (await db.query<{ day: string }>(`select to_char(now() at time zone '${LOCAL}', 'YYYY-MM-DD') as day`))[0]!.day;

    // MAX: A (período anterior, sucursal 1), B (actual, sucursal 2, mixto), D (pagado y reembolsado).
    const a = await order("c1", max, max.warehouseId, [{ variantId: max.variantId, quantity: 2 }]);
    ok(await call(tokens.ownerM, "POST", `/api/admin/payments/${a.paymentId}/confirm`, {}));
    const b = await order("c1", max, store2.warehouseId, [{ variantId: coat.variantId, quantity: 1 }, { variantId: max.variantId, quantity: 1 }]);
    ok(await call(tokens.ownerM, "POST", `/api/admin/payments/${b.paymentId}/confirm`, {}));
    const d = await order("c2", max, max.warehouseId, [{ variantId: coat.variantId, quantity: 2 }]);
    ok(await call(tokens.ownerM, "POST", `/api/admin/payments/${d.paymentId}/confirm`, {}));
    ok(await call(tokens.ownerM, "POST", `/api/admin/payments/${d.paymentId}/refund`, { reason: "Devolución" }));
    const x = await order("cx", other, other.warehouseId, [{ variantId: other.variantId, quantity: 3 }]);
    ok(await call(tokens.ownerX, "POST", `/api/admin/payments/${x.paymentId}/confirm`, {}));
    const p = await order("cp", plus, plus.warehouseId, [{ variantId: plus.variantId, quantity: 1 }]);
    ok(await call(tokens.ownerP, "POST", `/api/admin/payments/${p.paymentId}/confirm`, {}));
    await placeAt(a.orderId, shift(today, -40), 15);
    await placeAt(b.orderId, shift(today, -3), 13);
    await placeAt(d.orderId, shift(today, -1), 20, 21);
    await placeAt(x.orderId, shift(today, -3), 13);
    await placeAt(p.orderId, shift(today, -2), 11);
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  const query = (token: string, tenant: SeededTenant, body: Record<string, unknown>) =>
    call<ReportBuilderResult>(token, "POST", "/api/admin/reports/query", { companyId: tenant.companyId, ...body });
  const last30 = () => ({ from: shift(today, -29), to: today });

  it("MAX: sucursal × categoría coincide con la referencia y el total de venta neta con el resumen", async () => {
    const result = await query(tokens.ownerM!, max, { ...last30(), dimensions: ["STORE", "CATEGORY"], measures: ["NET_SALES", "UNITS", "ORDERS"], compareWithPrevious: true });
    expect(result.status, result.text).toBe(200);
    const overview = await call<ReportOverview>(tokens.ownerM, "GET", `/api/admin/reports/overview?companyId=${max.companyId}&from=${last30().from}&to=${today}`);
    const net = overview.body.kpis.find((kpi) => kpi.key === "NET_SALES")!;
    expect(result.body.totals[0]).toBeCloseTo(net.value, 2);
    expect(result.body.previousTotals?.[0]).toBeCloseTo(net.previousValue ?? -1, 2);
    expect(result.body.totals[1]).toBe(overview.body.kpis.find((kpi) => kpi.key === "UNITS_SOLD")!.value);
    // Referencia: reparto de cada pago entre ítems por subtotal, por sucursal y categoría.
    const reference = await db.query<{ k: string; v: string }>(`
      with share as (select i.order_id, pr.category_id, i.subtotal / sum(i.subtotal) over (partition by i.order_id) f
                     from order_items i join product_variants pv on pv.id = i.variant_id join products pr on pr.id = pv.product_id),
      ev as (select p.order_id, s.id store_id, p.paid_at ts, p.amount amt from payments p join orders o on o.id = p.order_id join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id
               where s.company_id = $1 and p.status in ('PAID', 'REFUNDED')
             union all select p.order_id, s.id, p.refunded_at, -p.amount from payments p join orders o on o.id = p.order_id join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id
               where s.company_id = $1 and p.status = 'REFUNDED')
      select ev.store_id || '|' || sh.category_id k, round(sum(ev.amt * sh.f), 2) v from ev join share sh using (order_id)
      where ev.ts >= ($2::date)::timestamp at time zone '${LOCAL}' group by 1`, [max.companyId, last30().from]);
    const actual = Object.fromEntries(result.body.rows.map((row) => [row.keys.join("|"), row.values[0]]));
    expect(reference.length).toBeGreaterThan(0);
    for (const row of reference) expect(actual[row.k], row.k).toBeCloseTo(Number(row.v), 2);
    expect(result.body.rows.every((row) => row.previous !== null)).toBe(true);
    expect(result.body.rows.flatMap((row) => row.labels)).toEqual(expect.arrayContaining([store2.name, "Abrigos Señoriales"]));
    expect(result.text).not.toContain(other.companyId);
    expect(result.body.suggestedChart?.type).toBe("BAR");
  });

  it("MAX: medidas ADVANCED, mapa de calor sugerido, inventario y filtro por marca", async () => {
    const heat = await query(tokens.ownerM!, max, { ...last30(), dimensions: ["WEEKDAY", "HOUR"], measures: ["ORDERS", "NEW_CUSTOMERS", "RETURNING_CUSTOMERS", "UNIQUE_CUSTOMERS"] });
    expect(heat.status, heat.text).toBe(200);
    expect(heat.body.suggestedChart?.type).toBe("HEATMAP");
    expect(heat.body.totals[3]).toBe(heat.body.totals[1]! + heat.body.totals[2]!);
    const stock = await query(tokens.ownerM!, max, { dimensions: ["STORE"], measures: ["INVENTORY_VALUE"] });
    expect(stock.status, stock.text).toBe(200);
    const [value] = await db.query<{ v: string }>(`select sum(st.available_quantity * pv.price) v from inventory_stocks st join product_variants pv on pv.id = st.variant_id
      join warehouses w on w.id = st.warehouse_id join stores s on s.id = w.store_id where s.company_id = $1`, [max.companyId]);
    expect(stock.body.totals[0]).toBeCloseTo(Number(value!.v), 2);
    const brand = await query(tokens.ownerM!, max, { ...last30(), dimensions: ["PRODUCT"], measures: ["UNITS"], filters: [{ dimension: "BRAND", values: ["Andes"] }] });
    expect(brand.body.rows.map((row) => row.labels[0])).toEqual(["Abrigo Camel"]);
    expect(brand.body.filtersApplied).toEqual([{ dimension: "BRAND", label: "Marca", values: ["Andes"] }]);
  });

  it("FREE: catálogo, consulta, exportaciones y definiciones responden 403 PLAN_LIMIT_REPORT_FEATURE", async () => {
    const body = { companyId: free.companyId, dimensions: ["STORE"], measures: ["NET_SALES"] };
    const attempts = [
      await call(tokens.ownerF, "GET", `/api/admin/reports/semantic-catalog?companyId=${free.companyId}`),
      await call(tokens.ownerF, "POST", "/api/admin/reports/query", body),
      await call(tokens.ownerF, "POST", "/api/admin/reports/query/export?format=xlsx", body),
      await call(tokens.ownerF, "GET", `/api/admin/reports/overview/export?companyId=${free.companyId}&format=pdf`),
      await call(tokens.ownerF, "GET", `/api/admin/reports/definitions?companyId=${free.companyId}`),
      await call(tokens.ownerF, "POST", "/api/admin/reports/definitions", { companyId: free.companyId, name: "Mi reporte", definition: { dimensions: [], measures: ["NET_SALES"] } }),
      await call(tokens.managerF, "POST", "/api/manager/reports/query", { dimensions: [], measures: ["NET_SALES"] }),
    ];
    for (const result of attempts) {
      expect(result.status, result.text).toBe(403);
      expect((result.body as { code?: string }).code).toBe("PLAN_LIMIT_REPORT_FEATURE");
    }
  });

  it("PLUS: ADVANCED bloqueado en catálogo y 403 al pedirlo; historial de 365 días recortado en el backend", async () => {
    const catalog = await call<ReportSemanticCatalog>(tokens.ownerP, "GET", `/api/admin/reports/semantic-catalog?companyId=${plus.companyId}`);
    expect(catalog.status, catalog.text).toBe(200);
    expect(catalog.body.dimensions.find((dimension) => dimension.id === "CUSTOMER")).toMatchObject({ locked: true, requiredPlan: "MAX" });
    expect(catalog.body.measures.find((measure) => measure.id === "NET_SALES")?.locked).toBe(false);
    const advanced = [
      { dimensions: ["HOUR"], measures: ["ORDERS"] },
      { dimensions: [], measures: ["NEW_CUSTOMERS"] },
      { dimensions: [], measures: ["ORDERS"], filters: [{ dimension: "CUSTOMER", values: [randomUUID()] }] },
    ];
    for (const body of advanced) {
      const result = await query(tokens.ownerP!, plus, body);
      expect(result.status, result.text).toBe(403);
      expect(result.text).toContain("PLAN_LIMIT_REPORT_FEATURE");
      expect(result.text).toContain("MAX");
    }
    const clamped = await query(tokens.ownerP!, plus, { from: "2020-01-01", to: today, dimensions: ["DATE_MONTH"], measures: ["NET_SALES"], compareWithPrevious: true });
    expect(clamped.status, clamped.text).toBe(200);
    expect(clamped.body.policy).toMatchObject({ clamped: true, historyDays: 365 });
    expect(clamped.body.from).toBe(shift(today, -364));
    expect(clamped.body.previousTotals).toBeNull();
    expect(clamped.body.notes.join(" ")).toContain("ventana de historial");
    const all = await query(tokens.ownerM!, max, { from: shift(today, -800), to: today, dimensions: [], measures: ["NET_SALES"] });
    expect(all.body.policy.clamped).toBe(false);
    expect(all.body.from).toBe(shift(today, -800));
  });

  it("entradas maliciosas: identificadores inventados, SQL, campos extra, límites y companyId ajeno", async () => {
    const bad = [
      { dimensions: ["DROP TABLE orders"], measures: ["NET_SALES"] },
      { dimensions: ["STORE"], measures: ["sum(amount)"] },
      { dimensions: ["STORE"], measures: ["NET_SALES"], sql: "select * from app_users" },
      { dimensions: ["STORE"], measures: ["NET_SALES"], column: "o.total" },
      { dimensions: ["STORE", "CHANNEL", "CATEGORY", "SIZE"], measures: ["NET_SALES"] },
      { dimensions: ["STORE"], measures: ["NET_SALES"], limit: 100000 },
      { dimensions: ["STORE"], measures: ["NET_SALES"], sort: { by: "CATEGORY", direction: "ASC" } },
      { dimensions: ["STORE"], measures: ["NET_SALES"], sort: { by: "o.total; drop table x", direction: "ASC" } },
      { dimensions: ["STORE"], measures: ["NET_SALES"], filters: [{ dimension: "STORE", values: ["1' or '1'='1"] }] },
      { dimensions: ["DATE_MONTH"], measures: ["INVENTORY_VALUE"] },
      { dimensions: ["STORE"], measures: ["NET_SALES"], from: "2026-13-45", to: today },
    ];
    for (const body of bad) {
      const result = await query(tokens.ownerM!, max, body);
      expect(result.status, `${JSON.stringify(body)} → ${result.text}`).toBe(400);
    }
    // Inyección en un valor de texto: viaja como parámetro y no altera la consulta.
    const injected = await query(tokens.ownerM!, max, { ...last30(), dimensions: ["BRAND"], measures: ["NET_SALES"], filters: [{ dimension: "BRAND", values: ["x' or 1=1 --", "'); drop table orders; --"] }] });
    expect(injected.status, injected.text).toBe(200);
    expect(injected.body.rows).toEqual([]);
    expect(injected.body.totals).toEqual([0]);
    expect(Number((await db.query<{ n: string }>("select count(*) n from orders"))[0]!.n)).toBeGreaterThan(0);
    // Compañía ajena o inexistente: 404 sin datos; id malformado: 400.
    expect((await query(tokens.ownerM!, other, { dimensions: ["STORE"], measures: ["NET_SALES"] })).status).toBe(404);
    expect((await call(tokens.ownerM, "POST", "/api/admin/reports/query", { companyId: randomUUID(), dimensions: [], measures: ["NET_SALES"] })).status).toBe(404);
    expect((await call(tokens.ownerM, "POST", "/api/admin/reports/query", { companyId: "abc", dimensions: [], measures: ["NET_SALES"] })).status).toBe(400);
    // Filtro con una sucursal de otra compañía: no devuelve datos ajenos.
    const foreign = await query(tokens.ownerM!, max, { ...last30(), dimensions: ["STORE"], measures: ["NET_SALES"], filters: [{ dimension: "STORE", values: [other.storeId] }] });
    expect(foreign.status).toBe(200);
    expect(foreign.body.rows).toEqual([]);
    expect(foreign.text).not.toContain("Sucursal X");
  });

  it("encargado: queda fijado a su sucursal aunque pida otra", async () => {
    const own = await call<ReportBuilderResult>(tokens.managerM, "POST", "/api/manager/reports/query", { ...last30(), dimensions: ["STORE"], measures: ["GROSS_SALES"] });
    expect(own.status, own.text).toBe(200);
    expect(own.body.rows.map((row) => row.keys[0])).toEqual([max.storeId]);
    const sibling = await call<ReportBuilderResult>(tokens.managerM, "POST", "/api/manager/reports/query", { ...last30(), dimensions: ["STORE"], measures: ["GROSS_SALES"], filters: [{ dimension: "STORE", values: [store2.storeId] }] });
    expect(sibling.body.rows).toEqual([]);
    expect((await call(tokens.managerM, "POST", "/api/manager/reports/query", { companyId: other.companyId, dimensions: [], measures: ["NET_SALES"] })).status).toBe(400);
  });

  it("exportación XLSX: hoja Resumen con filtros, hoja Datos con encabezado fijo, autofiltro y totales", async () => {
    const body = { companyId: max.companyId, ...last30(), dimensions: ["CATEGORY"], measures: ["NET_SALES", "UNITS"], filters: [{ dimension: "STORE", values: [store2.storeId] }] };
    const json = await call<ReportBuilderResult>(tokens.ownerM, "POST", "/api/admin/reports/query", body);
    const file = await binary(tokens.ownerM!, "POST", "/api/admin/reports/query/export?format=xlsx", body);
    expect(file.status).toBe(200);
    expect(file.type).toContain("spreadsheetml");
    expect(file.disposition).toMatch(/attachment; filename=".+\.xlsx"/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as unknown as ArrayBuffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Resumen", "Datos"]);
    const summaryText = (workbook.getWorksheet("Resumen")!.getSheetValues() as unknown[][]).flat().filter(Boolean).join(" ");
    expect(summaryText).toContain("Moda Ñandú Señorial");
    expect(summaryText).toContain("Filtros aplicados");
    expect(summaryText).toContain(store2.name);
    const data = workbook.getWorksheet("Datos")!;
    expect(data.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(data.autoFilter).toBeTruthy();
    expect(data.getRow(1).values).toEqual([undefined, "Categoría", "Venta neta", "Unidades"]);
    const totals = data.getRow(data.rowCount);
    expect(totals.getCell(1).value).toBe("Total");
    expect(Number(totals.getCell(2).value)).toBeCloseTo(json.body.totals[0]!, 2);
    expect(data.rowCount).toBe(json.body.rows.length + 2);
  });

  it("exportación PDF: marca con ñ, filtros, tabla con totales y número de página; resumen exportable", async () => {
    const body = { companyId: max.companyId, ...last30(), dimensions: ["CATEGORY", "SIZE"], measures: ["NET_SALES", "UNITS"], filters: [{ dimension: "CATEGORY", values: [coat.categoryId] }] };
    const file = await binary(tokens.ownerM!, "POST", "/api/admin/reports/query/export?format=pdf", body);
    expect(file.status).toBe(200);
    expect(file.type).toContain("application/pdf");
    const { text, pages } = pdfText(file.buffer);
    expect(pages).toBeGreaterThanOrEqual(1);
    for (const expected of ["Moda Ñandú Señorial", "Filtros aplicados", "Categoría: Abrigos Señoriales", "Total", `Página 1 de ${pages}`, "Venta neta"]) expect(text).toContain(expected);
    const overviewPdf = await binary(tokens.ownerP!, "GET", `/api/admin/reports/overview/export?companyId=${plus.companyId}&format=pdf`);
    expect(overviewPdf.status).toBe(200);
    expect(pdfText(overviewPdf.buffer).text).toContain("Indicadores");
    const overviewXlsx = await binary(tokens.managerM!, "GET", "/api/manager/reports/overview/export?format=xlsx");
    expect(overviewXlsx.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(overviewXlsx.buffer as unknown as ArrayBuffer);
    expect(workbook.worksheets[0]!.name).toBe("Resumen");
    expect(workbook.worksheets.map((sheet) => sheet.name)).toContain("Indicadores");
    expect((await binary(tokens.ownerM!, "POST", "/api/admin/reports/query/export?format=docx", body)).status).toBe(400);
  });

  it("definiciones guardadas: CRUD por propietario, nombre único, nivel y alcance ajeno", async () => {
    const definition = { dimensions: ["DATE_MONTH", "STORE"], measures: ["NET_SALES", "ORDERS"], preset: "LAST_90", compareWithPrevious: true };
    const created = await call<ReportDefinition>(tokens.ownerM, "POST", "/api/admin/reports/definitions", { companyId: max.companyId, name: "Ventas por mes y sucursal", definition });
    expect(created.status, created.text).toBe(201);
    expect(created.body.definition).toMatchObject(definition);
    expect((await call(tokens.ownerM, "POST", "/api/admin/reports/definitions", { companyId: max.companyId, name: "ventas POR mes y sucursal", definition })).status).toBe(409);
    const list = await call<ReportDefinition[]>(tokens.ownerM, "GET", `/api/admin/reports/definitions?companyId=${max.companyId}`);
    expect(list.body.map((item) => item.name)).toEqual(["Ventas por mes y sucursal"]);
    const updated = await call<ReportDefinition>(tokens.ownerM, "PUT", `/api/admin/reports/definitions/${created.body.id}`, { name: "Ventas mensuales" });
    expect(updated.status, updated.text).toBe(200);
    expect(updated.body.name).toBe("Ventas mensuales");
    const rerun = await query(tokens.ownerM!, max, updated.body.definition as unknown as Record<string, unknown>);
    expect(rerun.status, rerun.text).toBe(200);
    expect((await call(tokens.ownerX, "GET", `/api/admin/reports/definitions?companyId=${max.companyId}`)).status).toBe(404);
    expect((await call(tokens.ownerX, "PUT", `/api/admin/reports/definitions/${created.body.id}`, { name: "Hack" })).status).toBe(404);
    expect((await call(tokens.ownerX, "DELETE", `/api/admin/reports/definitions/${created.body.id}`)).status).toBe(404);
    expect((await call(tokens.ownerP, "POST", "/api/admin/reports/definitions", { companyId: plus.companyId, name: "Nuevos", definition: { dimensions: [], measures: ["NEW_CUSTOMERS"] } })).status).toBe(403);
    expect((await call(tokens.ownerM, "POST", "/api/admin/reports/definitions", { companyId: max.companyId, name: "Con SQL", definition: { ...definition, sql: "select 1" } })).status).toBe(400);
    expect((await call(tokens.ownerM, "DELETE", `/api/admin/reports/definitions/${created.body.id}`)).status).toBe(204);
    expect((await call<ReportDefinition[]>(tokens.ownerM, "GET", `/api/admin/reports/definitions?companyId=${max.companyId}`)).body).toEqual([]);
  });
});

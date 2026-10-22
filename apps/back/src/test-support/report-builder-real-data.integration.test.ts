import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "@velora/database";
import type { ReportBuilderFilter, ReportDimensionId, ReportMeasureId } from "@velora/contracts";
import type { DatabaseService } from "../database/database.service.js";
import { ReportAnalyticsRepository } from "../reports/report-analytics.repository.js";
import { SemanticQueryRepository, type SemanticQuery } from "../reports/builder/semantic-query.repository.js";
import { integrationServerUrl } from "./integration-database.js";

/**
 * Constructor dinámico contra los DATOS REALES de la BD local (historial sintético de la Fase 3,
 * ~11.000 pedidos). Cada combinación representativa se compara con una consulta SQL de
 * referencia escrita aparte (sin la capa semántica). Solo lectura; se omite si la BD no tiene
 * las tiendas de muestra (p. ej. en CI).
 */
const url = integrationServerUrl();
const client = url ? createDatabase(url) : null;
const sample = client
  ? await client.pool.query<{ id: string }>("select id from companies where slug = 'urbano-boutique'").then((result) => result.rows[0]?.id ?? null).catch(() => null)
  : null;
if (!sample) await client?.pool.end().catch(() => undefined);

const LOCAL = "America/La_Paz";
const SCOPE = `join orders o on o.id = p.order_id join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id where s.company_id = $1`;

describe.skipIf(!sample)("constructor dinámico vs SQL de referencia (datos reales)", () => {
  let semantic: SemanticQueryRepository;
  let analytics: ReportAnalyticsRepository;
  const companyId = sample!;
  let window: { start: Date; endExclusive: Date };

  beforeAll(async () => {
    const database = { db: client!.db } as unknown as DatabaseService;
    semantic = new SemanticQueryRepository(database);
    analytics = new ReportAnalyticsRepository(database);
    const [bounds] = (await client!.pool.query<{ start: Date; end_exclusive: Date }>(
      `select ((now() at time zone '${LOCAL}')::date - 364)::timestamp at time zone '${LOCAL}' start, ((now() at time zone '${LOCAL}')::date + 1)::timestamp at time zone '${LOCAL}' end_exclusive`)).rows;
    window = { start: bounds!.start, endExclusive: bounds!.end_exclusive };
  });

  afterAll(async () => {
    await client?.pool.end();
  });

  const ref = async (text: string, params: unknown[] = []) => (await client!.pool.query(text, [companyId, window.start, window.endExclusive, ...params])).rows as Record<string, unknown>[];
  const run = (dimensions: ReportDimensionId[], measures: ReportMeasureId[], filters: ReportBuilderFilter[] = [], limit = 500) =>
    semantic.run({ scope: { companyId, storeId: null }, window, dimensions, measures, filters, limit, sort: { by: dimensions[0] ?? measures[0]!, direction: "ASC" } } satisfies SemanticQuery);
  const asMap = (rows: Record<string, unknown>[], key: string, value: string) => Object.fromEntries(rows.map((row) => [String(row[key]), Number(row[value])]));
  const builderMap = (result: Awaited<ReturnType<typeof run>>, measure = 0) => Object.fromEntries(result.rows.map((row) => [row.keys.join("|"), row.values[measure]!]));
  const close = (actual: Record<string, number>, expected: Record<string, number>) => {
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) expect(actual[key], key).toBeCloseTo(value, 2);
  };

  it("venta neta por mes = pagos confirmados − reembolsos (y su total = widget del resumen)", async () => {
    const result = await run(["DATE_MONTH"], ["NET_SALES", "GROSS_SALES", "REFUNDS"]);
    const expected = await ref(`
      with ev as (
        select p.paid_at ts, p.amount amt from payments p ${SCOPE} and p.status in ('PAID', 'REFUNDED') and p.paid_at is not null
        union all select p.refunded_at, -p.amount from payments p ${SCOPE} and p.status = 'REFUNDED' and p.refunded_at is not null)
      select to_char(ts at time zone '${LOCAL}', 'YYYY-MM') k, round(sum(amt), 2) v from ev where ts >= $2 and ts < $3 group by 1`);
    expect(result.rows.length).toBeGreaterThanOrEqual(12);
    close(builderMap(result), asMap(expected, "k", "v"));
    const kpis = await analytics.kpis({ companyId, storeId: null }, window);
    expect(result.totals[0]).toBeCloseTo(kpis.netSales, 2);
    expect(result.totals[1]).toBeCloseTo(kpis.grossSales, 2);
    expect(result.totals[2]).toBeCloseTo(kpis.refunds, 2);
  });

  it("pedidos y venta bruta por sucursal × canal", async () => {
    const result = await run(["STORE", "CHANNEL"], ["ORDERS", "GROSS_SALES", "AVERAGE_TICKET"]);
    const expected = await ref(`
      select s.id::text || '|' || o.order_channel k, count(distinct p.order_id) orders, round(sum(p.amount), 2) gross
      from payments p ${SCOPE} and p.status in ('PAID', 'REFUNDED') and p.paid_at >= $2 and p.paid_at < $3 group by 1`);
    close(builderMap(result, 0), asMap(expected, "k", "orders"));
    close(builderMap(result, 1), asMap(expected, "k", "gross"));
    for (const row of result.rows) expect(row.values[2]).toBeCloseTo(row.values[0] ? Math.round((row.values[1]! / row.values[0]!) * 100) / 100 : 0, 2);
  });

  it("unidades por categoría × talla (pedidos con pago PAID en el período, sin duplicar pagos)", async () => {
    const result = await run(["CATEGORY", "SIZE"], ["UNITS"]);
    const expected = await ref(`
      select c.id::text || '|' || coalesce(nullif(btrim(pv.size), ''), 'Sin talla') k, sum(i.quantity) v
      from order_items i join product_variants pv on pv.id = i.variant_id join products pr on pr.id = pv.product_id join categories c on c.id = pr.category_id
      where i.order_id in (select p.order_id from payments p ${SCOPE} and p.status = 'PAID' and p.paid_at >= $2 and p.paid_at < $3) group by 1`);
    close(builderMap(result), asMap(expected, "k", "v"));
    const kpis = await analytics.kpis({ companyId, storeId: null }, window);
    expect(result.totals[0]).toBe(kpis.unitsSold);
  });

  it("venta neta por categoría reparte cada pago por subtotal de ítems y conserva el total", async () => {
    const result = await run(["CATEGORY"], ["NET_SALES"]);
    const expected = await ref(`
      with share as (select i.order_id, pr.category_id, i.subtotal / nullif(sum(i.subtotal) over (partition by i.order_id), 0) f
                     from order_items i join product_variants pv on pv.id = i.variant_id join products pr on pr.id = pv.product_id),
      ev as (select p.order_id, p.paid_at ts, p.amount amt from payments p ${SCOPE} and p.status in ('PAID', 'REFUNDED') and p.paid_at is not null
             union all select p.order_id, p.refunded_at, -p.amount from payments p ${SCOPE} and p.status = 'REFUNDED' and p.refunded_at is not null)
      select sh.category_id::text k, round(sum(ev.amt * sh.f), 2) v from ev join share sh on sh.order_id = ev.order_id where ev.ts >= $2 and ev.ts < $3 group by 1`);
    close(builderMap(result), asMap(expected, "k", "v"));
    const flat = await run([], ["NET_SALES"]);
    expect(result.rows.reduce((sum, row) => sum + row.values[0]!, 0)).toBeCloseTo(flat.totals[0]!, 1);
    expect(result.totals[0]).toBeCloseTo(flat.totals[0]!, 2);
  });

  it("tasa de cancelación por tipo de entrega y por día de la semana", async () => {
    const result = await run(["FULFILLMENT", "WEEKDAY"], ["CANCELLATION_RATE"]);
    const expected = await ref(`
      with created as (select o.id, o.fulfillment_type f, extract(isodow from o.created_at at time zone '${LOCAL}')::int::text d from orders o join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id
                        where s.company_id = $1 and o.created_at >= $2 and o.created_at < $3),
      cancelled as (select o.id, o.fulfillment_type f, extract(isodow from o.cancelled_at at time zone '${LOCAL}')::int::text d from orders o join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id
                    where s.company_id = $1 and o.cancelled_at >= $2 and o.cancelled_at < $3)
      select c.f || '|' || c.d k, round(100.0 * (select count(*) from cancelled x where x.f = c.f and x.d = c.d) / count(*), 2) v from created c group by c.f, c.d`);
    const actual = builderMap(result);
    for (const [key, value] of Object.entries(asMap(expected, "k", "v"))) expect(actual[key], key).toBeCloseTo(value, 2);
    const kpis = await analytics.kpis({ companyId, storeId: null }, window);
    expect((await run([], ["CANCELLATION_RATE"])).totals[0]).toBeCloseTo(kpis.cancellationRate, 2);
  });

  it("clientes únicos = nuevos + recurrentes; nuevos coincide con el widget de clientes", async () => {
    const result = await run([], ["UNIQUE_CUSTOMERS", "NEW_CUSTOMERS", "RETURNING_CUSTOMERS"]);
    const [expected] = await ref(`
      with firsts as (select o.customer_id, min(p.paid_at) first_paid from payments p ${SCOPE} and p.status in ('PAID', 'REFUNDED') and p.paid_at is not null and o.customer_id is not null group by 1),
      buyers as (select distinct o.customer_id from payments p ${SCOPE} and p.status in ('PAID', 'REFUNDED') and p.paid_at >= $2 and p.paid_at < $3 and o.customer_id is not null)
      select count(*) uniq, count(*) filter (where f.first_paid >= $2) nuevos, count(*) filter (where f.first_paid < $2) recurrentes from buyers b join firsts f using (customer_id)`);
    expect(result.totals).toEqual([Number(expected!.uniq), Number(expected!.nuevos), Number(expected!.recurrentes)]);
    expect(result.totals[0]).toBe(result.totals[1]! + result.totals[2]!);
    expect(result.totals[1]).toBe((await analytics.customers({ companyId, storeId: null }, window)).newCustomers);
  });

  it("valor de inventario por sucursal × categoría (foto actual)", async () => {
    const result = await run(["STORE", "CATEGORY"], ["INVENTORY_VALUE"]);
    const expected = await client!.pool.query(`
      select s.id::text || '|' || c.id::text k, round(sum(st.available_quantity * pv.price), 2) v
      from inventory_stocks st join product_variants pv on pv.id = st.variant_id join products pr on pr.id = pv.product_id join categories c on c.id = pr.category_id
        join warehouses w on w.id = st.warehouse_id join stores s on s.id = w.store_id where s.company_id = $1 group by 1`, [companyId]);
    close(builderMap(result), asMap(expected.rows, "k", "v"));
  });

  it("descuento por trimestre y método de pago (una vez por pedido pagado)", async () => {
    const result = await run(["DATE_QUARTER", "PAYMENT_METHOD"], ["DISCOUNT"]);
    const expected = await ref(`
      with first_sale as (select distinct on (p.order_id) p.order_id, p.method, p.paid_at, o.discount_amount
                          from payments p ${SCOPE} and p.status in ('PAID', 'REFUNDED') and p.paid_at >= $2 and p.paid_at < $3 order by p.order_id, p.paid_at, p.id)
      select to_char(paid_at at time zone '${LOCAL}', 'YYYY-"T"Q') || '|' || method k, round(sum(coalesce(discount_amount, 0)), 2) v from first_sale group by 1`);
    // Un pedido con dos pagos aporta una fila sin descuento para el método del segundo pago.
    const nonZero = (map: Record<string, number>) => Object.fromEntries(Object.entries(map).filter(([, value]) => value !== 0));
    close(nonZero(builderMap(result)), nonZero(asMap(expected, "k", "v")));
  });

  it("filtros (sucursal + categoría) y top N por producto ordenado por venta neta", async () => {
    const [{ store, category }] = (await client!.pool.query<{ store: string; category: string }>(`
      select s.id::text store, pr.category_id::text category from order_items i join orders o on o.id = i.order_id join warehouses w on w.id = o.warehouse_id
        join stores s on s.id = w.store_id join product_variants pv on pv.id = i.variant_id join products pr on pr.id = pv.product_id
      where s.company_id = $1 group by 1, 2 order by count(*) desc limit 1`, [companyId])).rows as [{ store: string; category: string }];
    const query: SemanticQuery = {
      scope: { companyId, storeId: null }, window, dimensions: ["PRODUCT"], measures: ["NET_SALES", "UNITS"],
      filters: [{ dimension: "STORE", values: [store] }, { dimension: "CATEGORY", values: [category] }], limit: 5, sort: { by: "NET_SALES", direction: "DESC" },
    };
    const result = await semantic.run(query);
    const expected = await ref(`
      with share as (select i.order_id, pv.product_id, i.subtotal / nullif(sum(i.subtotal) over (partition by i.order_id), 0) f
                     from order_items i join product_variants pv on pv.id = i.variant_id),
      ev as (select p.order_id, p.paid_at ts, p.amount amt from payments p ${SCOPE} and s.id = $4::uuid and p.status in ('PAID', 'REFUNDED') and p.paid_at is not null
             union all select p.order_id, p.refunded_at, -p.amount from payments p ${SCOPE} and s.id = $4::uuid and p.status = 'REFUNDED' and p.refunded_at is not null)
      select sh.product_id::text k, round(sum(ev.amt * sh.f), 2) v from ev join share sh on sh.order_id = ev.order_id join products pr on pr.id = sh.product_id
      where ev.ts >= $2 and ev.ts < $3 and pr.category_id = $5::uuid group by 1 order by 2 desc, 1 limit 5`, [store, category]);
    expect(result.rows.map((row) => row.keys[0])).toEqual(expected.map((row) => row.k));
    expect(result.rows.map((row) => row.values[0])).toEqual(expected.map((row) => Number(row.v)));
    expect(result.truncated).toBe(true);
  });
});

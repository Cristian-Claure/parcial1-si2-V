import { Injectable } from "@nestjs/common";
import { sql, type SQL } from "drizzle-orm";
import { DatabaseService } from "../database/database.service.js";
import { paymentEventsSql, signedAmountSql, storeScopeSql } from "./report-facts.js";

/** Ventana de consulta en UTC (inicio inclusivo, fin exclusivo) ya alineada al día de Bolivia. */
export interface AnalyticsWindow { start: Date; endExclusive: Date }
export interface AnalyticsScope { companyId: string; storeId: string | null }

export interface PeriodKpis {
  grossSales: number; refunds: number; netSales: number; paidOrders: number; averageTicket: number;
  fulfilledOrders: number; createdOrders: number; cancelledOrders: number; cancellationRate: number; unitsSold: number;
}

const LOCAL = "America/La_Paz";
type Row = Record<string, unknown>;
const num = (value: unknown) => Number(value ?? 0);
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Agregaciones de reportes en SQL (una consulta por widget, solo para los permitidos por el
 * nivel). Definiciones idénticas a las del resumen: ventas = pagos PAID/REFUNDED por paid_at;
 * reembolsos por refunded_at; días y horas en la zona de Bolivia.
 */
@Injectable()
export class ReportAnalyticsRepository {
  constructor(private readonly database: DatabaseService) {}

  private async rows(query: SQL): Promise<Row[]> {
    return (await this.database.db.execute(query)).rows as Row[];
  }

  /**
   * Eventos de venta neta: +monto al cobrarse (PAID/REFUNDED por paid_at) y −monto al reembolsarse
   * (REFUNDED por refunded_at), igual que la serie diaria del resumen.
   */
  private netEvents(scope: AnalyticsScope): SQL {
    return sql`(select e.store_id, e.store_name, e.ts at_ts, ${signedAmountSql("e")} amount from ${paymentEventsSql(scope)} e)`;
  }

  private scopeOf(scope: AnalyticsScope): SQL {
    return storeScopeSql(scope);
  }

  async kpis(scope: AnalyticsScope, window: AnalyticsWindow): Promise<PeriodKpis> {
    const where = this.scopeOf(scope);
    const [payments] = await this.rows(sql`
      select coalesce(sum(e.amount) filter (where e.kind = 'SALE'), 0) gross,
             coalesce(sum(e.amount) filter (where e.kind = 'REFUND'), 0) refunds,
             count(distinct e.order_id) filter (where e.kind = 'SALE') paid_orders
      from ${paymentEventsSql(scope)} e where e.ts >= ${window.start} and e.ts < ${window.endExclusive}`);
    const [orders] = await this.rows(sql`
      select count(*) filter (where o.created_at >= ${window.start} and o.created_at < ${window.endExclusive}) created,
             count(*) filter (where o.fulfilled_at >= ${window.start} and o.fulfilled_at < ${window.endExclusive}) fulfilled,
             count(*) filter (where o.cancelled_at >= ${window.start} and o.cancelled_at < ${window.endExclusive}) cancelled
      from orders o join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id where ${where}`);
    const [units] = await this.rows(sql`
      select coalesce(sum(i.quantity), 0) units from order_items i
      where i.order_id in (select p.order_id from payments p join orders o on o.id = p.order_id join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id
        where ${where} and p.status = 'PAID' and p.paid_at >= ${window.start} and p.paid_at < ${window.endExclusive})`);
    const gross = round2(num(payments?.gross)); const refunds = round2(num(payments?.refunds)); const paidOrders = num(payments?.paid_orders);
    const created = num(orders?.created); const cancelled = num(orders?.cancelled);
    return {
      grossSales: gross, refunds, netSales: round2(gross - refunds), paidOrders, averageTicket: paidOrders ? round2(gross / paidOrders) : 0,
      fulfilledOrders: num(orders?.fulfilled), createdOrders: created, cancelledOrders: cancelled,
      cancellationRate: created ? round2((100 * cancelled) / created) : 0, unitsSold: num(units?.units),
    };
  }

  /** Venta neta diaria (por día de Bolivia) para alinear el periodo anterior con el actual. */
  async dailyNet(scope: AnalyticsScope, window: AnalyticsWindow): Promise<Map<string, number>> {
    const rows = await this.rows(sql`
      select to_char(e.at_ts at time zone ${LOCAL}, 'YYYY-MM-DD') as day, sum(e.amount) amount from ${this.netEvents(scope)} e
      where e.at_ts >= ${window.start} and e.at_ts < ${window.endExclusive} group by 1`);
    return new Map(rows.map((row) => [String(row.day), round2(num(row.amount))]));
  }

  /** Ventas por categoría: subtotal de ítems de pedidos con pago confirmado en el periodo (antes de descuentos). */
  async salesByCategory(scope: AnalyticsScope, window: AnalyticsWindow, limit = 8): Promise<{ category: string; amount: number; units: number }[]> {
    const rows = await this.rows(sql`
      select c.name category, sum(i.subtotal) amount, sum(i.quantity) units
      from order_items i join product_variants pv on pv.id = i.variant_id join products pr on pr.id = pv.product_id join categories c on c.id = pr.category_id
      where i.order_id in (select p.order_id from payments p join orders o on o.id = p.order_id join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id
        where ${this.scopeOf(scope)} and p.status = 'PAID' and p.paid_at >= ${window.start} and p.paid_at < ${window.endExclusive})
      group by c.name order by amount desc limit ${limit}`);
    return rows.map((row) => ({ category: String(row.category), amount: round2(num(row.amount)), units: num(row.units) }));
  }

  async fulfillmentMix(scope: AnalyticsScope, window: AnalyticsWindow): Promise<{ type: string; orders: number }[]> {
    const rows = await this.rows(sql`
      select o.fulfillment_type type, count(*) orders from orders o join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id
      where ${this.scopeOf(scope)} and o.created_at >= ${window.start} and o.created_at < ${window.endExclusive} group by 1 order by 2 desc`);
    return rows.map((row) => ({ type: String(row.type), orders: num(row.orders) }));
  }

  async criticalInventory(scope: AnalyticsScope, threshold = 3, limit = 15): Promise<{ product: string; sku: string; store: string; available: number }[]> {
    const rows = await this.rows(sql`
      select pr.name product, pv.sku, s.name store, (st.physical_quantity - st.committed_quantity) available
      from inventory_stocks st join product_variants pv on pv.id = st.variant_id join products pr on pr.id = pv.product_id
        join warehouses w on w.id = st.warehouse_id join stores s on s.id = w.store_id
      where ${this.scopeOf(scope)} and pr.status = 'ACTIVE' and pv.active and (st.physical_quantity - st.committed_quantity) <= ${threshold}
      order by available, pr.name limit ${limit}`);
    return rows.map((row) => ({ product: String(row.product), sku: String(row.sku), store: String(row.store), available: num(row.available) }));
  }

  /** Venta neta mensual de los últimos `months` meses que terminan en el mes de `endExclusive`. */
  async monthlyNet(scope: AnalyticsScope, endExclusive: Date, months = 12): Promise<{ month: string; amount: number }[]> {
    const rows = await this.rows(sql`
      with months as (
        select to_char(gs, 'YYYY-MM') as month from generate_series(
          date_trunc('month', (${endExclusive}::timestamptz - interval '1 second') at time zone ${LOCAL}) - make_interval(months => ${months - 1}),
          date_trunc('month', (${endExclusive}::timestamptz - interval '1 second') at time zone ${LOCAL}), interval '1 month') gs
      ), sales as (
        select to_char(e.at_ts at time zone ${LOCAL}, 'YYYY-MM') as month, sum(e.amount) amount
        from ${this.netEvents(scope)} e where e.at_ts < ${endExclusive} group by 1
      ) select m.month, coalesce(s.amount, 0) amount from months m left join sales s on s.month = m.month order by m.month`);
    return rows.map((row) => ({ month: String(row.month), amount: round2(num(row.amount)) }));
  }

  /** Pedidos no cancelados por día de semana (1=lunes) y hora de Bolivia. */
  async heatmap(scope: AnalyticsScope, window: AnalyticsWindow): Promise<{ dow: number; hour: number; orders: number }[]> {
    const rows = await this.rows(sql`
      select extract(isodow from o.created_at at time zone ${LOCAL})::int as dow, extract(hour from o.created_at at time zone ${LOCAL})::int as hour, count(*) orders
      from orders o join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id
      where ${this.scopeOf(scope)} and o.status <> 'CANCELLED' and o.created_at >= ${window.start} and o.created_at < ${window.endExclusive} group by 1, 2`);
    return rows.map((row) => ({ dow: num(row.dow), hour: num(row.hour), orders: num(row.orders) }));
  }

  async netByStore(scope: AnalyticsScope, window: AnalyticsWindow): Promise<Map<string, { name: string; amount: number }>> {
    const rows = await this.rows(sql`
      select s.id, s.name, coalesce((select sum(e.amount) from ${this.netEvents(scope)} e
        where e.store_id = s.id and e.at_ts >= ${window.start} and e.at_ts < ${window.endExclusive}), 0) amount
      from stores s where ${this.scopeOf(scope)} and s.active order by s.name`);
    return new Map(rows.map((row) => [String(row.id), { name: String(row.name), amount: round2(num(row.amount)) }]));
  }

  /** Clientes del periodo: compradores, nuevos (primera compra en el periodo) y recurrentes (2+ compras a la fecha de cierre). */
  async customers(scope: AnalyticsScope, window: AnalyticsWindow): Promise<{ buyers: number; newCustomers: number; repeatBuyers: number }> {
    const [row] = await this.rows(sql`
      with paid as (
        select o.customer_id, o.id order_id, min(p.paid_at) paid_at
        from orders o join payments p on p.order_id = o.id join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id
        where ${this.scopeOf(scope)} and o.customer_id is not null and p.status in ('PAID', 'REFUNDED') and p.paid_at < ${window.endExclusive}
        group by o.customer_id, o.id
      ), per_customer as (
        select customer_id, min(paid_at) first_paid, count(*) orders_to_date, bool_or(paid_at >= ${window.start}) bought_in_period from paid group by customer_id
      )
      select count(*) filter (where bought_in_period) buyers,
             count(*) filter (where first_paid >= ${window.start}) new_customers,
             count(*) filter (where bought_in_period and orders_to_date >= 2) repeat_buyers
      from per_customer`);
    return { buyers: num(row?.buyers), newCustomers: num(row?.new_customers), repeatBuyers: num(row?.repeat_buyers) };
  }
}

import { Injectable } from "@nestjs/common";
import { sql, type SQL } from "drizzle-orm";
import type { ReportBuilderFilter, ReportDimensionId, ReportMeasureId } from "@velora/contracts";
import { ApiHttpError } from "../../common/http/api-http.error.js";
import { DatabaseService } from "../../database/database.service.js";
import { paymentEventsSql, storeScopeSql, type FactScope } from "../report-facts.js";
import { DIMENSION_SQL, EMPTY_KEY, MEASURE_SQL } from "./semantic-layer.js";

export interface SemanticQuery {
  scope: FactScope;
  window: { start: Date; endExclusive: Date };
  dimensions: readonly ReportDimensionId[];
  measures: readonly ReportMeasureId[];
  filters: readonly ReportBuilderFilter[];
  sort: { by: ReportDimensionId | ReportMeasureId; direction: "ASC" | "DESC" };
  limit: number;
}

export interface SemanticRow { keys: string[]; rawLabels: (string | null)[]; values: number[] }

/** Tope duro de tiempo por consulta del constructor (además del tope de filas). */
export const SEMANTIC_STATEMENT_TIMEOUT_MS = 10_000;
const KEY_SEPARATOR = "\u001f";

type Row = Record<string, unknown>;
const raw = (fragment: string) => sql.raw(fragment);

/**
 * Traduce una consulta del catálogo semántico a SQL parametrizado. Todo fragmento proviene de
 * la lista blanca (`semantic-layer.ts`); el alcance sale de `FactScope` (resuelto por
 * TenantScopeService en el servicio) y se aplica en cada fuente de hechos.
 */
@Injectable()
export class SemanticQueryRepository {
  constructor(private readonly database: DatabaseService) {}

  /** Filas agrupadas (hasta `limit`, con detección de truncado) y totales del conjunto completo. */
  async run(query: SemanticQuery): Promise<{ rows: SemanticRow[]; totals: number[]; truncated: boolean }> {
    const plan = this.plan(query);
    return this.readOnly(async (execute) => {
      const [rows, totals] = await Promise.all([
        query.dimensions.length ? execute(this.groupedSql(query, plan, query.limit + 1, null)) : Promise.resolve([] as Row[]),
        execute(this.totalsSql(query, plan)),
      ]);
      return {
        rows: rows.slice(0, query.limit).map((row) => this.toRow(query, row)),
        totals: query.measures.map((_, index) => this.number(totals[0]?.[`m${index}`])),
        truncated: rows.length > query.limit,
      };
    });
  }

  /** Mismas agrupaciones en otra ventana, restringidas a las claves dadas (comparación por fila). */
  async valuesForKeys(query: SemanticQuery, keys: string[][]): Promise<{ rows: Map<string, number[]>; totals: number[] }> {
    const plan = this.plan(query);
    return this.readOnly(async (execute) => {
      const [rows, totals] = await Promise.all([
        keys.length && query.dimensions.length ? execute(this.groupedSql(query, plan, null, keys.map((key) => key.join(KEY_SEPARATOR)))) : Promise.resolve([] as Row[]),
        execute(this.totalsSql(query, plan)),
      ]);
      return {
        rows: new Map(rows.map((row) => { const parsed = this.toRow(query, row); return [parsed.keys.join(KEY_SEPARATOR), parsed.values]; })),
        totals: query.measures.map((_, index) => this.number(totals[0]?.[`m${index}`])),
      };
    });
  }

  static rowKey(keys: string[]): string {
    return keys.join(KEY_SEPARATOR);
  }

  // ---------------------------------------------------------------------------

  private plan(query: SemanticQuery) {
    const dims = [...query.dimensions, ...query.filters.map((filter) => filter.dimension)].map((id) => DIMENSION_SQL[id]);
    const measures = query.measures.map((id) => MEASURE_SQL[id]);
    return {
      item: dims.some((dim) => dim.item) || measures.some((measure) => measure.item),
      customer: dims.some((dim) => dim.customer),
      paymentForOrders: dims.some((dim) => dim.payment),
      sales: measures.some((measure) => measure.sales),
      orderEvents: measures.some((measure) => measure.orderEvents),
      inventory: measures.some((measure) => measure.inventory),
      firstPurchase: measures.some((measure) => measure.firstPurchase),
    };
  }

  private async readOnly<T>(work: (execute: (query: SQL) => Promise<Row[]>) => Promise<T>): Promise<T> {
    try {
      return await this.database.db.transaction(async (tx) => {
        await tx.execute(sql.raw(`set local statement_timeout = ${SEMANTIC_STATEMENT_TIMEOUT_MS}`));
        // Secuencial dentro de la transacción (una conexión): Promise.all solo encadena.
        let chain: Promise<unknown> = Promise.resolve();
        const execute = (query: SQL) => {
          const next = chain.then(async () => (await tx.execute(query)).rows as Row[]);
          chain = next.catch(() => undefined);
          return next;
        };
        return work(execute);
      }, { accessMode: "read only" });
    } catch (error) {
      if ((error as { code?: string; cause?: { code?: string } })?.code === "57014" || (error as { cause?: { code?: string } })?.cause?.code === "57014") {
        throw ApiHttpError.coded(503, "REPORT_QUERY_TIMEOUT", "La consulta tardó demasiado. Reduce el período, las agrupaciones o el top N.");
      }
      throw error;
    }
  }

  /** Hechos unificados `g` con columnas homogéneas para todas las fuentes. */
  private factsSql(query: SemanticQuery, plan: ReturnType<SemanticQueryRepository["plan"]>): SQL {
    const { start, endExclusive } = query.window;
    const events: SQL[] = [];
    if (plan.sales) {
      events.push(sql`
        select e.kind, e.ts, e.order_id, e.payment_id, e.method::text method, e.status::text pay_status, e.amount::numeric amount, e.store_id, e.store_name::text store_name,
          row_number() over (partition by e.order_id, e.kind, e.status order by e.ts, e.payment_id) rn_status,
          row_number() over (partition by e.order_id, e.kind order by e.ts, e.payment_id) rn_any
        from ${paymentEventsSql(query.scope)} e where e.ts >= ${start} and e.ts < ${endExclusive}`);
    }
    if (plan.orderEvents) {
      const method = plan.paymentForOrders ? raw("(select p2.method::text from payments p2 where p2.order_id = o.id order by p2.created_at desc limit 1)") : raw("null::text");
      for (const [kind, column] of [["CREATED", "created_at"], ["CANCELLED", "cancelled_at"]] as const) {
        events.push(sql`
          select ${kind}::text kind, o.${raw(column)} ts, o.id order_id, null::uuid payment_id, ${method} method, null::text pay_status, 0::numeric amount, s.id store_id, s.name::text store_name, 1::bigint rn_status, 1::bigint rn_any
          from orders o join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id
          where ${storeScopeSql(query.scope)} and o.${raw(column)} >= ${start} and o.${raw(column)} < ${endExclusive}`);
      }
    }

    const parts: SQL[] = [];
    if (events.length) {
      const ev = sql`(${sql.join(events, sql` union all `)})`;
      parts.push(plan.item
        ? sql`
          select ev.*, it.variant_id, it.quantity::numeric quantity, coalesce(it.share, 1::numeric) share, null::numeric stock_value
          from ${ev} ev left join (
            select i.order_id, i.variant_id, i.quantity,
              case when sum(i.subtotal) over ow > 0 then i.subtotal / sum(i.subtotal) over ow else 1.0 / count(*) over ow end share
            from order_items i
            where i.order_id in (select o.id from orders o join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id where ${storeScopeSql(query.scope)})
            window ow as (partition by i.order_id)
          ) it on it.order_id = ev.order_id`
        : sql`select ev.*, null::uuid variant_id, null::numeric quantity, 1::numeric share, null::numeric stock_value from ${ev} ev`);
    }
    if (plan.inventory) {
      parts.push(sql`
        select 'STOCK'::text kind, null::timestamptz ts, null::uuid order_id, null::uuid payment_id, null::text method, null::text pay_status, 0::numeric amount, s.id store_id, s.name::text store_name, 1::bigint rn_status, 1::bigint rn_any,
          st.variant_id, st.available_quantity::numeric quantity, 1::numeric share, (st.available_quantity * pv.price)::numeric stock_value
        from inventory_stocks st join product_variants pv on pv.id = st.variant_id join warehouses w on w.id = st.warehouse_id join stores s on s.id = w.store_id
        where ${storeScopeSql(query.scope)}`);
    }
    return sql`(${sql.join(parts, sql` union all `)})`;
  }

  private fromSql(query: SemanticQuery, plan: ReturnType<SemanticQueryRepository["plan"]>): SQL {
    const joins: SQL[] = [sql`left join orders o on o.id = g.order_id`];
    if (plan.customer) joins.push(sql`left join app_users cu on cu.id = o.customer_id`);
    if (plan.item) joins.push(sql`left join product_variants pv on pv.id = g.variant_id left join products pr on pr.id = pv.product_id left join categories c on c.id = pr.category_id`);
    if (plan.firstPurchase) {
      joins.push(sql`left join (
        select o2.customer_id, min(p.paid_at) first_paid
        from payments p join orders o2 on o2.id = p.order_id join warehouses w on w.id = o2.warehouse_id join stores s on s.id = w.store_id
        where ${storeScopeSql(query.scope)} and p.status in ('PAID', 'REFUNDED') and p.paid_at is not null and o2.customer_id is not null
        group by o2.customer_id
      ) fp on fp.customer_id = o.customer_id`);
    }
    const where = query.filters.map((filter) => sql`coalesce(${raw(DIMENSION_SQL[filter.dimension].key)}, ${EMPTY_KEY}) = any(${sql.param([...filter.values])}::text[])`);
    return sql`from ${this.factsSql(query, plan)} g ${sql.join(joins, sql` `)}${where.length ? sql` where ${sql.join(where, sql` and `)}` : sql``}`;
  }

  private measuresSql(query: SemanticQuery): SQL {
    return sql.join(query.measures.map((id, index) => {
      const definition = MEASURE_SQL[id];
      const pieces = definition.expr.split("{START}");
      const expr = sql.join(pieces.map((piece) => raw(piece)), sql`${query.window.start}::timestamptz`);
      return sql`round((${expr})::numeric, ${raw(String(definition.decimals))}) ${raw(`m${index}`)}`;
    }), sql`, `);
  }

  private totalsSql(query: SemanticQuery, plan: ReturnType<SemanticQueryRepository["plan"]>): SQL {
    return sql`select ${this.measuresSql(query)} ${this.fromSql(query, plan)}`;
  }

  private groupedSql(query: SemanticQuery, plan: ReturnType<SemanticQueryRepository["plan"]>, limit: number | null, onlyKeys: string[] | null): SQL {
    const keyExprs = query.dimensions.map((id) => `coalesce(${DIMENSION_SQL[id].key}, '${EMPTY_KEY}')`);
    const selectDims = query.dimensions.map((id, index) => raw(`${keyExprs[index]} d${index}, min(${DIMENSION_SQL[id].label}) l${index}`));
    const groupBy = raw(keyExprs.map((_, index) => `d${index}`).join(", "));
    const having = onlyKeys ? sql` having concat_ws(${KEY_SEPARATOR}, ${raw(keyExprs.join(", "))}) = any(${sql.param(onlyKeys)}::text[])` : sql``;
    const sortIndex = query.measures.indexOf(query.sort.by as ReportMeasureId);
    const sortColumn = sortIndex >= 0 ? `m${sortIndex}` : `d${query.dimensions.indexOf(query.sort.by as ReportDimensionId)}`;
    const tieBreak = keyExprs.map((_, index) => `d${index}`).filter((column) => column !== sortColumn);
    const orderBy = raw([`${sortColumn} ${query.sort.direction === "ASC" ? "asc" : "desc"} nulls last`, ...tieBreak].join(", "));
    return sql`select ${sql.join(selectDims, sql`, `)}, ${this.measuresSql(query)} ${this.fromSql(query, plan)} group by ${groupBy}${having} order by ${orderBy}${limit ? sql` limit ${limit}` : sql``}`;
  }

  private toRow(query: SemanticQuery, row: Row): SemanticRow {
    return {
      keys: query.dimensions.map((_, index) => String(row[`d${index}`])),
      rawLabels: query.dimensions.map((_, index) => (row[`l${index}`] === null || row[`l${index}`] === undefined ? null : String(row[`l${index}`]))),
      values: query.measures.map((_, index) => this.number(row[`m${index}`])),
    };
  }

  private number(value: unknown): number {
    return Number(value ?? 0);
  }
}

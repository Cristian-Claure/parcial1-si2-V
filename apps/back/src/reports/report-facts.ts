import { sql, type SQL } from "drizzle-orm";

/** Zona horaria de negocio para días, semanas, meses y horas de los reportes. */
export const REPORT_ZONE = "America/La_Paz";

export interface FactScope { companyId: string; storeId: string | null }

/** Alcance multi-tenant sobre el alias `s` (stores); los ids van siempre como parámetros. */
export function storeScopeSql(scope: FactScope): SQL {
  return scope.storeId
    ? sql`s.company_id = ${scope.companyId}::uuid and s.id = ${scope.storeId}::uuid`
    : sql`s.company_id = ${scope.companyId}::uuid`;
}

/**
 * FUENTE ÚNICA de "venta" para widgets y constructor. Eventos de pago:
 * - SALE: cobro confirmado (status PAID o REFUNDED) en `paid_at`, por su importe;
 * - REFUND: reembolso (status REFUNDED) en `refunded_at`, por su importe.
 * Venta bruta = Σ SALE; reembolsos = Σ REFUND; venta neta = bruta − reembolsos.
 * Columnas: kind, payment_id, order_id, method, status, amount, ts, store_id, store_name.
 */
export function paymentEventsSql(scope: FactScope): SQL {
  return sql`(
    select 'SALE'::text kind, p.id payment_id, p.order_id, p.method, p.status, p.amount, p.paid_at ts, s.id store_id, s.name store_name
    from payments p join orders o on o.id = p.order_id join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id
    where ${storeScopeSql(scope)} and p.status in ('PAID', 'REFUNDED') and p.paid_at is not null
    union all
    select 'REFUND'::text, p.id, p.order_id, p.method, p.status, p.amount, p.refunded_at, s.id, s.name
    from payments p join orders o on o.id = p.order_id join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id
    where ${storeScopeSql(scope)} and p.status = 'REFUNDED' and p.refunded_at is not null
  )`;
}

/** Importe con signo de un evento de pago (alias `e`): + al cobrar, − al reembolsar. */
export const signedAmountSql = (alias: string): SQL => sql.raw(`case when ${alias}.kind = 'SALE' then ${alias}.amount else -${alias}.amount end`);

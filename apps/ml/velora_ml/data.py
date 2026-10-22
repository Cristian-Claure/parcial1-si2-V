"""Consultas del ML. TODAS filtran por la empresa (`%(company_id)s`) y solo leen.

La venta neta replica la definición única del backend (`apps/back/src/reports/report-facts.ts`):
cobros PAID/REFUNDED por `paid_at` menos reembolsos REFUNDED por `refunded_at`, por día de Bolivia.
"""
from __future__ import annotations

import datetime as dt

import pandas as pd
import psycopg

from .config import BUSINESS_TZ
from .db import frame

_COMPANY_ORDERS = "orders o join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id"

DAILY_NET_SQL = f"""
with ev as (
  select p.paid_at ts, p.amount amt
  from payments p join {_COMPANY_ORDERS} on o.id = p.order_id
  where s.company_id = %(company_id)s and p.status in ('PAID', 'REFUNDED') and p.paid_at is not null
  union all
  select p.refunded_at, -p.amount
  from payments p join {_COMPANY_ORDERS} on o.id = p.order_id
  where s.company_id = %(company_id)s and p.status = 'REFUNDED' and p.refunded_at is not null
)
select (ts at time zone '{BUSINESS_TZ}')::date as day, sum(amt)::float8 as net
from ev group by 1 order by 1
"""

FIRST_ORDER_SQL = f"""
select min((o.created_at at time zone '{BUSINESS_TZ}')::date) as first_day,
       (now() at time zone '{BUSINESS_TZ}')::date as today
from {_COMPANY_ORDERS} where s.company_id = %(company_id)s
"""

# Momento de puntuación de S2 = creación del pedido en el checkout. Solo columnas conocidas en ese
# instante: nunca cancelled_at, fulfilled_at, fechas o estados de pago ni historiales. `o.status`
# se lee únicamente como ETIQUETA (y para elegir qué pedidos se puntúan), nunca como variable.
CANCEL_DATASET_SQL = f"""
select o.id::text as order_id,
       o.status as label_status,
       o.created_at,
       o.fulfillment_type,
       o.total::float8 as total,
       coalesce(o.discount_amount, 0)::float8 as discount,
       (select count(*) from order_items i where i.order_id = o.id)::int as n_lines,
       (select coalesce(sum(i.quantity), 0) from order_items i where i.order_id = o.id)::int as units,
       coalesce((select p.method from payments p where p.order_id = o.id order by p.created_at, p.id limit 1), 'NONE') as payment_method,
       extract(hour from o.created_at at time zone '{BUSINESS_TZ}')::int as hour,
       extract(isodow from o.created_at at time zone '{BUSINESS_TZ}')::int as dow,
       greatest(0, extract(epoch from (o.created_at - cu.created_at)) / 86400.0)::float8 as tenure_days,
       (select count(*) from orders o2 join warehouses w2 on w2.id = o2.warehouse_id join stores s2 on s2.id = w2.store_id
          where o2.customer_id = o.customer_id and s2.company_id = %(company_id)s and o2.created_at < o.created_at)::int as prior_orders
from {_COMPANY_ORDERS} left join app_users cu on cu.id = o.customer_id
where s.company_id = %(company_id)s and o.order_channel = 'ECOMMERCE' and o.status in ('CANCELLED', 'FULFILLED', 'RESERVED')
order by o.created_at, o.id
"""

RFM_SQL = f"""
select o.customer_id::text as customer_id, cu.email,
       max(p.paid_at) as last_paid,
       count(distinct o.id)::int as frequency,
       coalesce(sum(p.amount) filter (where p.status = 'PAID'), 0)::float8 as monetary
from payments p join {_COMPANY_ORDERS} on o.id = p.order_id join app_users cu on cu.id = o.customer_id
where s.company_id = %(company_id)s and p.status in ('PAID', 'REFUNDED') and p.paid_at is not null and p.paid_at < %(cutoff)s
group by o.customer_id, cu.email
"""


def company_lookup(connection: psycopg.Connection, key: str) -> dict | None:
    """Empresa por id o slug (para la CLI)."""
    with connection.cursor() as cursor:
        cursor.execute("select id::text, slug, name from companies where id::text = %(key)s or slug = %(key)s", {"key": key})
        row = cursor.fetchone()
    return {"id": row[0], "slug": row[1], "name": row[2]} if row else None


def daily_net_sales(connection: psycopg.Connection, company_id: str) -> pd.Series:
    """Serie diaria completa (días sin venta = 0) desde el primer pedido hasta AYER (hoy está incompleto)."""
    bounds = frame(connection, FIRST_ORDER_SQL, {"company_id": company_id})
    if bounds.empty or pd.isna(bounds.loc[0, "first_day"]):
        return pd.Series(dtype=float)
    first, today = pd.Timestamp(bounds.loc[0, "first_day"]), pd.Timestamp(bounds.loc[0, "today"])
    raw = frame(connection, DAILY_NET_SQL, {"company_id": company_id})
    index = pd.date_range(first, today - pd.Timedelta(days=1), freq="D")
    series = pd.Series(0.0, index=index, name="net")
    if not raw.empty:
        values = raw.assign(day=pd.to_datetime(raw["day"])).set_index("day")["net"].astype(float)
        series.loc[values.index.intersection(index)] = values.loc[values.index.intersection(index)]
    return series


def cancel_dataset(connection: psycopg.Connection, company_id: str) -> pd.DataFrame:
    return frame(connection, CANCEL_DATASET_SQL, {"company_id": company_id})


def rfm_frame(connection: psycopg.Connection, company_id: str, cutoff: dt.datetime) -> pd.DataFrame:
    return frame(connection, RFM_SQL, {"company_id": company_id, "cutoff": cutoff})

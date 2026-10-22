"""Fronteras del servicio: solo escribe ml_*, toda consulta lleva company_id, token y rol de BD."""
from __future__ import annotations

import pytest

from velora_ml import db
from velora_ml.config import load_settings


def test_writes_only_to_ml_tables():
    db.assert_ml_table("insert into ml_runs (id) values (1)")
    db.assert_ml_table("UPDATE ml_runs set status = 'RUNNING'")
    for statement in ["update orders set notes = 'x'", "delete from payments", "insert into app_users (id) values (1)", "select 1"]:
        with pytest.raises(PermissionError):
            db.assert_ml_table(statement)


def test_every_query_requires_company_id():
    with pytest.raises(ValueError):
        db.frame(None, "select 1", {})  # type: ignore[arg-type]


def test_api_requires_internal_token(monkeypatch):
    from fastapi import HTTPException
    from velora_ml import api
    monkeypatch.setattr(api, "settings", api.settings.__class__(**{**api.settings.__dict__, "token": "secreto-de-prueba"}))
    with pytest.raises(HTTPException) as missing:
        api._authorize(None)
    assert missing.value.status_code == 401
    with pytest.raises(HTTPException):
        api._authorize("otro")
    api._authorize("secreto-de-prueba")
    assert api.health()["status"] == "UP"


# --- Integración con la BD local (se omite si no hay BD o datos sembrados) --------------------

settings = load_settings()


def _company(connection, slug):
    from velora_ml.data import company_lookup
    return company_lookup(connection, slug)


@pytest.fixture(scope="module")
def connection():
    try:
        with db.connect(settings.database_url) as conn:
            if not _company(conn, "urbano-boutique"):
                pytest.skip("Sin las tiendas de muestra.")
            yield conn
    except Exception as error:  # noqa: BLE001
        pytest.skip(f"BD no disponible: {error}")


def test_daily_net_sales_matches_reference_sql(connection):
    """La venta neta de Python = definición única del backend (pagos confirmados − reembolsos)."""
    from velora_ml.data import daily_net_sales
    company = _company(connection, "urbano-boutique")
    series = daily_net_sales(connection, company["id"])
    with connection.cursor() as cursor:
        cursor.execute("""
          select coalesce(sum(case when p.status in ('PAID','REFUNDED') and (p.paid_at at time zone 'America/La_Paz')::date between %(a)s and %(b)s then p.amount else 0 end)
               - sum(case when p.status = 'REFUNDED' and (p.refunded_at at time zone 'America/La_Paz')::date between %(a)s and %(b)s then p.amount else 0 end), 0)
          from payments p join orders o on o.id = p.order_id join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id where s.company_id = %(c)s""",
                       {"a": series.index[0].date(), "b": series.index[-1].date(), "c": company["id"]})
        reference = float(cursor.fetchone()[0])
    assert series.sum() == pytest.approx(reference, abs=0.01)


def test_ml_role_cannot_write_operational_tables():
    url = load_settings().database_url
    if "velora_ml" not in url:
        pytest.skip("Sin rol velora_ml (pnpm ml:db-role).")
    import psycopg
    try:
        conn = psycopg.connect(url)
    except Exception as error:  # noqa: BLE001
        pytest.skip(f"BD no disponible: {error}")
    with conn, conn.cursor() as cursor:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            cursor.execute("update orders set notes = notes where false")

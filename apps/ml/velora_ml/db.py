"""Acceso a Postgres. Lecturas parametrizadas; escrituras SOLO en tablas ml_* (verificado en `write`)."""
from __future__ import annotations

import re
from contextlib import contextmanager
from typing import Any, Iterator, Sequence

import pandas as pd
import psycopg

_WRITE_TARGET = re.compile(r"^\s*(insert\s+into|update|delete\s+from)\s+([a-z_]+)", re.IGNORECASE)


@contextmanager
def connect(database_url: str) -> Iterator[psycopg.Connection]:
    if not database_url:
        raise RuntimeError("Falta DATABASE_URL (o VELORA_ML_DATABASE_URL) para el servicio ML.")
    with psycopg.connect(database_url, autocommit=False) as connection:
        yield connection


def frame(connection: psycopg.Connection, query: str, params: dict[str, Any]) -> pd.DataFrame:
    """Consulta parametrizada a DataFrame. Toda consulta del ML recibe `company_id`."""
    if "company_id" not in params:
        raise ValueError("Toda consulta del ML debe filtrar por company_id.")
    with connection.cursor() as cursor:
        cursor.execute(query, params)
        columns = [column.name for column in cursor.description or []]
        return pd.DataFrame(cursor.fetchall(), columns=columns)


def assert_ml_table(statement: str) -> None:
    match = _WRITE_TARGET.match(statement)
    if not match or not match.group(2).lower().startswith("ml_"):
        raise PermissionError("El servicio ML solo escribe en tablas ml_*.")


def write(connection: psycopg.Connection, statement: str, params: dict[str, Any] | None = None) -> None:
    assert_ml_table(statement)
    with connection.cursor() as cursor:
        cursor.execute(statement, params or {})


def write_many(connection: psycopg.Connection, statement: str, rows: Sequence[dict[str, Any]]) -> None:
    assert_ml_table(statement)
    if not rows:
        return
    with connection.cursor() as cursor:
        cursor.executemany(statement, rows)

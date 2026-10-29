"""Orquestación de corridas: estado en ml_runs, resultados en ml_*, artefactos joblib y retención.

Un entrenamiento a la vez por proceso (`TRAINING_LOCK`). Cada modelo hace commit por separado:
si uno falla, los demás conservan su resultado.
"""
from __future__ import annotations

import json
import shutil
import threading
import traceback
import uuid
import warnings
from datetime import date, datetime, timezone
from typing import Any

import joblib
import numpy as np
import pandas as pd
import sklearn
from psycopg.types.json import Jsonb

from . import data
from .config import MODEL_KEYS, Settings
from .db import connect, write, write_many
from .models.anomalies import train_anomalies
from .models.cancel_risk import train_cancel_risk
from .models.common import InsufficientData
from .models.forecast import train_forecast
from .models.segments import train_segments

TRAINING_LOCK = threading.Lock()
CURRENT: dict[str, Any] = {}


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return None if np.isnan(value) else float(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value.isoformat()
    return value


def _json(value: Any) -> Jsonb:
    return Jsonb(json.loads(json.dumps(_jsonable(value))))


def create_runs(settings: Settings, company_id: str, models: list[str], requested_by: str | None = None) -> dict[str, str]:
    """Para la CLI: crea las corridas QUEUED (el backend las crea él mismo)."""
    runs = {model: str(uuid.uuid4()) for model in models}
    with connect(settings.database_url) as connection:
        for model, run_id in runs.items():
            write(connection, "insert into ml_runs (id, company_id, model_key, status, requested_by) values (%(id)s, %(company_id)s, %(model)s, 'QUEUED', %(by)s)",
                  {"id": run_id, "company_id": company_id, "model": model, "by": requested_by})
        connection.commit()
    return runs


def _mark(connection, run_id: str, company_id: str, status: str, **fields: Any) -> None:
    sets = ["status = %(status)s"]
    params: dict[str, Any] = {"id": run_id, "company_id": company_id, "status": status}
    for key, value in fields.items():
        sets.append(f"{key} = %({key})s")
        params[key] = _json(value) if key in ("metrics", "params") else value
    write(connection, f"update ml_runs set {', '.join(sets)} where id = %(id)s and company_id = %(company_id)s", params)


def _save_artifact(settings: Settings, company_id: str, model_key: str, run_id: str, model: Any) -> str:
    folder = settings.artifacts_dir / company_id / model_key
    folder.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, folder / f"{run_id}.joblib", compress=3)
    return f"{model_key.lower()}-sklearn{sklearn.__version__}-{run_id[:8]}"


def _retain(settings: Settings, connection, company_id: str, model_key: str) -> None:
    """Conserva las últimas N corridas terminadas por empresa y modelo (los resultados caen en cascada)."""
    with connection.cursor() as cursor:
        cursor.execute(
            """select id::text from ml_runs where company_id = %(company_id)s and model_key = %(model)s and status not in ('QUEUED', 'RUNNING')
               order by created_at desc offset %(keep)s""", {"company_id": company_id, "model": model_key, "keep": settings.keep_runs})
        old = [row[0] for row in cursor.fetchall()]
    for run_id in old:
        write(connection, "delete from ml_runs where id = %(id)s and company_id = %(company_id)s", {"id": run_id, "company_id": company_id})
        artifact = settings.artifacts_dir / company_id / model_key / f"{run_id}.joblib"
        artifact.unlink(missing_ok=True)


def _write_results(connection, model_key: str, run_id: str, company_id: str, result: Any) -> None:
    base = {"run_id": run_id, "company_id": company_id}
    if model_key == "SALES_FORECAST":
        rows = [{**base, "day": row.day.date(), "kind": "BACKTEST", "actual": round(float(row.actual), 2), "predicted": round(float(row.predicted), 2),
                 "lower": round(float(row.lower), 2), "upper": round(float(row.upper), 2)} for row in result.backtest.itertuples()]
        rows += [{**base, "day": row.day.date(), "kind": "FORECAST", "actual": None, "predicted": round(float(row.predicted), 2),
                  "lower": round(float(row.lower), 2), "upper": round(float(row.upper), 2)} for row in result.forecast.itertuples()]
        write_many(connection, """insert into ml_forecasts (run_id, company_id, day, kind, actual, predicted, lower_bound, upper_bound)
            values (%(run_id)s, %(company_id)s, %(day)s, %(kind)s, %(actual)s, %(predicted)s, %(lower)s, %(upper)s)""", rows)
    elif model_key == "SALES_ANOMALIES":
        rows = [{**base, "day": row.day.date(), "actual": round(float(row.actual), 2), "expected": round(float(row.expected), 2), "score": round(float(row.score), 4),
                 "is_anomaly": bool(row.is_anomaly), "direction": row.direction, "explanation": row.explanation} for row in result.days.itertuples()]
        write_many(connection, """insert into ml_anomalies (run_id, company_id, day, actual, expected, score, is_anomaly, direction, explanation)
            values (%(run_id)s, %(company_id)s, %(day)s, %(actual)s, %(expected)s, %(score)s, %(is_anomaly)s, %(direction)s, %(explanation)s)""", rows)
    elif model_key == "CUSTOMER_SEGMENTS":
        rows = [{**base, "customer_id": row.customer_id, "segment": int(row.segment), "segment_name": row.segment_name, "recency": int(row.recency_days),
                 "frequency": int(row.frequency), "monetary": round(float(row.monetary), 2), "pc1": float(row.pc1), "pc2": float(row.pc2)} for row in result.customers.itertuples()]
        write_many(connection, """insert into ml_customer_segments (run_id, company_id, customer_id, segment, segment_name, recency_days, frequency, monetary, pc1, pc2)
            values (%(run_id)s, %(company_id)s, %(customer_id)s, %(segment)s, %(segment_name)s, %(recency)s, %(frequency)s, %(monetary)s, %(pc1)s, %(pc2)s)""", rows)
    elif model_key == "CANCEL_RISK":
        columns = ["fulfillment_type", "payment_method", "total", "discount", "n_lines", "units", "hour", "dow", "tenure_days", "prior_orders"]
        rows = [{**base, "order_id": row["order_id"], "probability": round(float(row["probability"]), 4), "risk_level": row["risk_level"],
                 "features": _json({column: row[column] for column in columns})} for _, row in result.scored.iterrows()]
        write_many(connection, """insert into ml_order_risk (run_id, company_id, order_id, probability, risk_level, features)
            values (%(run_id)s, %(company_id)s, %(order_id)s, %(probability)s, %(risk_level)s, %(features)s)""", rows)


def _train(settings: Settings, connection, model_key: str, company: dict, series: pd.Series | None):
    company_id = company["id"]
    if model_key == "SALES_FORECAST":
        return train_forecast(series)
    if model_key == "SALES_ANOMALIES":
        return train_anomalies(series)
    if model_key == "CANCEL_RISK":
        return train_cancel_risk(data.cancel_dataset(connection, company_id))
    cutoff = pd.Timestamp.now(tz="UTC").normalize()
    return train_segments(data.rfm_frame(connection, company_id, cutoff.to_pydatetime()), cutoff, settings.seed_labels, company.get("slug"))


def run_models(settings: Settings, company_id: str, runs: dict[str, str]) -> dict[str, dict]:
    """Ejecuta las corridas indicadas (modelo → run_id ya creado en QUEUED). Devuelve un resumen."""
    summary: dict[str, dict] = {}
    warnings.filterwarnings("ignore", category=UserWarning)
    warnings.filterwarnings("ignore", category=RuntimeWarning)
    with connect(settings.database_url) as connection:
        company = data.company_lookup(connection, company_id)
        if not company:
            raise ValueError("Empresa no encontrada.")
        series = None
        for model_key in [key for key in MODEL_KEYS if key in runs]:
            run_id = runs[model_key]
            CURRENT.update({"companyId": company_id, "model": model_key, "runId": run_id})
            _mark(connection, run_id, company_id, "RUNNING", started_at=datetime.now(timezone.utc))
            connection.commit()
            try:
                if model_key == "SALES_FORECAST" and series is None:
                    series = data.daily_net_sales(connection, company_id)
                # Iteración declarada: las anomalías se buscan en pedidos por día (no en Bs).
                model_series = data.daily_orders(connection, company_id) if model_key == "SALES_ANOMALIES" else series
                result = _train(settings, connection, model_key, company, model_series)
                _write_results(connection, model_key, run_id, company_id, result)
                artifact = _save_artifact(settings, company_id, model_key, run_id, result.model)
                data_from = getattr(result, "data_from", None)
                data_to = getattr(result, "data_to", None)
                _mark(connection, run_id, company_id, "SUCCEEDED", metrics=result.metrics, params=result.params, rows_used=int(result.rows_used),
                      data_from=data_from.date() if data_from is not None else None, data_to=data_to.date() if data_to is not None else None,
                      artifact_version=artifact, finished_at=datetime.now(timezone.utc))
                connection.commit()
                summary[model_key] = {"status": "SUCCEEDED", "metrics": result.metrics}
            except InsufficientData as error:
                connection.rollback()
                _mark(connection, run_id, company_id, "INSUFFICIENT_DATA", error=str(error)[:1000], finished_at=datetime.now(timezone.utc))
                connection.commit()
                summary[model_key] = {"status": "INSUFFICIENT_DATA", "error": str(error)}
            except Exception as error:  # noqa: BLE001 — se registra y sigue con el siguiente modelo
                connection.rollback()
                _mark(connection, run_id, company_id, "FAILED", error=f"{type(error).__name__}: {error}"[:1000], finished_at=datetime.now(timezone.utc))
                connection.commit()
                summary[model_key] = {"status": "FAILED", "error": traceback.format_exc(limit=3)}
            _retain(settings, connection, company_id, model_key)
            connection.commit()
    CURRENT.clear()
    return summary


def remove_company_artifacts(settings: Settings, company_id: str) -> None:
    shutil.rmtree(settings.artifacts_dir / company_id, ignore_errors=True)

"""Pruebas de los cuatro modelos: validación temporal, ausencia de fuga, métricas y determinismo."""
from __future__ import annotations

import re

import numpy as np
import pandas as pd
import pytest

from velora_ml import data
from velora_ml.calendar import black_friday, explain
from velora_ml.models.anomalies import train_anomalies
from velora_ml.models.cancel_risk import FEATURES as RISK_FEATURES, features, train_cancel_risk
from velora_ml.models.common import InsufficientData
from velora_ml.models.forecast import TEST_DAYS, design, metrics, train_forecast
from velora_ml.models.segments import name_segments, train_segments


# --- calendario -------------------------------------------------------------------------------

def test_calendar_matches_seeded_dates():
    assert str(black_friday(2025)) == "2025-11-28"
    assert str(black_friday(2026)) == "2026-11-27"
    assert explain(pd.Timestamp("2026-05-27")) == "Día de la Madre"
    assert explain(pd.Timestamp("2026-03-19")) == "Día del Padre"
    assert explain(pd.Timestamp("2026-10-07")) is None


# --- S1 pronóstico ----------------------------------------------------------------------------

def test_forecast_features_only_use_the_past(sales_series):
    origin = sales_series.index[0]
    base = design(sales_series, origin)
    altered = sales_series.copy()
    altered.iloc[300:] *= 10  # cambiar el futuro no puede cambiar las variables de un día anterior
    assert design(altered, origin).iloc[:301].equals(base.iloc[:301])


def test_forecast_walk_forward_is_temporal_and_beats_baselines(sales_series):
    result = train_forecast(sales_series)
    folds = result.metrics["validation"]["folds"]
    assert len(folds) >= 3
    ends = [pd.Timestamp(fold["to"]) for fold in folds]
    assert ends == sorted(ends)
    test_from = pd.Timestamp(result.metrics["test"]["from"])
    assert all(end < test_from for end in ends)  # la prueba es posterior a toda la validación
    assert result.metrics["test"]["days"] == TEST_DAYS == len(result.backtest)
    assert result.backtest["day"].iloc[-1] == sales_series.index[-1]
    assert len(result.forecast) == 30 and (result.forecast["upper"] >= result.forecast["lower"]).all()
    assert result.metrics["beats_baselines"] is True
    assert result.metrics["grid_size"] <= 20


def test_forecast_metrics_and_insufficient_data(sales_series):
    assert metrics(np.array([10.0, 0.0]), np.array([8.0, 0.0])) == {"mae": 1.0, "rmse": 1.41, "smape": 11.11}
    with pytest.raises(InsufficientData):
        train_forecast(sales_series.iloc[:200])


# --- S2 riesgo de cancelación -----------------------------------------------------------------

FORBIDDEN = ["cancelled_at", "fulfilled_at", "paid_at", "refunded_at", "failed_at", "p.status", "history", "updated_at"]


def test_cancel_query_has_no_post_checkout_columns():
    sql = data.CANCEL_DATASET_SQL.lower()
    for token in FORBIDDEN:
        assert token not in sql, f"La consulta de S2 usa {token}"
    assert "%(company_id)s" in sql
    assert re.search(r"o2\.created_at < o\.created_at", sql)  # el historial del cliente solo mira hacia atrás


def test_cancel_features_ignore_label_and_future_columns(orders_dataset):
    X = features(orders_dataset)
    assert list(X.columns) == RISK_FEATURES
    assert "label_status" not in X and "cancelled_at" not in X
    altered = orders_dataset.assign(label_status="CANCELLED", cancelled_at=pd.Timestamp("2030-01-01", tz="UTC"), paid_at=pd.Timestamp("2030-01-01", tz="UTC"))
    assert features(altered).equals(X)


def test_cancel_risk_temporal_split_threshold_and_baselines(orders_dataset):
    result = train_cancel_risk(orders_dataset)
    split = result.metrics["split"]
    assert pd.Timestamp(split["train_until"]) < pd.Timestamp(split["test_from"])
    test = result.metrics["test"]
    assert test["model"]["roc_auc"] > 0.6 and test["model"]["pr_auc"] > test["majority"]["pr_auc"]
    assert set(test["model"]["confusion"]) == {"tn", "fp", "fn", "tp"}
    assert sum(test["model"]["confusion"].values()) == split["test"]
    assert result.metrics["open_orders"] == 40 and len(result.scored) == 40  # RESERVED: se puntúan, no entrenan
    assert result.scored["probability"].is_monotonic_decreasing
    assert result.rows_used == len(orders_dataset) - 40
    assert result.metrics["importances"][0]["feature"] in ("fulfillment_type", "payment_method", "total")


# --- U1 segmentos -----------------------------------------------------------------------------

def test_segments_are_deterministic_and_named(rfm_raw):
    cutoff = pd.Timestamp("2026-10-21", tz="UTC")
    first = train_segments(rfm_raw, cutoff)
    second = train_segments(rfm_raw.sample(frac=1, random_state=5), cutoff)
    assert first.metrics["k"] == second.metrics["k"]
    merged = first.customers.merge(second.customers, on="customer_id")
    assert (merged["segment_name_x"] == merged["segment_name_y"]).all()
    assert 2 <= first.metrics["k"] <= 8
    assert abs(sum(profile["revenue_share"] for profile in first.metrics["profiles"]) - 1) < 0.01
    assert {"Leales", "Una sola compra"} <= {profile["name"].split(" · ")[0] for profile in first.metrics["profiles"]}


def test_segment_naming_rules():
    overall = pd.DataFrame({"recency_days": [10, 20, 30, 40], "frequency": [1, 2, 3, 4], "monetary": [100, 200, 300, 400]})
    profile = pd.DataFrame({"recency_days": [10, 200, 30, 40], "frequency": [10, 5, 2.5, 1], "monetary": [5000, 900, 250, 80], "frequency_median": [9, 5, 2, 1]})
    assert name_segments(profile, overall) == {0: "Leales", 1: "En riesgo", 2: "Ocasionales", 3: "Una sola compra"}


# --- U2 anomalías -----------------------------------------------------------------------------

def test_anomalies_find_seeded_spikes_with_few_false_positives(sales_series):
    spiked = sales_series.copy()
    for day, factor in [("2025-11-28", 3.0), ("2026-05-27", 2.5), ("2025-12-25", 0.2)]:
        spiked.loc[day] *= factor
    result = train_anomalies(spiked)
    flagged = set(result.days.loc[result.days["is_anomaly"], "day"].dt.strftime("%Y-%m-%d"))
    assert {"2025-11-28", "2026-05-27", "2025-12-25"} <= flagged
    assert result.metrics["unexplained_false_positives"] <= 5
    assert result.days.loc[result.days["day"] == pd.Timestamp("2025-11-28"), "explanation"].item() == "Black Friday"

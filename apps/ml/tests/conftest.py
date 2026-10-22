"""Datos sintéticos pequeños y deterministas para probar los modelos sin la BD."""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from velora_ml.calendar import calendar_flags  # noqa: E402

WEEK = np.array([0.85, 0.9, 1.0, 1.05, 1.25, 1.45, 1.2])  # lunes..domingo


@pytest.fixture(scope="session")
def sales_series() -> pd.Series:
    """Venta diaria con semana, crecimiento, quincena y fechas especiales (como el generador)."""
    rng = np.random.default_rng(7)
    days = pd.date_range("2025-06-01", "2026-10-20", freq="D")
    flags = calendar_flags(days)
    level = 1500 * (1.03 ** (np.arange(len(days)) / 30)) * WEEK[days.dayofweek]
    special = 1 + 0.15 * flags["quincena"] + 0.2 * flags["month_end"] + 1.5 * flags["black_friday"] + 0.8 * flags["mothers_day"] \
        + 0.6 * flags["fathers_day"] + 0.8 * flags["xmas_eve"] - 0.5 * flags["xmas_day"]
    values = level * special.to_numpy() * rng.lognormal(0, 0.08, len(days))
    return pd.Series(values.round(2), index=days, name="net")


@pytest.fixture(scope="session")
def orders_dataset() -> pd.DataFrame:
    """Pedidos online: DELIVERY, ticket alto y contra entrega cancelan más (regla sembrada)."""
    rng = np.random.default_rng(11)
    n = 1600
    created = pd.date_range("2025-07-01", periods=n, freq="7h", tz="UTC")
    fulfillment = rng.choice(["DELIVERY", "PICKUP"], n, p=[0.55, 0.45])
    method = np.where(fulfillment == "DELIVERY", rng.choice(["COD", "QR", "CARD"], n, p=[0.45, 0.35, 0.2]), rng.choice(["CASH", "QR", "CARD"], n, p=[0.4, 0.4, 0.2]))
    total = rng.gamma(3, 150, n).round(2)
    probability = 0.04 + 0.08 * (fulfillment == "DELIVERY") + 0.08 * (total > 600) + 0.08 * (method == "COD")
    cancelled = rng.random(n) < probability
    status = np.where(cancelled, "CANCELLED", "FULFILLED").astype(object)
    status[-40:] = "RESERVED"
    return pd.DataFrame({
        "order_id": [f"o{i:05d}" for i in range(n)], "label_status": status, "created_at": created,
        "fulfillment_type": fulfillment, "total": total, "discount": np.where(rng.random(n) < 0.2, 25.0, 0.0),
        "n_lines": rng.integers(1, 4, n), "units": rng.integers(1, 6, n), "payment_method": method,
        "hour": rng.integers(8, 23, n), "dow": rng.integers(1, 8, n), "tenure_days": rng.uniform(0, 300, n), "prior_orders": rng.integers(0, 12, n),
        # Columnas posteriores al checkout: NO deben influir en las variables.
        "cancelled_at": pd.NaT, "paid_at": pd.NaT,
    })


@pytest.fixture(scope="session")
def rfm_raw() -> pd.DataFrame:
    rng = np.random.default_rng(3)
    groups = [(60, 10, 25, 9000), (150, 60, 3, 1500), (120, 220, 1, 400), (70, 160, 8, 4000)]
    rows = []
    for size, recency, frequency, monetary in groups:
        for _ in range(size):
            rows.append({"recency": max(0, rng.normal(recency, recency * 0.2)), "frequency": max(1, int(rng.normal(frequency, frequency * 0.25))),
                         "monetary": max(50.0, rng.normal(monetary, monetary * 0.25))})
    frame = pd.DataFrame(rows)
    cutoff = pd.Timestamp("2026-10-21", tz="UTC")
    return pd.DataFrame({
        "customer_id": [f"c{i:04d}" for i in range(len(frame))], "email": [f"c{i}@x.local" for i in range(len(frame))],
        "last_paid": cutoff - pd.to_timedelta(frame["recency"], unit="D"), "frequency": frame["frequency"], "monetary": frame["monetary"],
    })

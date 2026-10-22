"""U2 · Anomalías en la venta neta diaria (no supervisado).

1) Demanda "normal" en escala raíz cuadrada: regresión robusta (Huber) con día de la semana y nivel local
   (mediana móvil centrada de 29 días), SIN fechas especiales ni quincena, para que esos efectos aparezcan
   como desvíos.
2) z-score robusto de los residuos: (r − mediana) / (1,4826 · MAD). |z| ≥ 3 → anomalía.
3) Cada día marcado se explica con el calendario (Black Friday, Día de la Madre, Navidad, quincena…).
Evidencia: cuántas fechas especiales sembradas detecta y cuántos días marca sin explicación.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.linear_model import HuberRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.compose import ColumnTransformer

from ..calendar import SEEDED_STRONG, calendar_flags, explain
from .common import InsufficientData

THRESHOLD = 3.0
MIN_DAYS = 90
LEVEL_WINDOW = 29


@dataclass
class AnomaliesResult:
    metrics: dict
    params: dict
    days: pd.DataFrame
    rows_used: int
    data_from: pd.Timestamp
    data_to: pd.Timestamp
    model: object = field(repr=False)


def train_anomalies(series: pd.Series, threshold: float = THRESHOLD) -> AnomaliesResult:
    series = series.astype(float).sort_index()
    if len(series) < MIN_DAYS or (series > 0).sum() < MIN_DAYS * 0.6:
        raise InsufficientData(f"Se necesitan al menos {MIN_DAYS} días con ventas para detectar anomalías (hay {(series > 0).sum()}).")
    calendar = calendar_flags(series.index)
    # Raíz cuadrada: estabiliza la varianza de conteos tipo Poisson sin amplificar los días casi en cero
    # (en escala log un día sin ventas daba z ≈ −11). El nivel local es la mediana móvil centrada de
    # 29 días (robusta a picos aislados) y sigue el crecimiento y la estacionalidad de categorías.
    y = np.sqrt(series.clip(lower=0))
    level = y.rolling(LEVEL_WINDOW, center=True, min_periods=LEVEL_WINDOW // 2).median().bfill().ffill()
    X = pd.DataFrame({"dow": calendar["dow"], "level": level}, index=series.index)
    model = Pipeline([
        ("prep", ColumnTransformer([("cal", OneHotEncoder(handle_unknown="ignore"), ["dow"]), ("level", StandardScaler(), ["level"])])),
        ("huber", HuberRegressor(epsilon=1.35, alpha=1e-3, max_iter=2000)),
    ]).fit(X, y)
    expected_root = model.predict(X)
    residual = y.to_numpy() - expected_root
    median = float(np.median(residual))
    mad = float(np.median(np.abs(residual - median))) or 1e-9
    z = (residual - median) / (1.4826 * mad)
    days = pd.DataFrame({"day": series.index, "actual": series.to_numpy(), "expected": np.square(np.clip(expected_root, 0, None)), "score": z})
    days["is_anomaly"] = np.abs(z) >= threshold
    days["direction"] = np.where(days["is_anomaly"], np.where(z > 0, "ALZA", "BAJA"), None)
    days["explanation"] = [explain(day) if flag else None for day, flag in zip(series.index, days["is_anomaly"])]

    # Evidencia frente a las fechas especiales sembradas con efecto fuerte.
    strong = calendar[SEEDED_STRONG].any(axis=1).to_numpy()
    seeded_days = days[strong]
    flagged = days[days["is_anomaly"]]
    unexplained = flagged[flagged["explanation"].isna()]
    return AnomaliesResult(
        metrics={
            "threshold": threshold,
            "anomalies": int(len(flagged)),
            "up": int((flagged["direction"] == "ALZA").sum()), "down": int((flagged["direction"] == "BAJA").sum()),
            "seeded_special_days": int(len(seeded_days)),
            "seeded_detected": int(seeded_days["is_anomaly"].sum()),
            "seeded_detail": [{"day": str(row.day.date()), "label": explain(row.day), "z": round(float(row.score), 2), "detected": bool(row.is_anomaly)} for row in seeded_days.itertuples()],
            "explained": int(len(flagged) - len(unexplained)),
            "unexplained_false_positives": int(len(unexplained)),
            "mad": round(mad, 4),
        },
        params={"model": "Huber (raíz cuadrada) con día de semana y nivel local (mediana móvil 29 días)", "z": "robusto (MAD)", "threshold": threshold},
        days=days, rows_used=len(series), data_from=series.index[0], data_to=series.index[-1], model=model,
    )

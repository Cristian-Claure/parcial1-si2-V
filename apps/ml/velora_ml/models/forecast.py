"""S1 · Pronóstico de venta neta diaria (regresión por empresa).

Validación walk-forward con ventana creciente: 3 pliegues de validación de 30 días (para elegir
modelo e hiperparámetros) y un pliegue final de 90 días como PRUEBA, que no se mira al ajustar.
Dentro de cada pliegue se pronostica de forma recursiva en bloques de 30 días (el horizonte real
del producto): el modelo solo conoce la historia verdadera hasta el inicio del bloque.
"""
from __future__ import annotations

import itertools
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.inspection import permutation_importance
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from ..calendar import SPECIAL_COLUMNS, calendar_flags
from .common import InsufficientData

RANDOM_STATE = 42
BLOCK = 30
VALIDATION_FOLDS = 3
TEST_DAYS = 90
MIN_TRAIN_DAYS = 120
LAGS = (1, 7, 14, 28)
CALENDAR = ["dow", "month", "day_of_month", "quincena", "month_end", *SPECIAL_COLUMNS]
FEATURES = [*CALENDAR, *(f"lag_{lag}" for lag in LAGS), "ma_7", "ma_28", "trend"]


def design(values: pd.Series, origin: pd.Timestamp) -> pd.DataFrame:
    """Variables por día a partir de la serie (los rezagos y promedios solo usan días anteriores)."""
    frame = calendar_flags(values.index)
    previous = values.shift(1)
    for lag in LAGS:
        frame[f"lag_{lag}"] = values.shift(lag)
    frame["ma_7"] = previous.rolling(7).mean()
    frame["ma_28"] = previous.rolling(28).mean()
    frame["trend"] = (values.index - origin).days.astype(float)
    return frame[FEATURES]


def make_model(kind: str, params: dict):
    if kind == "hgb":
        return HistGradientBoostingRegressor(random_state=RANDOM_STATE, **params)
    numeric = [column for column in FEATURES if column not in ("dow", "month")]
    prep = ColumnTransformer([
        ("calendar", OneHotEncoder(handle_unknown="ignore"), ["dow", "month"]),
        ("numeric", StandardScaler(), numeric),
    ])
    return Pipeline([("prep", prep), ("ridge", Ridge(**params))])


GRID: list[tuple[str, dict]] = [
    ("hgb", {"learning_rate": lr, "max_iter": it, "max_leaf_nodes": leaves, "l2_regularization": l2})
    for lr, it, leaves, l2 in itertools.product((0.03, 0.08), (150, 300), (7, 15), (0.0, 1.0))
] + [("ridge", {"alpha": alpha}) for alpha in (0.3, 3.0, 30.0, 300.0)]  # 16 + 4 = 20 combinaciones


def metrics(actual: np.ndarray, predicted: np.ndarray) -> dict[str, float]:
    error = actual - predicted
    denominator = np.abs(actual) + np.abs(predicted)
    smape = np.where(denominator == 0, 0.0, 2 * np.abs(error) / np.where(denominator == 0, 1, denominator))
    return {
        "mae": round(float(np.mean(np.abs(error))), 2),
        "rmse": round(float(np.sqrt(np.mean(error ** 2))), 2),
        "smape": round(float(100 * np.mean(smape)), 2),
    }


def fit(kind: str, params: dict, series: pd.Series, origin: pd.Timestamp):
    frame = design(series, origin).assign(target=series).dropna()
    model = make_model(kind, params)
    model.fit(frame[FEATURES], frame["target"])
    return model


def recursive(model, history: pd.Series, days: pd.DatetimeIndex, origin: pd.Timestamp) -> np.ndarray:
    """Pronóstico día a día: los rezagos futuros usan las propias predicciones."""
    extended = history.copy()
    out = []
    for day in days:
        extended.loc[day] = np.nan
        tail = extended.iloc[-(max(LAGS) + 2):]
        row = design(tail, origin).iloc[[-1]]
        value = max(0.0, float(model.predict(row)[0]))
        extended.loc[day] = value
        out.append(value)
    return np.array(out)


def baselines(history: pd.Series, days: pd.DatetimeIndex) -> dict[str, np.ndarray]:
    last_week = history.iloc[-7:].to_numpy()
    return {
        "naive": np.repeat(history.iloc[-1], len(days)),
        "seasonal_naive_7": np.array([last_week[index % 7] for index in range(len(days))]),
        "moving_average_28": np.repeat(history.iloc[-28:].mean(), len(days)),
    }


def evaluate_window(series: pd.Series, start: int, length: int, candidates: list[tuple[str, dict]], origin: pd.Timestamp):
    """Entrena con todo lo anterior a `start` y pronostica la ventana en bloques de 30 días."""
    train = series.iloc[:start]
    window = series.iloc[start:start + length]
    models = [fit(kind, params, train, origin) for kind, params in candidates]
    predictions = {index: [] for index in range(len(candidates))}
    base = {"naive": [], "seasonal_naive_7": [], "moving_average_28": []}
    for block_start in range(0, length, BLOCK):
        block_days = window.index[block_start:block_start + BLOCK]
        history = series.loc[: block_days[0] - pd.Timedelta(days=1)]
        for index, model in enumerate(models):
            predictions[index].append(recursive(model, history, block_days, origin))
        for name, values in baselines(history, block_days).items():
            base[name].append(values)
    return window, models, {i: np.concatenate(p) for i, p in predictions.items()}, {k: np.concatenate(v) for k, v in base.items()}


@dataclass
class ForecastResult:
    metrics: dict
    params: dict
    backtest: pd.DataFrame
    forecast: pd.DataFrame
    rows_used: int
    data_from: pd.Timestamp
    data_to: pd.Timestamp
    model: object = field(repr=False)


def train_forecast(series: pd.Series, horizon: int = 30) -> ForecastResult:
    series = series.astype(float).sort_index()
    needed = MIN_TRAIN_DAYS + VALIDATION_FOLDS * BLOCK + TEST_DAYS
    if len(series) < needed or (series > 0).sum() < needed * 0.6:
        raise InsufficientData(f"Se necesitan al menos {needed} días de ventas (hay {len(series)}, {(series > 0).sum()} con venta).")
    origin = series.index[0]
    test_start = len(series) - TEST_DAYS
    folds = [test_start - BLOCK * (VALIDATION_FOLDS - index) for index in range(VALIDATION_FOLDS)]

    # 1) Selección en validación (pliegues 1-3). La prueba no se usa aquí.
    validation_scores = {index: [] for index in range(len(GRID))}
    validation_residuals: dict[int, list[np.ndarray]] = {index: [] for index in range(len(GRID))}
    validation_baselines: dict[str, list[dict]] = {"naive": [], "seasonal_naive_7": [], "moving_average_28": []}
    fold_report = []
    for fold, start in enumerate(folds, start=1):
        window, _, predictions, base = evaluate_window(series, start, BLOCK, GRID, origin)
        actual = window.to_numpy()
        for index, predicted in predictions.items():
            validation_scores[index].append(metrics(actual, predicted)["mae"])
            validation_residuals[index].append(actual - predicted)
        for name, predicted in base.items():
            validation_baselines[name].append(metrics(actual, predicted))
        fold_report.append({"fold": fold, "from": str(window.index[0].date()), "to": str(window.index[-1].date()), "train_days": start})
    best = min(validation_scores, key=lambda index: (np.mean(validation_scores[index]), index))
    kind, params = GRID[best]
    best_ridge = min((i for i, (k, _) in enumerate(GRID) if k == "ridge"), key=lambda i: np.mean(validation_scores[i]))
    best_hgb = min((i for i, (k, _) in enumerate(GRID) if k == "hgb"), key=lambda i: np.mean(validation_scores[i]))

    # 2) Prueba final (90 días) con el modelo elegido, el mejor de la otra familia y las referencias.
    window, test_models, test_predictions, test_base = evaluate_window(series, test_start, TEST_DAYS, [GRID[best], GRID[best_hgb if kind == "ridge" else best_ridge]], origin)
    actual = window.to_numpy()
    residuals = np.concatenate(validation_residuals[best])
    q_low, q_high = np.quantile(residuals, [0.1, 0.9])
    chosen = test_predictions[0]
    lower, upper = np.maximum(0, chosen + q_low), chosen + q_high
    coverage = float(np.mean((actual >= lower) & (actual <= upper)))
    names = {"hgb": "HistGradientBoosting", "ridge": "Ridge (lineal regularizado)"}
    other_kind = GRID[best_hgb if kind == "ridge" else best_ridge][0]
    test_metrics = {
        "model": metrics(actual, chosen),
        "alternative": {"name": names[other_kind], **metrics(actual, test_predictions[1])},
        "baselines": {name: metrics(actual, predicted) for name, predicted in test_base.items()},
    }
    best_baseline = min(test_metrics["baselines"], key=lambda name: test_metrics["baselines"][name]["mae"])

    # 3) Importancia por permutación (en el último pliegue de validación, con rezagos reales).
    validation_model = fit(kind, params, series.iloc[: folds[-1]], origin)
    rows = design(series, origin).assign(target=series).iloc[folds[-1]:test_start].dropna()
    importance = permutation_importance(validation_model, rows[FEATURES], rows["target"], scoring="neg_mean_absolute_error", n_repeats=5, random_state=RANDOM_STATE)
    importances = sorted(({"feature": name, "importance": round(float(value), 3)} for name, value in zip(FEATURES, importance.importances_mean)), key=lambda item: -item["importance"])[:10]

    # 4) Modelo final con toda la historia y pronóstico a `horizon` días con bandas calibradas en validación.
    final = fit(kind, params, series, origin)
    future_days = pd.date_range(series.index[-1] + pd.Timedelta(days=1), periods=horizon, freq="D")
    future = recursive(final, series, future_days, origin)
    widen = np.sqrt(1 + np.arange(horizon) / BLOCK)  # la incertidumbre crece con el horizonte
    forecast = pd.DataFrame({"day": future_days, "predicted": future, "lower": np.maximum(0, future + q_low * widen), "upper": future + q_high * widen})
    backtest = pd.DataFrame({"day": window.index, "actual": actual, "predicted": chosen, "lower": lower, "upper": upper})

    return ForecastResult(
        metrics={
            "selected": {"name": names[kind], "params": params},
            "validation": {
                "model_mae": round(float(np.mean(validation_scores[best])), 2),
                "baselines_mae": {name: round(float(np.mean([m["mae"] for m in values])), 2) for name, values in validation_baselines.items()},
                "folds": fold_report,
            },
            "test": {**test_metrics, "from": str(window.index[0].date()), "to": str(window.index[-1].date()), "days": TEST_DAYS},
            "best_baseline": best_baseline,
            "beats_baselines": test_metrics["model"]["mae"] < test_metrics["baselines"][best_baseline]["mae"],
            "interval": {"nominal": 0.8, "coverage_test": round(coverage, 3)},
            "importances": importances,
            "grid_size": len(GRID),
        },
        params={"kind": kind, **params, "horizon": horizon, "test_days": TEST_DAYS, "validation_folds": VALIDATION_FOLDS},
        backtest=backtest, forecast=forecast, rows_used=len(series),
        data_from=series.index[0], data_to=series.index[-1], model=final,
    )

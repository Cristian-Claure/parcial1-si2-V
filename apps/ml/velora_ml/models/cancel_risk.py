"""S2 · Riesgo de cancelación de pedidos ECOMMERCE (clasificación binaria).

Momento de puntuación: la CREACIÓN del pedido en el checkout (el cliente ya eligió entrega y método
de pago). Solo se usan variables conocidas en ese instante; la consulta (`data.CANCEL_DATASET_SQL`)
no lee cancelled_at, fulfilled_at, fechas/estados de pago ni historiales. `label_status` es solo la
etiqueta: CANCELLED = 1, FULFILLED = 0; los RESERVED (abiertos) no entrenan, se puntúan.
"""
from __future__ import annotations

import itertools
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, brier_score_loss, confusion_matrix, f1_score, precision_score,
                             recall_score, roc_auc_score)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from .common import InsufficientData

RANDOM_STATE = 42
CATEGORICAL = ["fulfillment_type", "payment_method"]
NUMERIC = ["total", "discount", "n_lines", "units", "hour", "dow", "tenure_days", "prior_orders"]
FEATURES = CATEGORICAL + NUMERIC
LABEL = "label_status"
MIN_TRAIN = 300
MIN_POSITIVES = 20


def features(dataset: pd.DataFrame) -> pd.DataFrame:
    """Variables del momento de puntuación. Cualquier otra columna (etiqueta, fechas) se descarta."""
    frame = dataset[FEATURES].copy()
    frame["tenure_days"] = frame["tenure_days"].fillna(0.0)
    frame[CATEGORICAL] = frame[CATEGORICAL].fillna("NONE").astype(str)
    return frame


def _prep() -> ColumnTransformer:
    return ColumnTransformer([
        ("categorical", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL),
        ("numeric", StandardScaler(), NUMERIC),
    ])


def make_model(kind: str, params: dict) -> Pipeline:
    if kind == "logistic":
        return Pipeline([("prep", _prep()), ("model", LogisticRegression(class_weight="balanced", max_iter=2000, **params))])
    return Pipeline([("prep", _prep()), ("model", HistGradientBoostingClassifier(class_weight="balanced", random_state=RANDOM_STATE, **params))])


GRID = [("hgb", {"learning_rate": lr, "max_iter": it, "max_leaf_nodes": leaves, "min_samples_leaf": leaf})
        for lr, it, leaves, leaf in itertools.product((0.05, 0.1), (100, 250), (7, 15), (20, 60))]  # 16
LOGISTIC_GRID = [("logistic", {"C": c}) for c in (0.1, 1.0, 10.0)]  # + 3 = 19


def classification_metrics(y: np.ndarray, probability: np.ndarray, threshold: float) -> dict:
    predicted = (probability >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, predicted, labels=[0, 1]).ravel()
    single_class = len(np.unique(y)) < 2
    return {
        "roc_auc": None if single_class else round(float(roc_auc_score(y, probability)), 3),
        "pr_auc": None if single_class else round(float(average_precision_score(y, probability)), 3),
        "precision": round(float(precision_score(y, predicted, zero_division=0)), 3),
        "recall": round(float(recall_score(y, predicted, zero_division=0)), 3),
        "f1": round(float(f1_score(y, predicted, zero_division=0)), 3),
        "brier": round(float(brier_score_loss(y, probability)), 4),
        "threshold": round(float(threshold), 3),
        "confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
    }


def best_threshold(y: np.ndarray, probability: np.ndarray) -> float:
    """Umbral que maximiza F1 en VALIDACIÓN (nunca en prueba)."""
    candidates = np.unique(np.quantile(probability, np.linspace(0.5, 0.99, 50)))
    scores = [f1_score(y, (probability >= threshold).astype(int), zero_division=0) for threshold in candidates]
    return float(candidates[int(np.argmax(scores))]) if len(candidates) else 0.5


class PlattCalibrated:
    """Iteración declarada (Parte B): calibración de Platt (sigmoide) ajustada en la VALIDACIÓN temporal.

    Los pesos de clase "balanced" inflan las probabilidades (Brier alto). La sigmoide es monótona, así que
    no cambia el orden (ROC-AUC y PR-AUC iguales): solo vuelve interpretables las probabilidades.
    """

    def __init__(self, base, calibrator: LogisticRegression):
        self.base = base
        self.calibrator = calibrator
        self.classes_ = getattr(base, "classes_", np.array([0, 1]))

    @staticmethod
    def _logit(probability: np.ndarray) -> np.ndarray:
        clipped = np.clip(np.asarray(probability, dtype=float), 1e-6, 1 - 1e-6)
        return np.log(clipped / (1 - clipped)).reshape(-1, 1)

    @classmethod
    def fit(cls, base, raw_validation: np.ndarray, y_validation: np.ndarray) -> "PlattCalibrated":
        calibrator = LogisticRegression(C=1e6, max_iter=1000).fit(cls._logit(raw_validation), y_validation)
        return cls(base, calibrator)

    def map(self, probability: np.ndarray) -> np.ndarray:
        return self.calibrator.predict_proba(self._logit(probability))[:, 1]

    def predict_proba(self, X) -> np.ndarray:
        calibrated = self.map(self.base.predict_proba(X)[:, 1])
        return np.column_stack([1 - calibrated, calibrated])


@dataclass
class CancelRiskResult:
    metrics: dict
    params: dict
    scored: pd.DataFrame
    rows_used: int
    data_from: pd.Timestamp
    data_to: pd.Timestamp
    model: object = field(repr=False)


def train_cancel_risk(dataset: pd.DataFrame) -> CancelRiskResult:
    dataset = dataset.sort_values(["created_at", "order_id"]).reset_index(drop=True)
    labeled = dataset[dataset[LABEL].isin(["CANCELLED", "FULFILLED"])].reset_index(drop=True)
    y_all = (labeled[LABEL] == "CANCELLED").astype(int).to_numpy()
    if len(labeled) < MIN_TRAIN or y_all.sum() < MIN_POSITIVES:
        raise InsufficientData(f"Se necesitan al menos {MIN_TRAIN} pedidos online cerrados y {MIN_POSITIVES} cancelados (hay {len(labeled)} y {int(y_all.sum())}).")

    # Partición temporal: 80 % inicial entrena, 20 % final prueba. Dentro del entrenamiento, el último
    # 20 % es validación para elegir hiperparámetros y umbral.
    cut = int(len(labeled) * 0.8)
    inner = int(cut * 0.8)
    X = features(labeled)
    X_fit, y_fit = X.iloc[:inner], y_all[:inner]
    X_val, y_val = X.iloc[inner:cut], y_all[inner:cut]
    X_train, y_train = X.iloc[:cut], y_all[:cut]
    X_test, y_test = X.iloc[cut:], y_all[cut:]

    def validation_auc(kind: str, params: dict) -> float:
        model = make_model(kind, params).fit(X_fit, y_fit)
        probability = model.predict_proba(X_val)[:, 1]
        return float(average_precision_score(y_val, probability)) if y_val.sum() else 0.0

    scores = {index: validation_auc(kind, params) for index, (kind, params) in enumerate(GRID + LOGISTIC_GRID)}
    candidates = GRID + LOGISTIC_GRID
    best_hgb = max(range(len(GRID)), key=lambda index: (scores[index], -index))
    best_logistic = max(range(len(GRID), len(candidates)), key=lambda index: (scores[index], -index))

    calibration: dict = {}

    def finalize(index: int) -> tuple[object, float, dict]:
        kind, params = candidates[index]
        validation_model = make_model(kind, params).fit(X_fit, y_fit)
        raw_validation = validation_model.predict_proba(X_val)[:, 1]
        model = make_model(kind, params).fit(X_train, y_train)
        raw_test = model.predict_proba(X_test)[:, 1]
        if y_val.sum() == 0 or y_val.sum() == len(y_val):
            threshold = best_threshold(y_val, raw_validation)
            return model, threshold, classification_metrics(y_test, raw_test, threshold)
        # Calibración en validación; el umbral (máx. F1 en validación) se elige ya en escala calibrada.
        calibrated = PlattCalibrated.fit(model, raw_validation, y_val)
        threshold = best_threshold(y_val, calibrated.map(raw_validation))
        metrics = classification_metrics(y_test, calibrated.map(raw_test), threshold)
        calibration[index] = {"brier_uncalibrated": round(float(brier_score_loss(y_test, raw_test)), 4), "brier_calibrated": metrics["brier"]}
        return calibrated, threshold, metrics

    hgb_model, hgb_threshold, hgb_test = finalize(best_hgb)
    logistic_model, logistic_threshold, logistic_test = finalize(best_logistic)
    prevalence = float(y_train.mean())
    majority = classification_metrics(y_test, np.full(len(y_test), prevalence), 1.1)  # siempre "no cancela"
    majority["roc_auc"], majority["pr_auc"] = 0.5, round(float(y_test.mean()), 3)

    # El candidato (gradient boosting) se publica si no es peor que la logística en PR-AUC de validación.
    use_hgb = scores[best_hgb] >= scores[best_logistic]
    model, threshold, test = (hgb_model, hgb_threshold, hgb_test) if use_hgb else (logistic_model, logistic_threshold, logistic_test)
    # La sigmoide no cambia el orden: la importancia se mide sobre el modelo base.
    importance = permutation_importance(getattr(model, "base", model), X_test, y_test, scoring="roc_auc", n_repeats=5, random_state=RANDOM_STATE)
    importances = sorted(({"feature": name, "importance": round(float(value), 4)} for name, value in zip(FEATURES, importance.importances_mean)), key=lambda item: -item["importance"])

    # Pedidos abiertos (RESERVED): se puntúan con el modelo elegido.
    open_orders = dataset[dataset[LABEL] == "RESERVED"].copy()
    if len(open_orders):
        probability = model.predict_proba(features(open_orders))[:, 1]
        open_orders["probability"] = probability
        high, medium = threshold, threshold * 0.6
        open_orders["risk_level"] = np.where(probability >= high, "ALTO", np.where(probability >= medium, "MEDIO", "BAJO"))
    scored = open_orders.sort_values("probability", ascending=False) if len(open_orders) else open_orders.assign(probability=[], risk_level=[])

    rates = labeled.assign(y=y_all).groupby("fulfillment_type")["y"].mean().round(3).to_dict()
    selected_kind, selected_params = candidates[best_hgb if use_hgb else best_logistic]
    return CancelRiskResult(
        metrics={
            "selected": {"name": "HistGradientBoosting" if use_hgb else "Regresión logística", "params": selected_params},
            "scoring_moment": "Creación del pedido en el checkout (entrega y método de pago ya elegidos).",
            "split": {"train": cut, "validation": cut - inner, "test": len(labeled) - cut, "train_until": str(labeled["created_at"].iloc[cut - 1]), "test_from": str(labeled["created_at"].iloc[cut])},
            "prevalence": {"train": round(prevalence, 3), "test": round(float(y_test.mean()), 3)},
            "test": {"model": test, "logistic": logistic_test, "gradient_boosting": hgb_test, "majority": majority},
            "validation_pr_auc": {"gradient_boosting": round(scores[best_hgb], 3), "logistic": round(scores[best_logistic], 3)},
            "beats_baselines": (test["roc_auc"] or 0) > 0.5 and (test["pr_auc"] or 0) > majority["pr_auc"],
            "importances": importances,
            "cancel_rate_by_fulfillment": rates,
            "open_orders": int(len(open_orders)),
            "grid_size": len(candidates),
            "calibration": {"method": "Platt (sigmoide) ajustada en validación temporal", **calibration.get(best_hgb if use_hgb else best_logistic, {})},
        },
        params={"kind": selected_kind, **selected_params, "threshold": threshold, "class_weight": "balanced", "calibration": "platt"},
        scored=scored, rows_used=len(labeled),
        data_from=pd.Timestamp(labeled["created_at"].iloc[0]), data_to=pd.Timestamp(labeled["created_at"].iloc[-1]), model=model,
    )

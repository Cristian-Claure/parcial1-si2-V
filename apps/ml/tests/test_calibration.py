"""Iteración declarada (Parte B): la calibración de Platt no cambia el orden y mejora el Brier."""
import numpy as np
from sklearn.metrics import brier_score_loss, roc_auc_score

from velora_ml.models.cancel_risk import PlattCalibrated


class _Inflated:
    """Modelo con probabilidades infladas (como los pesos de clase "balanced")."""

    classes_ = np.array([0, 1])

    def predict_proba(self, X):
        p = np.clip(0.35 + 0.5 * np.asarray(X)[:, 0], 0.01, 0.99)
        return np.column_stack([1 - p, p])


def test_platt_keeps_order_and_lowers_brier():
    rng = np.random.default_rng(7)
    X = rng.random((2000, 1))
    y = (rng.random(2000) < 0.04 + 0.12 * X[:, 0]).astype(int)
    base = _Inflated()
    raw = base.predict_proba(X)[:, 1]
    calibrated = PlattCalibrated.fit(base, raw[:1000], y[:1000])
    test = calibrated.predict_proba(X[1000:])[:, 1]
    assert np.all(np.diff(calibrated.map(np.linspace(0.05, 0.95, 20))) > 0)
    assert abs(roc_auc_score(y[1000:], test) - roc_auc_score(y[1000:], raw[1000:])) < 1e-9
    assert brier_score_loss(y[1000:], test) < brier_score_loss(y[1000:], raw[1000:])

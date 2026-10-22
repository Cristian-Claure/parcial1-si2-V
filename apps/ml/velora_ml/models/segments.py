"""U1 · Segmentos de clientes (no supervisado) con RFM a una fecha de corte.

R = días desde la última compra pagada, F = pedidos pagados, M = importe cobrado (sin reembolsos).
Transformación log1p + estandarización, KMeans con k entre 2 y 8 elegido por silhouette (con estabilidad
mínima entre semillas) y el codo como referencia. Proyección PCA a 2D para el gráfico.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.preprocessing import StandardScaler

from .common import InsufficientData

RANDOM_STATE = 42
SEEDS = (0, 1, 2, 3, 4)
K_RANGE = range(2, 9)
MIN_STABILITY = 0.8
SILHOUETTE_TOLERANCE = 0.9
MIN_CUSTOMERS = 40


def rfm(raw: pd.DataFrame, cutoff: pd.Timestamp) -> pd.DataFrame:
    frame = raw.copy()
    last = pd.to_datetime(frame["last_paid"], utc=True)
    frame["recency_days"] = ((cutoff - last).dt.total_seconds() // 86400).astype(int).clip(lower=0)
    frame["frequency"] = frame["frequency"].astype(int)
    frame["monetary"] = frame["monetary"].astype(float).clip(lower=0)
    return frame


def choose_k(matrix: np.ndarray) -> tuple[int, list[dict]]:
    """k entre los estables (ARI medio entre semillas ≥ 0,8): codo si su silhouette es ≥ 90 % de la mejor; si no, la mejor."""
    report = []
    for k in K_RANGE:
        labelings = [KMeans(n_clusters=k, n_init=10, random_state=seed).fit(matrix) for seed in SEEDS]
        stability = float(np.mean([adjusted_rand_score(a.labels_, b.labels_) for a, b in combinations(labelings, 2)]))
        report.append({"k": k, "silhouette": round(float(silhouette_score(matrix, labelings[0].labels_)), 4),
                       "inertia": round(float(labelings[0].inertia_), 2), "stability": round(stability, 4)})
    # Codo: mayor segunda diferencia de la inercia (solo informativo).
    inertia = np.array([row["inertia"] for row in report])
    elbow = int(K_RANGE[int(np.argmax(np.diff(inertia, 2))) + 1]) if len(inertia) >= 3 else K_RANGE[0]
    for row in report:
        row["elbow"] = row["k"] == elbow
    stable = [row for row in report if row["stability"] >= MIN_STABILITY] or report
    best = max(stable, key=lambda row: (row["silhouette"], -row["k"]))
    # Regla fijada antes de mirar la comparación con lo sembrado: el k del codo si es estable y su
    # silhouette está dentro del 10 % de la mejor (más detalle sin perder cohesión); si no, la mejor.
    at_elbow = next((row for row in stable if row["elbow"]), None)
    if at_elbow and at_elbow["silhouette"] >= SILHOUETTE_TOLERANCE * best["silhouette"]:
        return at_elbow["k"], report
    return best["k"], report


def name_segments(profile: pd.DataFrame, overall: pd.DataFrame) -> dict[int, str]:
    """Reglas explícitas sobre el perfil medio de cada segmento frente a la mediana general:
    - "Una sola compra": la mediana de F del segmento es 1.
    - "En riesgo": F ≥ 2 y recencia media > 1,5 × la recencia mediana general.
    - "Leales": F media ≥ 1,5 × F mediana general y M media ≥ M mediana general.
    - "Ocasionales": el resto.
    Si dos segmentos reciben el mismo nombre se distinguen por valor (alto/bajo)."""
    median_r, median_f, median_m = overall["recency_days"].median(), overall["frequency"].median(), overall["monetary"].median()
    names: dict[int, str] = {}
    for segment, row in profile.iterrows():
        if row["frequency_median"] <= 1:
            names[segment] = "Una sola compra"
        elif row["recency_days"] > 1.5 * median_r:
            names[segment] = "En riesgo"
        elif row["frequency"] >= 1.5 * max(median_f, 1) and row["monetary"] >= median_m:
            names[segment] = "Leales"
        else:
            names[segment] = "Ocasionales"
    for name in set(names.values()):
        same = [segment for segment, value in names.items() if value == name]
        if len(same) > 1:
            ordered = sorted(same, key=lambda segment: -profile.loc[segment, "monetary"])
            for rank, segment in enumerate(ordered):
                names[segment] = f"{name} · {'alto valor' if rank == 0 else 'valor medio' if rank < len(ordered) - 1 else 'bajo valor'}"
    return names


def seeded_comparison(frame: pd.DataFrame, labels_path: Path, company_slug: str | None) -> dict | None:
    """ARI frente a las etiquetas que sembró el generador (si el archivo local existe)."""
    if not labels_path.exists() or not company_slug:
        return None
    saved = json.loads(labels_path.read_text(encoding="utf-8"))
    seeded: dict[str, str] = {}
    for tenant in saved.get("tenants", {}).values():
        for slug, company in tenant.get("companies", {}).items():
            if slug == company_slug:
                seeded.update({customer["email"].lower(): customer["segment"] for customer in company.get("customers", []) if customer.get("email")})
    matched = frame[frame["email"].str.lower().isin(seeded)] if "email" in frame else frame.iloc[0:0]
    if len(matched) < MIN_CUSTOMERS:
        return None
    truth = matched["email"].str.lower().map(seeded)
    table = pd.crosstab(matched["segment_name"], truth)
    return {"ari": round(float(adjusted_rand_score(truth, matched["segment"])), 3), "matched": int(len(matched)),
            "crosstab": {row: {col: int(table.loc[row, col]) for col in table.columns} for row in table.index}}


@dataclass
class SegmentsResult:
    metrics: dict
    params: dict
    customers: pd.DataFrame
    rows_used: int
    model: object = field(repr=False)
    data_from: pd.Timestamp | None = None
    data_to: pd.Timestamp | None = None


def train_segments(raw: pd.DataFrame, cutoff: pd.Timestamp, labels_path: Path | None = None, company_slug: str | None = None) -> SegmentsResult:
    if len(raw) < MIN_CUSTOMERS:
        raise InsufficientData(f"Se necesitan al menos {MIN_CUSTOMERS} clientes con compras pagadas (hay {len(raw)}).")
    frame = rfm(raw, cutoff).sort_values("customer_id").reset_index(drop=True)
    columns = ["recency_days", "frequency", "monetary"]
    scaler = StandardScaler()
    matrix = scaler.fit_transform(np.log1p(frame[columns].to_numpy(dtype=float)))
    k, k_report = choose_k(matrix)
    model = KMeans(n_clusters=k, n_init=10, random_state=RANDOM_STATE).fit(matrix)
    frame["segment"] = model.labels_
    coords = PCA(n_components=2, random_state=RANDOM_STATE).fit(matrix)
    projected = coords.transform(matrix)
    frame["pc1"], frame["pc2"] = projected[:, 0], projected[:, 1]

    revenue = frame["monetary"].sum() or 1.0
    grouped = frame.groupby("segment")
    profile = grouped[columns].mean()
    profile["frequency_median"] = grouped["frequency"].median()
    names = name_segments(profile, frame)
    frame["segment_name"] = frame["segment"].map(names)
    profiles = [{
        "segment": int(segment), "name": names[segment], "customers": int(len(group)),
        "share_customers": round(len(group) / len(frame), 3),
        "recency_days": round(float(group["recency_days"].mean()), 1), "frequency": round(float(group["frequency"].mean()), 2),
        "monetary": round(float(group["monetary"].mean()), 2), "revenue_share": round(float(group["monetary"].sum() / revenue), 3),
    } for segment, group in grouped]
    profiles.sort(key=lambda item: -item["revenue_share"])
    comparison = seeded_comparison(frame, labels_path, company_slug) if labels_path else None
    return SegmentsResult(
        metrics={
            "k": k, "k_selection": k_report, "silhouette": next(row["silhouette"] for row in k_report if row["k"] == k),
            "pca_explained": [round(float(value), 3) for value in coords.explained_variance_ratio_],
            "profiles": profiles, "cutoff": str(cutoff.date()), "seeded_comparison": comparison,
            "naming_rules": name_segments.__doc__.split("\n", 1)[1].strip(),
        },
        params={"k_range": [K_RANGE.start, K_RANGE.stop - 1], "seeds": list(SEEDS), "min_stability": MIN_STABILITY, "transform": "log1p + StandardScaler"},
        customers=frame, rows_used=len(frame), model={"kmeans": model, "scaler": scaler, "pca": coords},
        data_from=pd.Timestamp(pd.to_datetime(raw["last_paid"], utc=True).min()), data_to=cutoff,
    )

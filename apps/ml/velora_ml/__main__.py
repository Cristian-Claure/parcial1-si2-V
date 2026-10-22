"""CLI del servicio ML.

    python -m velora_ml train --company urbano-boutique [--models SALES_FORECAST CANCEL_RISK]
    python -m velora_ml serve
"""
from __future__ import annotations

import argparse
import json
import sys
import time

from .config import MODEL_KEYS, load_settings
from .db import connect
from . import data


def _summary_line(model: str, outcome: dict) -> str:
    if outcome["status"] != "SUCCEEDED":
        return f"  {model:<18} {outcome['status']}: {outcome.get('error', '')[:160]}"
    m = outcome["metrics"]
    if model == "SALES_FORECAST":
        test = m["test"]
        base = test["baselines"][m["best_baseline"]]
        return f"  {model:<18} {m['selected']['name']}: MAE {test['model']['mae']} · sMAPE {test['model']['smape']} | mejor referencia ({m['best_baseline']}) MAE {base['mae']} · sMAPE {base['smape']}"
    if model == "CANCEL_RISK":
        t = m["test"]
        return f"  {model:<18} {m['selected']['name']}: ROC-AUC {t['model']['roc_auc']} · PR-AUC {t['model']['pr_auc']} · F1 {t['model']['f1']} | logística {t['logistic']['roc_auc']}/{t['logistic']['pr_auc']} · mayoritaria 0.5/{t['majority']['pr_auc']}"
    if model == "CUSTOMER_SEGMENTS":
        seeded = m.get("seeded_comparison") or {}
        return f"  {model:<18} k={m['k']} · silhouette {m['silhouette']} · ARI vs sembrado {seeded.get('ari', 'n/d')} · {', '.join(p['name'] for p in m['profiles'])}"
    return f"  {model:<18} {m['anomalies']} anomalías · fechas sembradas detectadas {m['seeded_detected']}/{m['seeded_special_days']} · sin explicación {m['unexplained_false_positives']}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="velora_ml")
    sub = parser.add_subparsers(dest="command", required=True)
    train = sub.add_parser("train", help="Entrena los modelos de una empresa")
    train.add_argument("--company", required=True, help="id o slug de la empresa")
    train.add_argument("--models", nargs="*", default=list(MODEL_KEYS), choices=MODEL_KEYS)
    sub.add_parser("serve", help="API local en 127.0.0.1:8090")
    args = parser.parse_args(argv)
    settings = load_settings()

    if args.command == "serve":
        import uvicorn
        uvicorn.run("velora_ml.api:app", host=settings.host, port=settings.port, log_level="info", workers=1)
        return 0

    from .runner import TRAINING_LOCK, create_runs, run_models
    with connect(settings.database_url) as connection:
        company = data.company_lookup(connection, args.company)
    if not company:
        print(f"Empresa no encontrada: {args.company}", file=sys.stderr)
        return 1
    runs = create_runs(settings, company["id"], args.models)
    print(f"Entrenando {company['name']} ({len(runs)} modelos)…")
    started = time.time()
    with TRAINING_LOCK:
        summary = run_models(settings, company["id"], runs)
    for model, outcome in summary.items():
        print(_summary_line(model, outcome))
    print(f"Listo en {time.time() - started:.0f} s. Corridas: {json.dumps(runs)}")
    return 0 if all(outcome["status"] != "FAILED" for outcome in summary.values()) else 1


if __name__ == "__main__":
    sys.exit(main())

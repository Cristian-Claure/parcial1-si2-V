"""API local del servicio ML (FastAPI en 127.0.0.1:8090). Solo la llama el backend, con token interno.

- GET  /health            → estado (sin token; no revela datos).
- POST /train             → 202; entrena en segundo plano las corridas QUEUED indicadas. 409 si ya hay
                            un entrenamiento en curso (uno a la vez); 400 si las corridas no son de la empresa.
- GET  /status            → entrenamiento en curso.
"""
from __future__ import annotations

import hmac
import threading
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .config import MODEL_KEYS, load_settings
from .db import connect
from .runner import CURRENT, TRAINING_LOCK, run_models

settings = load_settings()
app = FastAPI(title="VÉLORA ML", version="1.0.0", docs_url=None, redoc_url=None)


class TrainRequest(BaseModel):
    companyId: str = Field(pattern=r"^[0-9a-fA-F-]{36}$")
    runs: dict[str, str]


def _authorize(token: str | None) -> None:
    if not settings.token:
        raise HTTPException(503, "VELORA_ML_TOKEN no está configurado en el servicio ML.")
    if not token or not hmac.compare_digest(token, settings.token):
        raise HTTPException(401, "Token interno inválido.")


@app.get("/health")
def health() -> dict:
    return {"status": "UP", "busy": TRAINING_LOCK.locked(), "models": list(MODEL_KEYS)}


@app.get("/status")
def status(x_velora_ml_token: Annotated[str | None, Header()] = None) -> dict:
    _authorize(x_velora_ml_token)
    return {"busy": TRAINING_LOCK.locked(), "current": dict(CURRENT) or None}


@app.post("/train", status_code=202)
def train(request: TrainRequest, x_velora_ml_token: Annotated[str | None, Header()] = None) -> dict:
    _authorize(x_velora_ml_token)
    unknown = [key for key in request.runs if key not in MODEL_KEYS]
    if unknown or not request.runs:
        raise HTTPException(400, f"Modelos desconocidos: {unknown}")
    # Las corridas deben existir, estar en cola y pertenecer a la empresa indicada.
    with connect(settings.database_url) as connection, connection.cursor() as cursor:
        cursor.execute("select id::text, model_key from ml_runs where company_id = %(company_id)s and status = 'QUEUED' and id::text = any(%(ids)s)",
                       {"company_id": request.companyId, "ids": list(request.runs.values())})
        found = {row[0]: row[1] for row in cursor.fetchall()}
    if any(found.get(run_id) != model for model, run_id in request.runs.items()):
        raise HTTPException(400, "Las corridas no existen, no están en cola o no pertenecen a la empresa.")
    if not TRAINING_LOCK.acquire(blocking=False):
        raise HTTPException(409, "Ya hay un entrenamiento en curso.")

    def work() -> None:
        try:
            run_models(settings, request.companyId, request.runs)
        finally:
            TRAINING_LOCK.release()

    threading.Thread(target=work, name="velora-ml-train", daemon=True).start()
    return {"accepted": True, "runs": request.runs}

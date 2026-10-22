"""Configuración del servicio ML: lee el entorno y, si falta, el `.env` de la raíz (sin imprimir valores)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = ML_ROOT.parent.parent

MODEL_KEYS = ("SALES_FORECAST", "CANCEL_RISK", "CUSTOMER_SEGMENTS", "SALES_ANOMALIES")
BUSINESS_TZ = "America/La_Paz"


def _file_env() -> dict[str, str]:
    path = REPO_ROOT / ".env"
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"')
    return values


@dataclass(frozen=True)
class Settings:
    database_url: str
    token: str
    host: str
    port: int
    artifacts_dir: Path
    keep_runs: int
    seed_labels: Path


def load_settings() -> Settings:
    file_env = _file_env()

    def env(name: str, default: str = "") -> str:
        return os.environ.get(name, "").strip() or file_env.get(name, default)

    # Rol de mínimo privilegio si existe (pnpm ml:db-role); si no, la URL general.
    database_url = env("VELORA_ML_DATABASE_URL") or env("DATABASE_URL")
    return Settings(
        database_url=database_url,
        token=env("VELORA_ML_TOKEN"),
        host="127.0.0.1",
        port=int(env("VELORA_ML_PORT", "8090")),
        artifacts_dir=Path(env("VELORA_ML_ARTIFACTS_DIR", str(ML_ROOT / "artifacts"))),
        keep_runs=int(env("VELORA_ML_KEEP_RUNS", "5")),
        seed_labels=Path(env("VELORA_ML_SEED_LABELS", str(REPO_ROOT / "scripts" / ".seed-progress" / "seed-20251001-all.json"))),
    )

from __future__ import annotations

import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import httpx

from ..settings import settings
from .models import TryOnImage, TryOnJob, TryOnJobStatus


class TryOnProviderError(RuntimeError):
    pass


@dataclass(frozen=True)
class TryOnProviderStatus:
    name: str
    configured: bool
    model: str
    mode: str


class TryOnProvider(Protocol):
    def status(self) -> TryOnProviderStatus:
        ...

    def submit(
        self,
        *,
        person: TryOnImage,
        garment: TryOnImage,
        category: str,
    ) -> TryOnJob:
        ...

    def get(self, job_id: str) -> TryOnJob:
        ...

    def cancel(self, job_id: str) -> TryOnJob:
        ...


class ReplicateTryOnProvider:
    NAME = "replicate"

    def status(self) -> TryOnProviderStatus:
        return TryOnProviderStatus(
            name=self.NAME,
            configured=bool(
                settings.replicate_api_token.strip()
                and settings.velora_tryon_replicate_model.strip()
            ),
            model=(
                settings.velora_tryon_replicate_model.strip()
                or "not-selected"
            ),
            mode="cloud",
        )

    def submit(
        self,
        *,
        person: TryOnImage,
        garment: TryOnImage,
        category: str,
    ) -> TryOnJob:
        self._require_configured()
        client = self._client()

        with tempfile.TemporaryDirectory(
            prefix="velora_tryon_replicate_"
        ) as temp_dir:
            root = Path(temp_dir)
            person_path = root / self._safe_filename(
                person.filename,
                "person",
                person.content_type,
            )
            garment_path = root / self._safe_filename(
                garment.filename,
                "garment",
                garment.content_type,
            )

            person_path.write_bytes(person.content)
            garment_path.write_bytes(garment.content)

            try:
                with (
                    person_path.open("rb") as person_file,
                    garment_path.open("rb") as garment_file,
                ):
                    prediction = client.predictions.create(
                        model=settings.velora_tryon_replicate_model.strip(),
                        input={
                            "person_image": person_file,
                            "garment_images": [garment_file],
                            "prompt": "",
                            "output_format": "jpg",
                            "output_quality": 95,
                            "preserve_input_size": True,
                        },
                    )
            except Exception as exc:
                raise TryOnProviderError(
                    "Replicate no pudo crear la generación."
                ) from exc

        return self._prediction_to_job(prediction)

    def get(self, job_id: str) -> TryOnJob:
        self._require_configured()

        try:
            prediction = self._client().predictions.get(
                self._require_job_id(job_id)
            )
        except Exception as exc:
            raise TryOnProviderError(
                "Replicate no pudo consultar la generación."
            ) from exc

        return self._prediction_to_job(prediction)

    def cancel(self, job_id: str) -> TryOnJob:
        self._require_configured()

        try:
            prediction = self._client().predictions.get(
                self._require_job_id(job_id)
            )
            prediction.cancel()
            prediction.reload()
        except Exception as exc:
            raise TryOnProviderError(
                "Replicate no pudo cancelar la generación."
            ) from exc

        return self._prediction_to_job(prediction)

    def _client(self):
        try:
            from replicate.client import Client
        except ImportError as exc:
            raise TryOnProviderError(
                "La dependencia replicate no está instalada."
            ) from exc

        return Client(
            api_token=settings.replicate_api_token.strip()
        )

    def _require_configured(self) -> None:
        if not self.status().configured:
            raise TryOnProviderError(
                "Replicate no está configurado."
            )

    def _prediction_to_job(self, prediction) -> TryOnJob:
        status = normalize_job_status(
            str(getattr(prediction, "status", ""))
        )
        result_url = None

        if status == TryOnJobStatus.SUCCEEDED:
            result_url = _output_url(
                getattr(prediction, "output", None)
            )

        metrics = getattr(prediction, "metrics", None)
        duration_ms = _duration_ms(metrics)

        error = getattr(prediction, "error", None)
        error_text = (
            str(error).strip()
            if error is not None and str(error).strip()
            else None
        )

        return TryOnJob(
            provider=self.NAME,
            job_id=str(getattr(prediction, "id")),
            status=status,
            result_url=result_url,
            error=error_text,
            duration_ms=duration_ms,
        )

    def _safe_filename(
        self,
        original: str,
        fallback: str,
        content_type: str,
    ) -> str:
        extension = {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/webp": ".webp",
        }.get(content_type, ".bin")

        candidate = Path(original or "").name.strip()

        if not candidate:
            return fallback + extension

        stem = Path(candidate).stem[:80] or fallback
        return stem + extension

    def _require_job_id(self, value: str) -> str:
        normalized = value.strip()

        if not normalized:
            raise TryOnProviderError(
                "El identificador de generación es obligatorio."
            )

        return normalized


class LocalTryOnProvider:
    NAME = "local"

    def status(self) -> TryOnProviderStatus:
        return TryOnProviderStatus(
            name=self.NAME,
            configured=bool(
                settings.velora_tryon_local_url.strip()
                and settings.velora_tryon_local_model.strip()
            ),
            model=(
                settings.velora_tryon_local_model.strip()
                or "not-selected"
            ),
            mode="self-hosted",
        )

    def submit(
        self,
        *,
        person: TryOnImage,
        garment: TryOnImage,
        category: str,
    ) -> TryOnJob:
        self._require_configured()

        try:
            response = httpx.post(
                self._url("/jobs"),
                data={
                    "category": category,
                    "model": settings.velora_tryon_local_model.strip(),
                },
                files={
                    "person": (
                        person.filename,
                        person.content,
                        person.content_type,
                    ),
                    "garment": (
                        garment.filename,
                        garment.content,
                        garment.content_type,
                    ),
                },
                timeout=settings.velora_tryon_provider_timeout_seconds,
            )
            response.raise_for_status()
        except Exception as exc:
            raise TryOnProviderError(
                "El proveedor LOCAL no pudo crear la generación."
            ) from exc

        return self._payload_to_job(response.json())

    def get(self, job_id: str) -> TryOnJob:
        self._require_configured()

        try:
            response = httpx.get(
                self._url(
                    "/jobs/"
                    + self._require_job_id(job_id)
                ),
                timeout=settings.velora_tryon_provider_timeout_seconds,
            )
            response.raise_for_status()
        except Exception as exc:
            raise TryOnProviderError(
                "El proveedor LOCAL no pudo consultar la generación."
            ) from exc

        return self._payload_to_job(response.json())

    def cancel(self, job_id: str) -> TryOnJob:
        self._require_configured()

        try:
            response = httpx.delete(
                self._url(
                    "/jobs/"
                    + self._require_job_id(job_id)
                ),
                timeout=settings.velora_tryon_provider_timeout_seconds,
            )
            response.raise_for_status()
        except Exception as exc:
            raise TryOnProviderError(
                "El proveedor LOCAL no pudo cancelar la generación."
            ) from exc

        return self._payload_to_job(response.json())

    def _payload_to_job(
        self,
        payload: dict[str, object],
    ) -> TryOnJob:
        job_id = str(
            payload.get("jobId")
            or payload.get("id")
            or ""
        ).strip()

        if not job_id:
            raise TryOnProviderError(
                "El proveedor LOCAL devolvió un job sin identificador."
            )

        return TryOnJob(
            provider=self.NAME,
            job_id=job_id,
            status=normalize_job_status(
                str(payload.get("status") or "")
            ),
            result_url=_optional_text(
                payload.get("resultUrl")
                or payload.get("result_url")
            ),
            error=_optional_text(payload.get("error")),
            duration_ms=_optional_int(
                payload.get("durationMs")
                or payload.get("duration_ms")
            ),
        )

    def _url(self, path: str) -> str:
        return (
            settings.velora_tryon_local_url
            .strip()
            .rstrip("/")
            + path
        )

    def _require_configured(self) -> None:
        if not self.status().configured:
            raise TryOnProviderError(
                "El proveedor LOCAL no está configurado."
            )

    def _require_job_id(self, value: str) -> str:
        normalized = value.strip()

        if not normalized:
            raise TryOnProviderError(
                "El identificador de generación es obligatorio."
            )

        return normalized


def provider_for(name: str) -> TryOnProvider:
    normalized = (name or "").strip().lower()

    if normalized == LocalTryOnProvider.NAME:
        return LocalTryOnProvider()

    if normalized == ReplicateTryOnProvider.NAME:
        return ReplicateTryOnProvider()

    raise TryOnProviderError(
        "Proveedor de Try-On no soportado. Use LOCAL o REPLICATE."
    )


def normalize_job_status(value: str) -> TryOnJobStatus:
    normalized = (value or "").strip().lower()

    if normalized in {"starting", "queued", "pending"}:
        return TryOnJobStatus.QUEUED

    if normalized in {"processing", "running"}:
        return TryOnJobStatus.PROCESSING

    if normalized in {"succeeded", "success", "completed"}:
        return TryOnJobStatus.SUCCEEDED

    if normalized in {"canceled", "cancelled"}:
        return TryOnJobStatus.CANCELLED

    if normalized in {"failed", "error"}:
        return TryOnJobStatus.FAILED

    raise TryOnProviderError(
        f"Estado de generación no reconocido: {value!r}."
    )


def _output_url(value: object) -> str | None:
    if value is None:
        return None

    if isinstance(value, str):
        return value.strip() or None

    if isinstance(value, (list, tuple)):
        for item in value:
            candidate = _output_url(item)
            if candidate:
                return candidate
        return None

    candidate = getattr(value, "url", None)

    if candidate is not None:
        return str(candidate).strip() or None

    return None


def _duration_ms(metrics: object) -> int | None:
    if metrics is None:
        return None

    if isinstance(metrics, dict):
        seconds = (
            metrics.get("predict_time")
            or metrics.get("total_time")
        )
    else:
        seconds = (
            getattr(metrics, "predict_time", None)
            or getattr(metrics, "total_time", None)
        )

    if seconds is None:
        return None

    try:
        return max(0, round(float(seconds) * 1000))
    except (TypeError, ValueError):
        return None


def _optional_text(value: object) -> str | None:
    if value is None:
        return None

    text = str(value).strip()
    return text or None


def _optional_int(value: object) -> int | None:
    if value is None:
        return None

    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return None

from __future__ import annotations

from ..settings import settings
from .models import TryOnImage, TryOnJob
from .providers import (
    TryOnProviderError,
    provider_for,
)


ALLOWED_CATEGORIES = {
    "TOP",
    "BOTTOM",
    "DRESS",
    "OUTERWEAR",
    "SHOES",
    "ACCESSORY",
}


class TryOnServiceError(RuntimeError):
    def __init__(
        self,
        message: str,
        status_code: int,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code


def tryon_capabilities() -> dict[str, object]:
    selected_name = (
        settings.velora_tryon_provider
        .strip()
        .lower()
    )

    local = provider_for("local").status()
    replicate = provider_for("replicate").status()

    configuration_valid = selected_name in {
        "local",
        "replicate",
    }

    selected = (
        provider_for(selected_name).status()
        if configuration_valid
        else None
    )

    return {
        "selectedProvider": selected_name,
        "selectedConfigured": (
            selected.configured
            if selected is not None
            else False
        ),
        "selectedModel": (
            selected.model
            if selected is not None
            else "invalid"
        ),
        "configurationValid": configuration_valid,
        "providers": {
            "local": {
                "configured": local.configured,
                "model": local.model,
                "mode": local.mode,
                "costClass": "FREE_SELF_HOSTED",
            },
            "replicate": {
                "configured": replicate.configured,
                "model": replicate.model,
                "mode": replicate.mode,
                "costClass": "LOW_COST_CLOUD",
            },
        },
        "generationEnabled": bool(
            selected is not None
            and selected.configured
        ),
        "phase": "P11D_PROVIDER_CONTRACT",
    }


def create_tryon_job(
    *,
    provider_name: str | None,
    category: str,
    person_content: bytes,
    person_content_type: str | None,
    person_filename: str | None,
    garment_content: bytes,
    garment_content_type: str | None,
    garment_filename: str | None,
) -> TryOnJob:
    provider = _provider(provider_name)
    normalized_category = _validate_category(category)

    person = _validated_image(
        label="La foto de la persona",
        content=person_content,
        reported_content_type=person_content_type,
        filename=person_filename,
    )
    garment = _validated_image(
        label="La imagen de la prenda",
        content=garment_content,
        reported_content_type=garment_content_type,
        filename=garment_filename,
    )

    try:
        return provider.submit(
            person=person,
            garment=garment,
            category=normalized_category,
        )
    except TryOnProviderError as exc:
        raise TryOnServiceError(
            str(exc),
            503,
        ) from exc


def get_tryon_job(
    provider_name: str,
    job_id: str,
) -> TryOnJob:
    provider = _provider(provider_name)

    try:
        return provider.get(job_id)
    except TryOnProviderError as exc:
        raise TryOnServiceError(
            str(exc),
            502,
        ) from exc


def cancel_tryon_job(
    provider_name: str,
    job_id: str,
) -> TryOnJob:
    provider = _provider(provider_name)

    try:
        return provider.cancel(job_id)
    except TryOnProviderError as exc:
        raise TryOnServiceError(
            str(exc),
            502,
        ) from exc


def _provider(name: str | None):
    selected = (
        name
        if name is not None and name.strip()
        else settings.velora_tryon_provider
    )

    try:
        provider = provider_for(selected)
    except TryOnProviderError as exc:
        raise TryOnServiceError(
            str(exc),
            400,
        ) from exc

    if not provider.status().configured:
        raise TryOnServiceError(
            (
                "El proveedor de Try-On seleccionado "
                "no está configurado."
            ),
            503,
        )

    return provider


def _validate_category(value: str) -> str:
    normalized = (value or "").strip().upper()

    if normalized not in ALLOWED_CATEGORIES:
        raise TryOnServiceError(
            "Categoría de Try-On no válida.",
            400,
        )

    return normalized


def _validated_image(
    *,
    label: str,
    content: bytes,
    reported_content_type: str | None,
    filename: str | None,
) -> TryOnImage:
    if not content:
        raise TryOnServiceError(
            f"{label} está vacía.",
            400,
        )

    max_bytes = settings.velora_tryon_max_input_bytes

    if len(content) > max_bytes:
        raise TryOnServiceError(
            f"{label} supera el límite de 5 MB.",
            413,
        )

    detected = _detect_content_type(content)

    if detected is None:
        raise TryOnServiceError(
            (
                f"{label} debe ser una imagen "
                "PNG, JPG/JPEG o WEBP válida."
            ),
            400,
        )

    reported = (
        reported_content_type
        or ""
    ).strip().lower()

    if reported == "image/jpg":
        reported = "image/jpeg"

    if reported and reported != detected:
        raise TryOnServiceError(
            (
                f"El tipo declarado de {label.lower()} "
                "no coincide con su contenido."
            ),
            400,
        )

    safe_filename = (
        (filename or "").strip()
        or "image"
    )

    return TryOnImage(
        content=content,
        content_type=detected,
        filename=safe_filename,
    )


def _detect_content_type(
    content: bytes,
) -> str | None:
    if (
        len(content) >= 8
        and content[:8]
        == b"\x89PNG\r\n\x1a\n"
    ):
        return "image/png"

    if (
        len(content) >= 3
        and content[:3] == b"\xff\xd8\xff"
    ):
        return "image/jpeg"

    if (
        len(content) >= 12
        and content[:4] == b"RIFF"
        and content[8:12] == b"WEBP"
    ):
        return "image/webp"

    return None

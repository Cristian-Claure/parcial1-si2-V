from typing import Any

import httpx

from .settings import settings


class CatalogUnavailable(RuntimeError):
    pass


def fetch_public_catalog() -> list[dict[str, Any]]:
    url = (
        settings.velora_backend_url.rstrip("/")
        + "/api/catalog/products"
    )

    try:
        with httpx.Client(timeout=8.0) as client:
            response = client.get(url)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise CatalogUnavailable(
            "No fue posible consultar el catálogo real de VÉLORA."
        ) from exc

    if not isinstance(payload, list):
        raise CatalogUnavailable(
            "El catálogo VÉLORA devolvió un formato inesperado."
        )

    products: list[dict[str, Any]] = []

    for raw in payload:
        if not isinstance(raw, dict):
            continue

        if raw.get("status") != "ACTIVE":
            continue

        variants = [
            {
                "id": variant.get("id"),
                "sku": variant.get("sku"),
                "size": variant.get("size"),
                "color": variant.get("color"),
                "price": variant.get("price"),
                "currency": variant.get("currency"),
            }
            for variant in raw.get("variants", [])
            if (
                isinstance(variant, dict)
                and variant.get("active") is True
                and variant.get("id")
            )
        ]

        if not variants:
            continue

        products.append(
            {
                "id": raw.get("id"),
                "name": raw.get("name"),
                "slug": raw.get("slug"),
                "categoryName": raw.get("categoryName"),
                "description": raw.get("description"),
                "brand": raw.get("brand"),
                "composition": raw.get("composition"),
                "fitNotes": raw.get("fitNotes"),
                "variants": variants,
            }
        )

        if (
            len(products)
            >= settings.velora_ai_max_catalog_products
        ):
            break

    return products
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from ..settings import settings


@dataclass(frozen=True)
class TryOnProviderStatus:
    name: str
    configured: bool
    model: str
    mode: str


class TryOnProvider(Protocol):
    def status(self) -> TryOnProviderStatus:
        ...


class ReplicateTryOnProvider:
    def status(self) -> TryOnProviderStatus:
        return TryOnProviderStatus(
            name="replicate",
            configured=bool(settings.replicate_api_token.strip()),
            model=settings.velora_tryon_replicate_model.strip(),
            mode="economy",
        )


class FashnTryOnProvider:
    def status(self) -> TryOnProviderStatus:
        return TryOnProviderStatus(
            name="fashn",
            configured=bool(settings.fashn_api_key.strip()),
            model="try-on",
            mode="premium",
        )


class LocalTryOnProvider:
    def status(self) -> TryOnProviderStatus:
        return TryOnProviderStatus(
            name="local",
            configured=bool(settings.velora_tryon_local_url.strip()),
            model=settings.velora_tryon_local_model.strip() or "not-selected",
            mode="free-local",
        )


def provider_for(name: str) -> TryOnProvider:
    normalized = name.strip().lower()

    if normalized == "local":
        return LocalTryOnProvider()
    if normalized == "fashn":
        return FashnTryOnProvider()
    return ReplicateTryOnProvider()

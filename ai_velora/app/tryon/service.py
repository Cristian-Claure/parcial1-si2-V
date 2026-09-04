from __future__ import annotations

from ..settings import settings
from .providers import provider_for


def tryon_capabilities() -> dict[str, object]:
    selected = provider_for(settings.velora_tryon_provider).status()
    local = provider_for("local").status()
    economy = provider_for("replicate").status()
    premium = provider_for("fashn").status()

    return {
        "selectedProvider": selected.name,
        "selectedConfigured": selected.configured,
        "selectedModel": selected.model,
        "modes": {
            "local": {
                "provider": local.name,
                "configured": local.configured,
                "model": local.model,
                "costClass": "FREE_SELF_HOSTED",
            },
            "economy": {
                "provider": economy.name,
                "configured": economy.configured,
                "model": economy.model,
                "costClass": "LOW_COST_CLOUD",
            },
            "premium": {
                "provider": premium.name,
                "configured": premium.configured,
                "model": premium.model,
                "costClass": "PREMIUM_CLOUD",
            },
        },
        "generationEnabled": False,
        "phase": "P11A_FOUNDATION",
    }

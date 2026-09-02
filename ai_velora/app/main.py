import secrets

from fastapi import (
    FastAPI,
    Header,
    HTTPException,
    status,
)

from .assistant import recommend_products
from .catalog import (
    CatalogUnavailable,
    fetch_public_catalog,
)
from .guardrails import sanitize_decision
from .report_ai import (
    interpret_report_request,
    narrate_report,
)
from .schemas import (
    ProductAssistantRequest,
    ProductAssistantResponse,
    ReportIntentResponse,
    ReportInterpretRequest,
    ReportNarrativeRequest,
    ReportNarrativeResponse,
)
from .settings import settings


app = FastAPI(
    title="VÉLORA AI",
    version="1.0.0",
)


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "UP",
        "model": settings.velora_ai_model,
        "openaiConfigured": bool(
            settings.openai_api_key.strip()
        ),
        "internalAuthConfigured": bool(
            settings.velora_ai_internal_token.strip()
        ),
    }


def _authorize(
    token: str | None,
) -> None:
    expected = (
        settings.velora_ai_internal_token
        .strip()
    )

    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "VELORA_AI_INTERNAL_TOKEN "
                "no está configurado."
            ),
        )

    if (
        token is None
        or not secrets.compare_digest(
            token,
            expected,
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Acceso interno VÉLORA AI no autorizado.",
        )


@app.post(
    "/assistant/recommend",
    response_model=ProductAssistantResponse,
)
def recommend(
    request: ProductAssistantRequest,
    x_velora_ai_token: str | None = Header(
        default=None,
        alias="X-Velora-AI-Token",
    ),
) -> ProductAssistantResponse:
    _authorize(x_velora_ai_token)

    try:
        catalog = fetch_public_catalog()
    except CatalogUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    if not catalog:
        return ProductAssistantResponse(
            reply=(
                "La colección no tiene productos activos "
                "con variantes disponibles para recomendar."
            ),
            recommendations=[],
            model=settings.velora_ai_model,
        )

    try:
        decision = recommend_products(
            message=request.message,
            history=[
                item.model_dump()
                for item in request.history
            ],
            products=catalog,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "VÉLORA AI no pudo completar "
                "la recomendación."
            ),
        ) from exc

    safe = sanitize_decision(
        decision,
        catalog,
    )

    return ProductAssistantResponse(
        reply=safe.reply,
        recommendations=safe.recommendations,
        model=settings.velora_ai_model,
    )


@app.post(
    "/reports/interpret",
    response_model=ReportIntentResponse,
)
def interpret_report(
    request: ReportInterpretRequest,
    x_velora_ai_token: str | None = Header(
        default=None,
        alias="X-Velora-AI-Token",
    ),
) -> ReportIntentResponse:
    _authorize(x_velora_ai_token)

    try:
        intent = interpret_report_request(
            question=request.question,
            current_date=request.currentDate,
            stores=[
                item.model_dump()
                for item in request.availableStores
            ],
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "VÉLORA AI no pudo interpretar "
                "la solicitud de reporte."
            ),
        ) from exc

    return ReportIntentResponse(
        intent=intent,
        model=settings.velora_ai_model,
    )


@app.post(
    "/reports/narrate",
    response_model=ReportNarrativeResponse,
)
def narrate_operational_report(
    request: ReportNarrativeRequest,
    x_velora_ai_token: str | None = Header(
        default=None,
        alias="X-Velora-AI-Token",
    ),
) -> ReportNarrativeResponse:
    _authorize(x_velora_ai_token)

    try:
        narrative = narrate_report(
            question=request.question,
            report=request.report,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "VÉLORA AI no pudo redactar "
                "el análisis del reporte."
            ),
        ) from exc

    return ReportNarrativeResponse(
        summary=narrative.summary,
        insights=narrative.insights,
        model=settings.velora_ai_model,
    )
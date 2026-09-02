import json
from datetime import date
from typing import Any

from openai import OpenAI

from .schemas import (
    ReportIntent,
    ReportNarrativeDecision,
)
from .settings import settings


INTERPRET_SYSTEM_PROMPT = """
Eres el intérprete seguro de reportes operativos de VÉLORA.

Tu única tarea es convertir una solicitud en lenguaje natural a un ReportIntent
estructurado.

REGLAS:
1. No calcules KPI, ventas, stock, pedidos ni importes.
2. No generes SQL.
3. Sólo puedes elegir un storeId presente literalmente en AVAILABLE_STORES.
4. Si no se menciona una sucursal concreta, storeId debe ser null.
5. Usa currentDate como fecha de referencia para expresiones como hoy,
   ayer, esta semana, últimos 7 días, este mes o mes pasado.
6. Si no hay período explícito, deja fromDate y toDate en null; Spring aplicará
   su período determinístico por defecto.
7. focus sólo puede indicar el área principal solicitada.
8. requestedChart expresa una preferencia visual; AUTO si el usuario no pide una.
9. Nunca inventes IDs de sucursal.
""".strip()


NARRATIVE_SYSTEM_PROMPT = """
Eres VÉLORA AI para análisis ejecutivo de reportes.

Recibirás un reporte YA CALCULADO por Spring Boot. Tu trabajo es explicarlo,
no recalcularlo.

REGLAS CRÍTICAS:
1. Todos los importes, cantidades, porcentajes y nombres deben provenir
   literalmente de REPORT_FACTS.
2. No inventes cifras, tendencias, comparaciones, fechas, productos o sucursales.
3. No generes SQL.
4. No cambies la definición de ningún KPI.
5. Puedes conectar hechos existentes y explicar por qué son relevantes.
6. Si faltan datos para una conclusión, indícalo.
7. Devuelve un resumen ejecutivo breve y máximo seis insights.
8. Habla en español profesional, claro y orientado a decisión.
""".strip()


def _client() -> OpenAI:
    api_key = settings.openai_api_key.strip()

    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY no está configurado."
        )

    return OpenAI(api_key=api_key)


def interpret_report_request(
    *,
    question: str,
    current_date: date,
    stores: list[dict[str, str]],
) -> ReportIntent:
    allowed_store_ids = {
        str(store.get("id"))
        for store in stores
        if store.get("id")
    }

    user_input = {
        "currentDate": current_date.isoformat(),
        "question": question.strip(),
        "availableStores": stores,
    }

    response = _client().responses.parse(
        model=settings.velora_ai_model,
        input=[
            {
                "role": "system",
                "content": INTERPRET_SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": json.dumps(
                    user_input,
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
            },
        ],
        text_format=ReportIntent,
    )

    parsed = response.output_parsed

    if parsed is None:
        raise RuntimeError(
            "OpenAI no devolvió una intención de reporte válida."
        )

    safe_store_id = parsed.storeId

    if (
        safe_store_id is not None
        and safe_store_id not in allowed_store_ids
    ):
        safe_store_id = None

    if (
        parsed.fromDate is not None
        and parsed.toDate is not None
        and parsed.fromDate > parsed.toDate
    ):
        raise RuntimeError(
            "OpenAI devolvió un período de reporte inválido."
        )

    return parsed.model_copy(
        update={
            "storeId": safe_store_id,
        }
    )


def narrate_report(
    *,
    question: str,
    report: dict[str, Any],
) -> ReportNarrativeDecision:
    report_json = json.dumps(
        report,
        ensure_ascii=False,
        separators=(",", ":"),
        default=str,
    )

    if len(report_json) > 60000:
        raise RuntimeError(
            "El reporte es demasiado grande para análisis narrativo."
        )

    user_input = {
        "question": question.strip(),
        "reportFacts": report,
    }

    response = _client().responses.parse(
        model=settings.velora_ai_model,
        input=[
            {
                "role": "system",
                "content": NARRATIVE_SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": json.dumps(
                    user_input,
                    ensure_ascii=False,
                    separators=(",", ":"),
                    default=str,
                ),
            },
        ],
        text_format=ReportNarrativeDecision,
    )

    parsed = response.output_parsed

    if parsed is None:
        raise RuntimeError(
            "OpenAI no devolvió una narrativa de reporte válida."
        )

    return ReportNarrativeDecision(
        summary=parsed.summary.strip(),
        insights=[
            insight.strip()
            for insight in parsed.insights
            if insight.strip()
        ][:6],
    )
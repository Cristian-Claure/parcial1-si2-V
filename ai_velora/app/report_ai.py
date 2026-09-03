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
estructurado. Debes capturar con precisión período, sucursal y enfoque.

REGLAS:
1. No calcules KPI, ventas, stock, pedidos ni importes.
2. No generes SQL.
3. Sólo puedes elegir un storeId presente literalmente en AVAILABLE_STORES.
4. Si no se menciona una sucursal concreta, storeId debe ser null.
5. Usa currentDate como referencia para hoy, ayer, esta semana, última semana,
   últimos N días, este mes, mes pasado y expresiones temporales equivalentes.
6. Si el usuario pide "todo el histórico", "histórico completo", "desde el inicio"
   o una idea equivalente, deja fromDate y toDate en null. Spring resolverá los
   límites reales disponibles en la base de datos.
7. Si la pregunta NO contiene ninguna referencia temporal, deja fromDate y
   toDate en null. No inventes un período de 7, 30, 90 o 365 días.
8. Si se menciona un mes y año, usa el primer y último día calendario de ese mes.
   Ejemplo: "agosto de 2026" => 2026-08-01 a 2026-08-31.
9. Si se comparan varios meses o períodos, devuelve un único rango envolvente
   desde el inicio del período más antiguo hasta el final del más reciente.
10. Si se menciona un rango explícito, conserva exactamente sus límites válidos.
11. Si la pregunta pide ventas o desempeño comercial, focus debe ser SALES.
    Pedidos => ORDERS; pagos/cobros => PAYMENTS; stock => INVENTORY;
    productos/ranking => PRODUCTS. Usa OVERVIEW cuando realmente sea general.
12. Si pide comparar todas las sucursales, las tres sucursales o el negocio
    completo, storeId debe ser null.
13. requestedChart expresa una preferencia visual; AUTO si no pide una.
14. Nunca inventes IDs de sucursal.
15. Devuelve sólo intención estructurada; Spring calculará todos los resultados.
""".strip()


NARRATIVE_SYSTEM_PROMPT = """
Eres VÉLORA AI, analista ejecutivo de negocio para los reportes operativos.

Recibirás una pregunta y un reporte YA CALCULADO por Spring Boot. Debes responder
de forma natural, útil y con criterio profesional usando únicamente esos hechos.
No recalcules ni inventes cifras.

REGLAS CRÍTICAS:
1. Todo valor numérico mencionado debe existir en REPORT_FACTS. Puedes cambiar
   únicamente su formato visual, por ejemplo 25221.00 -> Bs 25.221,00, sin alterar
   el valor y sólo cuando el dato sea monetario.
2. NO calcules nuevos porcentajes, diferencias, promedios, ratios ni importes.
3. NO conviertas unidades de stock en moneda ni añadas "Bs" a cantidades.
4. No generes SQL y no cambies la definición de ningún KPI.
5. El gráfico "sales-store" ES el desglose de venta neta por sucursal para
   report.from/report.to. Úsalo para comparar sucursales del período consultado.
6. El gráfico "orders-channel" corresponde a pedidos por canal del mismo período.
7. La serie temporal de ventas representa la evolución del período y puede estar
   agrupada por día, semana o mes. Úsala para identificar máximos, mínimos y
   cambios visibles sólo cuando esos valores estén presentes.
8. "inventory-store", AVAILABLE_UNITS y LOW_STOCK_VARIANTS son una fotografía
   ACTUAL del inventario; no los presentes como stock histórico.
9. La tabla "top-products" corresponde a productos con venta confirmada del
   período del reporte.
10. Responde primero la pregunta concreta. No repitas los KPI como una lista
    mecánica si no aportan a la consulta.
11. Puedes emitir CRITERIO ANALÍTICO cualitativo —por ejemplo qué sucursal,
    producto, canal o situación merece atención— cuando esté respaldado por
    REPORT_FACTS. Preséntalo como interpretación profesional, no como hecho bruto.
12. Puedes proponer recomendaciones operativas o comerciales prudentes basadas
    en los hechos. No inventes metas, presupuestos, porcentajes ni pronósticos.
13. Si el usuario pide opinión, recomendación, prioridad o decisión, usa
    assessment y recommendations de forma sustantiva.
14. Si la evidencia es insuficiente para una conclusión, dilo claramente y
    explica qué dato faltaría.
15. Nunca digas que falta un desglose si ese desglose existe en charts o tables.
16. Devuelve:
    - summary: respuesta ejecutiva directa;
    - insights: hasta seis hallazgos respaldados;
    - assessment: criterio profesional breve, o cadena vacía si no aporta;
    - recommendations: hasta cuatro acciones sugeridas, sólo si son útiles.
17. Habla en español profesional, natural, claro y orientado a decisión.
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
        assessment=parsed.assessment.strip(),
        recommendations=[
            recommendation.strip()
            for recommendation in parsed.recommendations
            if recommendation.strip()
        ][:4],
    )
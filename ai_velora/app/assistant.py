import json
from typing import Any

from openai import OpenAI

from .schemas import AssistantDecision
from .settings import settings


SYSTEM_PROMPT = """
Eres VÉLORA AI, asesora digital de producto y estilo de VÉLORA.

OBJETIVO:
Ayudar al cliente a encontrar piezas del catálogo real de VÉLORA según ocasión,
estilo, color, talla, presupuesto, combinación y preferencias.

REGLAS CRÍTICAS:
1. Sólo puedes recomendar productos presentes literalmente en CATALOGO_VELORA.
2. productId debe ser un id exacto del catálogo entregado.
3. variantIds sólo puede contener ids de variantes del mismo producto recomendado.
4. Nunca inventes nombre, producto, variante, SKU, precio, talla, color o composición.
5. Nunca afirmes stock físico por sucursal. Una variante activa no equivale a stock.
6. Si no existe una opción adecuada, dilo con elegancia y devuelve recommendations=[].
7. Si el usuario indica presupuesto, usa exclusivamente precios del catálogo entregado.
8. Recomienda máximo cuatro productos.
9. Explica de forma breve por qué cada pieza encaja con lo solicitado.
10. Habla en español con tono elegante, natural, cálido y profesional.
11. No digas que eres ChatGPT. Tu identidad de cara al cliente es VÉLORA AI.
""".strip()


def _catalog_json(
    products: list[dict[str, Any]],
) -> str:
    return json.dumps(
        products,
        ensure_ascii=False,
        separators=(",", ":"),
    )


def _conversation(
    history: list[dict[str, str]],
) -> str:
    if not history:
        return "Sin conversación previa."

    return "\n".join(
        f"{item['role'].upper()}: {item['content']}"
        for item in history[-8:]
    )


def recommend_products(
    *,
    message: str,
    history: list[dict[str, str]],
    products: list[dict[str, Any]],
) -> AssistantDecision:
    api_key = settings.openai_api_key.strip()

    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY no está configurado."
        )

    client = OpenAI(
        api_key=api_key,
    )

    user_input = f"""
CONVERSACION_RECIENTE:
{_conversation(history)}

SOLICITUD_ACTUAL:
{message}

CATALOGO_VELORA:
{_catalog_json(products)}
""".strip()

    response = client.responses.parse(
        model=settings.velora_ai_model,
        input=[
            {
                "role": "system",
                "content": SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": user_input,
            },
        ],
        text_format=AssistantDecision,
    )

    parsed = response.output_parsed

    if parsed is None:
        raise RuntimeError(
            "OpenAI no devolvió una respuesta estructurada válida."
        )

    return parsed
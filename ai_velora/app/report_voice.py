from openai import OpenAI

from .settings import settings


MAX_AUDIO_BYTES = 8 * 1024 * 1024

SUPPORTED_AUDIO_TYPES = {
    "audio/webm": "webm",
    "video/webm": "webm",
    "audio/mp4": "mp4",
    "audio/x-m4a": "m4a",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
    "audio/aac": "aac",
    "audio/flac": "flac",
}

TRANSCRIPTION_PROMPT = (
    "Consulta en español sobre reportes comerciales de VÉLORA. "
    "Puede mencionar ventas, pedidos, pagos, inventario, productos, "
    "POS, Ecommerce, sucursales Equipetrol, Urubó y Zona Norte, "
    "fechas, semanas, meses y períodos históricos."
)


def _client() -> OpenAI:
    api_key = settings.openai_api_key.strip()

    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY no está configurado."
        )

    return OpenAI(api_key=api_key)


def transcribe_report_audio(
    *,
    audio: bytes,
    content_type: str,
) -> str:
    if not audio:
        raise ValueError(
            "No se recibió audio para transcribir."
        )

    if len(audio) > MAX_AUDIO_BYTES:
        raise ValueError(
            "El audio supera el límite de 8 MB."
        )

    normalized_type = (
        content_type
        .split(";", 1)[0]
        .strip()
        .lower()
    )

    extension = SUPPORTED_AUDIO_TYPES.get(
        normalized_type
    )

    if extension is None:
        raise ValueError(
            "El formato de audio no está soportado."
        )

    response = _client().audio.transcriptions.create(
        model=settings.velora_ai_transcribe_model,
        file=(
            f"velora-report.{extension}",
            audio,
            normalized_type,
        ),
        language="es",
        prompt=TRANSCRIPTION_PROMPT,
    )

    text = response.text.strip()

    if not text:
        raise RuntimeError(
            "No se detectó voz suficiente para generar una transcripción."
        )

    if len(text) > 800:
        text = text[:800].rstrip()

    return text
# VÉLORA AI

Microservicio FastAPI del asistente de producto.

## Arquitectura

Angular no llama directamente a este servicio.

```text
Angular CUSTOMER
        |
        v
Spring Boot /api/customer/assistant/products
        |
        | X-Velora-AI-Token
        v
FastAPI :8001
        |
        +--> catálogo público real Spring Boot
        |
        +--> OpenAI Responses API
```

## Reglas

- La API key de OpenAI nunca llega al navegador.
- FastAPI escucha sólo en `127.0.0.1` durante desarrollo local.
- El endpoint de recomendación requiere un token interno compartido con Spring.
- El modelo sólo puede recomendar IDs entregados por el catálogo real.
- Una segunda capa valida productId y variantIds después de la respuesta del modelo.
- No se inventan productos, variantes, precios ni stock.
- Si `OPENAI_API_KEY` falta, la IA responde 503; no existe fallback falso.

## Inicio local

```powershell
.\scripts\start-ai.ps1
```

Endpoints locales:

- `GET http://127.0.0.1:8001/health`
- `POST http://127.0.0.1:8001/assistant/recommend`
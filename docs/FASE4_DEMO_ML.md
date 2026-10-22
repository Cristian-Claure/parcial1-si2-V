# Fase 4 · Guía de demostración de Machine Learning (3 minutos)

## Preparación (una sola vez)

```powershell
pnpm ml:setup      # crea apps/ml/.venv e instala requirements.txt (Python 3.11+)
pnpm ml:db-role    # opcional: rol velora_ml de mínimo privilegio (guarda VELORA_ML_DATABASE_URL en .env)
pnpm ml:test       # pytest: 15 pruebas
```

`.env` local (no versionado): `VELORA_ML_URL=http://127.0.0.1:8090` y `VELORA_ML_TOKEN` (aleatorio). El backend y el servicio ML leen el mismo token.

## Levantar

En tres terminales:

```powershell
pnpm dev:back
pnpm dev:front
pnpm dev:ml        # FastAPI en 127.0.0.1:8090 (un entrenamiento a la vez)
```

Entrenar por la CLI, sin el backend: `pnpm ml:train -- --company urbano-boutique`. Tarda unos 25 s e imprime cada modelo frente a su referencia.

## A. Demo automática (1 min)

```powershell
node scripts/demo-ml.mjs
```

Con el propietario MAX de Urbano Boutique hace lo siguiente:
- lanza un **entrenamiento real** y espera a que termine (unos 30 s, máximo 10 min);
- verifica métricas coherentes para los 4 modelos y que la venta real del pronóstico coincida con el SQL de referencia;
- comprueba que FREE y PLUS reciban **403** y que ese propietario **no** pueda leer los resultados de VÉLORA (404).

Sale con código 1 si algo falla. Credenciales: `VELORA_DEMO_{MAX,PLUS,FREE}_{EMAIL,PASSWORD}` en el `.env` local.

## B. Recorrido en el navegador (2 min)

Entra con `lucia.arce@urbano.seed.velora.local` (MAX), elige **Urbano Boutique** y abre **Inteligencia** (`/admin/ml`).

1. **Estado**: cuatro tarjetas con el último entrenamiento de cada modelo. Pulsa **Entrenar de nuevo**: los estados pasan por "En cola", "Entrenando" y "Listo", y los tableros se refrescan solos.
2. **Pronóstico**:
   - serie real frente a predicha con banda del 80 %, y a la derecha de la línea vertical los próximos 30 días;
   - tabla del modelo frente a las 3 referencias (MAE, RMSE y sMAPE), donde el modelo las supera;
   - importancias: día de la semana, promedio de 7 días y venta de ayer.
3. **Segmentos**:
   - mapa PCA coloreado;
   - tarjetas Leales (13 % de los clientes y 54 % de los ingresos), En riesgo, Ocasionales y Una sola compra;
   - tabla de elección de k (silhouette, estabilidad y codo).
4. **Riesgo de cancelación**:
   - ROC-AUC y PR-AUC frente a la logística y la clase mayoritaria;
   - matriz de confusión;
   - el tipo de entrega como variable principal (DELIVERY cancela el doble);
   - pedidos abiertos con mayor riesgo.

   Explica el **momento de puntuación** (checkout) y que no se usa nada posterior.
5. **Anomalías**: serie con marcadores; Día del Padre y Día de la Madre aparecen explicados. Muestra la tabla de fechas especiales (2 de 5 detectadas) y explica por qué Black Friday no llega al umbral (ruido del monto en Bs).
6. **Control de plan**:
   - con `mateo.quispe@andina.seed.velora.local` (PLUS), "Inteligencia" aparece con la insignia **MAX** y la página muestra "Disponible en MAX" (el backend responde 403);
   - con `valeria.rojas@primerpaso.seed.velora.local` (FREE) pasa lo mismo.
7. **Servicio caído**: detén `pnpm dev:ml` y recarga. Los resultados guardados siguen visibles con un aviso, y "Entrenar de nuevo" queda deshabilitado (si se fuerza, el backend responde `503 ML_SERVICE_UNAVAILABLE`).

Para la defensa, el porqué de cada modelo, la validación, las métricas, las limitaciones y la tabla "patrón sembrado → qué recuperó el modelo" están en `docs/ML_MODELOS.md`.

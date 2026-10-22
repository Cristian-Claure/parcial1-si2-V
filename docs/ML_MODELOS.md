# Modelos de Machine Learning (Fase 4) — documento para la defensa

Servicio local en `apps/ml`: Python 3.13, scikit-learn 1.6.1, pandas, numpy y psycopg. Sin redes neuronales ni prophet.

- Un modelo **por empresa**: todas las consultas filtran por `company_id`.
- Solo **plan MAX**.
- Python lee las tablas operativas y escribe **solo en `ml_*`**. Lo garantizan dos cosas: el rol `velora_ml`, con `SELECT` en las tablas que lee y DML solo en `ml_*`, y una verificación en código (`db.assert_ml_table`).
- Cifras: corrida del 22-oct-2026 sobre la BD `velora_migrated_v25`. **U** = Urbano Boutique, **V** = VÉLORA.

| Modelo | Tipo | Resultado en la prueba (modelo vs mejor referencia) |
|---|---|---|
| S1 Pronóstico de venta neta | Supervisado · regresión | U: MAE **2.732** vs 2.821 (sMAPE 36,1 vs 36,8 %) · V: MAE **1.895** vs 2.177 (44,0 vs 49,8 %) |
| S2 Riesgo de cancelación | Supervisado · clasificación | U: ROC-AUC **0,621** vs 0,615 (logística) y 0,5 (mayoritaria), PR-AUC **0,243** vs 0,200 y 0,136 · V: ROC-AUC **0,717** vs 0,601, PR-AUC 0,265 vs **0,323** (logística) |
| U1 Segmentos de clientes | No supervisado · clustering | U: k = 4, silhouette 0,39, ARI 0,31 frente a lo sembrado · V: k = 3, ARI 0,14 |
| U2 Anomalías en ventas | No supervisado · detección | U: 2 de 5 fechas fuertes detectadas y 5 días sin explicación en 477 · V: 0 de 5 y 3 sin explicación |

---

## S1 · Pronóstico de venta neta diaria

**Por qué.** El dueño necesita anticipar la venta de los próximos 30 días para el stock, el personal y la caja. Es una regresión sobre una serie diaria con semana, tendencia y fechas especiales.

**Objetivo.** La venta neta diaria con la **definición única** del bloque 3: Σ pagos `PAID`/`REFUNDED` por `paid_at` − Σ reembolsos por `refunded_at`, por día de Bolivia. `data.DAILY_NET_SQL` replica el SQL de `report-facts.ts`, y dos verificaciones lo confirman:
- `test_daily_net_sales_matches_reference_sql` compara contra SQL independiente;
- `demo-ml.mjs` compara la venta real del backtest (Bs 700.499,00 = Bs 700.499,00).

**Variables.**
- Calendario: día de la semana, mes, día del mes, quincena (14–16), fin o inicio de mes, y las fechas especiales (Día del Padre y su previa, Día de la Madre y su previa, Black Friday y su fin de semana, temporada navideña, Nochebuena y Navidad).
- Rezagos de 1, 7, 14 y 28 días.
- Promedios móviles de 7 y 28 días (solo días anteriores).
- Índice de tendencia.

Una prueba verifica que alterar el futuro no cambia las variables del pasado.

**Validación (sin partición aleatoria).**
- Walk-forward con ventana creciente: **3 pliegues de validación de 30 días** para elegir el modelo y **una prueba final con los últimos 90 días**, que no se usa para ajustar.
- Dentro de cada pliegue se pronostica **de forma recursiva en bloques de 30 días** (el horizonte real): el modelo usa sus propias predicciones como rezagos, igual que en producción.
- **Referencias**: ingenuo (último día), ingenuo estacional de 7 días y promedio móvil de 28 días.
- **Candidatos**: `HistGradientBoostingRegressor` (16 combinaciones) y `Ridge` con one-hot de semana y mes (4). En total, 20 combinaciones con `random_state = 42`.
- **Selección**: el menor MAE medio en validación.
- **Bandas**: cuantiles del 10 % y del 90 % de los residuos de **validación**, ensanchados con el horizonte. La cobertura se mide en la prueba: 76,7 % en U y 66,7 % en V, frente al 80 % nominal.

**Resultados.**
- Ambos modelos superan a las tres referencias en la prueba.
- En U se eligió HGB en validación, pero Ridge fue mejor en la prueba (MAE 2.470). Se publica lo elegido en validación y se muestra la alternativa, sin cambiar la elección con la prueba.
- Importancias (permutación en el último pliegue de validación): día de la semana, promedio de 7 días, venta de ayer y rezago de 28.
- Las fechas especiales tienen importancia 0 en ese pliegue porque no cae ninguna dentro. El modelo las aprende igual porque están en el entrenamiento.

**Limitaciones.**
- El sMAPE es alto (36–44 %): la venta diaria de una tienda pequeña es muy ruidosa (Poisson y ticket variable). El modelo mejora un 3–13 % sobre la mejor referencia, no "adivina" el día.
- La prueba incluye octubre de 2026, rellenado al 85 % del ritmo por `--fill-gaps`, lo que penaliza a todos por igual.

---

## S2 · Riesgo de cancelación (pedidos ECOMMERCE)

**Por qué.** Un pedido online cancelado inmoviliza stock y logística. Marcar el riesgo al recibir el pedido permite llamar al cliente o pedir el pago antes de despachar.

**Etiqueta.** `CANCELLED` = 1 y `FULFILLED` = 0. Los `RESERVED` (abiertos) **no entrenan: se puntúan**.

**Momento de puntuación.** La **creación del pedido en el checkout**: el cliente ya eligió la entrega y el método de pago (el primer pago creado).

- **Variables**: tipo de entrega, total, descuento, líneas, unidades, método de pago, hora, día, antigüedad del cliente y pedidos previos del cliente (solo los anteriores a ese pedido).
- **Prohibido**: `cancelled_at`, `fulfilled_at`, `paid_at`, `refunded_at`, el estado del pago y cualquier historial. Dos pruebas lo verifican:
  - `test_cancel_query_has_no_post_checkout_columns` revisa el SQL;
  - `test_cancel_features_ignore_label_and_future_columns` comprueba que cambiar la etiqueta o las fechas posteriores no altera las variables.

**Validación.**
- **Partición temporal**: el 80 % inicial entrena y el 20 % final prueba. En U, entrena hasta el 09-ago-2026 y prueba 552 pedidos posteriores.
- Dentro del entrenamiento, el último 20 % es validación para elegir los hiperparámetros (grilla de 16 HGB más 3 logísticas, por PR-AUC) y el **umbral** (el que maximiza F1 en validación, nunca en la prueba).
- El desbalance (~11 % de positivos) se maneja con `class_weight="balanced"`.
- **Referencias**: clase mayoritaria y regresión logística. **Candidato**: `HistGradientBoostingClassifier`.
- **Métricas**: ROC-AUC, PR-AUC, precisión, recall, F1, matriz de confusión y Brier, más importancia por permutación en la prueba.

**Resultados (U).**
- ROC-AUC 0,621 y PR-AUC 0,243, frente a 0,615 y 0,200 de la logística y 0,5 y 0,136 de la mayoritaria.
- Recall 65 % con precisión 17 %: detecta 49 de 75 cancelaciones a costa de 235 falsas alarmas.
- **Brier 0,20 frente a 0,12 de la mayoritaria**: los pesos de clase inflan las probabilidades (no están calibradas). Se reporta tal cual; si se quisieran probabilidades, habría que calibrarlas.
- En V, el gradient boosting gana en ROC-AUC (0,717 frente a 0,601), pero **la logística gana en PR-AUC** (0,323 frente a 0,265). Se publicó el elegido en validación y se muestran ambos.

**Limitaciones.** La regla sembrada es probabilística y débil (+4 a +6 puntos por factor sobre una base del 4 %), así que el techo teórico del AUC es bajo. "Pedidos previos" pesa más de lo esperado: aproxima el tipo de cliente y el momento, pero no es una fuga (solo cuenta pedidos anteriores).

---

## U1 · Segmentos de clientes (RFM + KMeans)

**Por qué.** Sirve para orientar campañas: premiar a los leales, reactivar a los que se enfrían y convertir a los de una sola compra. No hay etiquetas reales, así que es aprendizaje no supervisado.

**Variables.** RFM a la fecha de corte (hoy):
- **R**: días desde la última compra pagada;
- **F**: pedidos pagados;
- **M**: importe cobrado sin reembolsos.

Se aplica `log1p` (las tres son asimétricas) y `StandardScaler`.

**Elección de k (2 a 8).**
- Para cada k se calculan la **silhouette**, la **inercia** (codo = mayor segunda diferencia) y la **estabilidad** (ARI medio entre 5 semillas).
- Regla, fijada **antes** de compararla con lo sembrado: entre los k estables (ARI ≥ 0,8), se toma el del codo si su silhouette está dentro del 10 % de la mejor; si no, el de mayor silhouette.
- Sin esa regla, la silhouette elige k = 2 (ARI 0,24 en U). Con ella, U queda en k = 4 (silhouette 0,388 frente a 0,423 de k = 2) y el ARI sube a **0,31**.
- La proyección PCA a 2D se usa solo para el gráfico (explica el 98 % de la varianza en U y el 96 % en V).

**Nombres (reglas explícitas sobre el perfil medio frente a la mediana general).**
- "Una sola compra": mediana de F = 1.
- "En riesgo": F ≥ 2 y recencia > 1,5 × la mediana.
- "Leales": F ≥ 1,5 × la mediana y M ≥ la mediana.
- "Ocasionales": el resto.

**Perfiles (U).**

| Segmento | Clientes | Ingresos | Última compra | Pedidos | Gasto medio |
|---|---|---|---|---|---|
| Leales | 54 (13 %) | 53,5 % | hace 11 días | 28,6 | Bs 18.470 |
| En riesgo | 109 (27 %) | 33,5 % | hace 89 días | 11,3 | Bs 5.733 |
| Ocasionales | 107 (27 %) | 8,9 % | hace 20 días | 2,8 | Bs 1.550 |
| Una sola compra | 131 (33 %) | 4,1 % | hace 158 días | 1,1 | Bs 588 |

**Evidencia frente a lo sembrado (U, 401 clientes).**
- "Una sola compra" contiene 104 de los 121 ONE_TIME que compraron.
- "Leales" tiene 34 LOYAL_HIGH, 20 OCCASIONAL y 0 ONE_TIME/CHURN_RISK.
- "En riesgo" reúne 42 de 61 CHURN_RISK.
- ARI 0,31 en U. En V es 0,14: hay pocos clientes (179) y el ritmo es bajo, así que los grupos se separan peor.

**Limitaciones.** RFM no ve qué compra cada cliente ni su canal. "Ocasional" y "En riesgo" se solapan por diseño del generador: un cliente en riesgo es un ocasional que dejó de comprar.

---

## U2 · Anomalías en la venta diaria

**Por qué.** Para encontrar días que se salen de lo normal y explicarlos (campañas, feriados) o investigarlos (quiebre de stock, cierre, error de carga).

**Método.**
1. La demanda "normal" se modela en **escala raíz cuadrada** (estabiliza la varianza tipo Poisson) con una regresión **Huber** sobre el día de la semana y el **nivel local** (mediana móvil centrada de 29 días). **No** incluye las fechas especiales ni la quincena, para que esos efectos aparezcan como desvíos.
2. **z robusto** de los residuos: (r − mediana) / (1,4826 · MAD). Se marca el día si |z| ≥ 3.
3. Cada día marcado se explica con el calendario: Black Friday, Madre, Padre, Nochebuena, Navidad, quincena o fin de mes.

**Iteración documentada.** La primera versión (escala log y tendencia lineal) marcaba casi solo caídas: en log, un día sin ventas daba z ≈ −11. Se pasó a raíz cuadrada con nivel local (iteración 1 de 2). En U, los falsos positivos bajaron de 7 a 5 y las fechas detectadas subieron de 1 a 2. **No** se ajustó el umbral mirando las fechas sembradas.

**Evidencia (fechas especiales fuertes sembradas).**

| Fecha | Multiplicador sembrado | z en U | ¿Detectada? |
|---|---|---|---|
| Black Friday 28-nov-2025 | ×2,5 | 2,68 | No (por debajo de 3) |
| Nochebuena 24-dic-2025 | ×1,8 | 1,52 | No |
| Navidad 25-dic-2025 | ×0,5 | −2,62 | No |
| Día del Padre 19-mar-2026 | ×1,6 | **3,53** | **Sí** |
| Día de la Madre 27-may-2026 | ×1,8 | **3,54** | **Sí** |

En U marca 8 días atípicos, 3 con explicación del calendario y 5 sin ella (1 % de 477 días). En V y Andina no detecta ninguna fecha fuerte.

**Causa (entendida).** Los multiplicadores se sembraron sobre el **número de pedidos**. La venta en Bs además varía con el ticket (de 100 a 1.000 Bs) y con los reembolsos. Con 2 o 3 pedidos al día, un día ×1,8 queda dentro del ruido normal. El detector es conservador (pocas falsas alarmas) a costa del recall.

---

## Patrón sembrado → qué recuperó el modelo

| Patrón sembrado (`docs/DATOS_SINTETICOS.md`) | Qué recuperó el ML |
|---|---|
| Semana: viernes a domingo ×1,20–1,45 | S1: **día de la semana** es la variable más importante (U). U2 incluye la semana en lo esperado, así que no la marca como anomalía. |
| Crecimiento mensual del 3–5 % | S1: los promedios móviles de 7 y 28 días y el rezago de 28 llevan el nivel; Ridge extrapola la tendencia. |
| Quincena ×1,15 y fin de mes ×1,20 | S1: "fin de mes" aparece en las importancias (U y V). U2: explica parte de los días marcados. |
| Día del Padre ×1,6 y Día de la Madre ×1,8 | U2: **ambos detectados** en U (z ≈ 3,5). |
| Black Friday ×2,5 | U2: z = 2,68 en U, por debajo del umbral (no detectado). |
| Cancelación: +6 % DELIVERY, +5 % ticket > 600 Bs, +5 % contra entrega | S2: **tipo de entrega** es la variable más importante y el **método de pago** aparece en el top 3 (U). Tasa observada: DELIVERY 15,9 % frente a PICKUP 7,0 %. |
| Segmentos: fiel 12 %, ocasional 40 %, compra única 33 %, en riesgo 15 % | U1: Leales 13 %, Ocasionales 27 %, Una sola compra 33 % y En riesgo 27 % (U). Una sola compra recupera el 86 % de ONE_TIME; ARI 0,31. |
| Pareto: 20 % de productos = 64–79 % de unidades | No es objeto de estos modelos (se ve en los reportes de la Fase 3). |

## Reproducibilidad y operación

- Las semillas son fijas (`random_state = 42`; 5 semillas para la estabilidad del clustering), y una prueba verifica que el k y los nombres sean los mismos al reordenar los datos.
- Cada empresa entrena en unos **20–30 s** y unos cientos de MB de RAM (joblib limitado a 2 núcleos). Se ejecuta un entrenamiento a la vez.
- Se conservan las **últimas 5 corridas** por modelo y empresa; los artefactos `joblib` quedan en `apps/ml/artifacts/` (no versionado).
- Pruebas: **pytest 15** (sin fuga, particiones temporales, métricas, k determinista, frontera de escritura y rol de BD) y backend (plan, A/B, ciclo con un doble, 409 y servicio caído).

# Guía de defensa por fases (segundo parcial SI2)

Plataforma SaaS multi-tenant de e-commerce de moda. **Trama** es la marca de la plataforma y **VÉLORA** es una
tienda más (`/t/velora`). Fuente de verdad de cada fase: `docs/PARCIAL2_PLAN.md` y la guía de cada fase
citada abajo. Este documento no repite credenciales: se leen del `.env` local, que no está versionado.

## Stack y arranque local

| Pieza | Tecnología | Ubicación |
|---|---|---|
| Backend | NestJS + Drizzle sobre PostgreSQL | `apps/back` |
| Web | React + Vite (PWA, Dexie para offline) | `apps/front` |
| Móvil | Expo (expo-router, expo-sqlite) | `apps/mobile` |
| ML | Python (scikit-learn, pandas, FastAPI) | `apps/ml` |
| Contratos | Zod compartido web/móvil/back | `packages/contracts` |
| Migraciones | SQL `V1..V35` | `packages/database/migrations` |

```powershell
. .\scripts\load-env.ps1
pnpm build:packages
# BD: contenedor Docker velora-local-v25 (base velora_migrated_v25)
# Backend en 18080 (el 8080 lo ocupa otro proyecto en esta PC):
$env:PORT="18080"; $env:VELORA_PUBLIC_BACKEND_URL="http://127.0.0.1:18080"; $env:VELORA_AUTH_RATE_LIMIT_MAX_REQUESTS="10000"
pnpm dev:back
$env:VITE_API_BASE_URL="http://127.0.0.1:18080"; pnpm dev:front     # web en :5173
pnpm dev:ml                                                         # opcional, ML en 127.0.0.1:8090
# Demos (cada una sale con código 1 si algo falla):
$env:VELORA_DEMO_API_BASE="http://127.0.0.1:18080"; node scripts/demo-<x>.mjs
```

Demos disponibles: `demo-saas` (32), `demo-offline` (17), `demo-reportes` (16), `demo-ml` (13),
`demo-plataforma` (17), `demo-movil` (18), `demo-pagos` (25 comprobaciones). Si se encadenan varias,
el límite de login (429) se evita con `VELORA_AUTH_RATE_LIMIT_MAX_REQUESTS` alto.

Cuentas de muestra (por rol, contraseñas en el `.env`): cuenta propietaria de Urbano Boutique/Outlet (MAX),
de Andina Moda (PLUS) y de Primer Paso (FREE); dueño de Casa Montalvo + Ímpetu Sport (MAX, 2 empresas);
dueña de Solana (PLUS); cliente de pruebas de Trama; encargados por sucursal; y el PLATFORM_ADMIN del `.env`.

---

## Fase 1 — SaaS multi-tenant, marca por empresa y niveles de reportes

**Qué se hizo**
- Jerarquía propietario → empresa → sucursal → almacén; rol nuevo `PLATFORM_ADMIN`; ADMIN deja de ser global y pasa a ser propietario.
- Planes FREE / PLUS / MAX con límites (empresas 1/2/5, sucursales 1/3/10, productos 25/200/∞, probador 3/20/∞ por cliente/mes).
- Onboarding transaccional (`/planes`, `/crear-tienda`), Mi plan, cambio de plan con pago DEMO.
- Marca por empresa (logo, banner, paleta, tagline, contacto) filtrada por nivel; storefront en `/t/:slug`.
- Reportes por nivel BASIC / STANDARD / ADVANCED con widgets bloqueados y recorte de historial (30 / 365 días / completo).
- Descuento automático MAX por monto comprado en 12 meses (≥1500 Bs 5 %, ≥4000 Bs 10 %, ≥8000 Bs 15 %).
- Panel `/plataforma` para soporte (propietarios, tiendas, suscripciones, cambio de plan, transferencia de propiedad).

**Archivos y rutas clave**
- `apps/back/src/common/authz/tenant-scope.service.ts` (alcance único), `apps/back/src/plans/plan-limits.service.ts`, `plans/loyalty-discount.ts`.
- `apps/back/src/onboarding/`, `apps/back/src/companies/branding.service.ts`, `apps/back/src/platform/`, `apps/back/src/reports/report-widgets.ts`.
- `packages/contracts/src/{plans,onboarding,companies,branding,shared}.ts` (contraste AA compartido).
- Web: `/planes`, `/crear-tienda`, `/admin/mi-plan`, `/admin/empresas`, `/admin/marca`, `/plataforma`, `/t/:tenantSlug`.

**Endpoints**
- `GET /api/plans` · `GET /api/admin/plan` · `POST /api/admin/plan/change`.
- `GET /api/onboarding/slug-availability` · `POST /api/onboarding/store` · `POST /api/admin/companies`.
- `GET|PATCH /api/admin/companies/:companyId/branding` · `POST|DELETE .../branding/:asset` (logo, banner).
- `PUT /api/admin/stores/:storeId/manager` · `GET /api/companies/by-slug/:slug`.
- `GET /api/platform/{owners,companies,subscriptions}` · `POST /api/platform/owners/:ownerId/plan` · `PATCH /api/platform/subscriptions/:subscriptionId` · `PUT /api/platform/companies/:companyId/owner`.
- `GET admin|manager/reports/overview` (mismo endpoint, ahora con `tier`, `policy` y `locked[]`).

**Tablas y migraciones**
- V26 `saas_tenancy_foundation`: rol `PLATFORM_ADMIN`, `companies.owner_user_id`, `companies.slug`.
- V27 `one_manager_per_store`: índice único parcial de un encargado activo por sucursal.
- V28 `plans_and_subscriptions`: `plans`, `subscriptions`, seed de FREE/PLUS/MAX.
- V29 `company_branding_and_discounts`: `display_name`, `tagline`, `logo/banner_storage_key`, `brand_palette`, `contact`; `orders.discount_amount/discount_reason`.
- V30 `subscription_payments`: `payments.subscription_id` (pago de pedido XOR de suscripción).

**Decisiones y por qué**
- Alcance **siempre desde la BD**, no desde claims del JWT; recurso ajeno → 404 (no revela que existe).
- Plan por cuenta propietaria (D1); `subscriptions.company_id` deja la puerta a plan por empresa.
- Downgrade bloqueado con `409 PLAN_DOWNGRADE_EXCEEDS` (D2): el modo "solo lectura" exigía flags en todo el dominio.
- Suscripción vencida = límites FREE: se bloquea crear, nunca se borra ni oculta nada.
- Paleta y contacto como JSONB validado con Zod: relación 1:1 y no se consulta por campos.
- Marca filtrada por nivel **al leer**: si se baja de plan no se pierde lo configurado.
- `PaymentGateway` (Demo + adaptador Stripe) para no acoplar suscripciones a Stripe.

**Pruebas**
- `tenant-isolation.integration.test.ts`: suite A/B que exige un caso por cada ruta ADMIN enumerada por reflexión.
- `plan-limits.integration.test.ts`, `onboarding.integration.test.ts`, `branding.integration.test.ts`, `platform.integration.test.ts`, `migrations.integration.test.ts`, `loyalty-discount.test.ts`, `contracts/shared.test.ts`.
- `scripts/demo-saas.mjs`: 32 verificaciones (crea sus propios propietarios, no requiere credenciales).

**Limitaciones honestas**
- El cambio de plan de la Fase 1 usaba pago DEMO; el cobro real llegó en la Fase 5.
- Límites con posible carrera mitigada con `FOR UPDATE` sobre la suscripción, no con colas.
- El tema móvil se aplazó en esta fase (se completó en la 4C).

**Cómo demostrarlo en 3 minutos**
1. `node scripts/demo-saas.mjs` → 32 ✔ (límites `PLAN_LIMIT_*`, aislamiento, marca, widgets por nivel).
2. Web `/planes` → `/crear-tienda` (cuenta, empresa y marca, plan, pago DEMO).
3. Como propietaria PLUS (Andina): `/admin/mi-plan` con barras de uso; crear una 4.ª sucursal → `PLAN_LIMIT_STORES`.
4. `/admin/marca`: cambiar colores con vista previa y medición de contraste AA; abrir `/t/<slug>`.
5. `/admin/reportes` con FREE (Primer Paso) vs MAX (Urbano): tarjetas bloqueadas "Disponible en PLUS/MAX".
6. Como PLATFORM_ADMIN: `/plataforma` → cambiar el plan de un propietario; los límites cambian al instante.

---

## Fase 2 — Offline completo (web y móvil)

**Qué se hizo**
- Registro sin red de **clientes** y **productos** (con variantes, stock inicial y foto en web) por propietario o encargado.
- Una sola cola genérica (`syncOutbox` en Dexie / `sync_outbox` en SQLite) con estados PENDING/SYNCING/CONFLICT/FAILED y tope de 5 reintentos.
- Un único motor de sync, movido a `@velora/contracts` y compartido por web y móvil; también procesa las colas heredadas de pedidos y POS.
- Pull incremental con cursor y tombstones; centro de sincronización con resolución de conflictos.
- Service worker con caché de lectura del catálogo, empresas, planes e imágenes (NetworkFirst).

**Archivos y rutas clave**
- `apps/back/src/sync/{sync.controller,sync.service,sync.repository}.ts`.
- `packages/contracts/src/{sync,syncEngine}.ts` (+ `syncEngine.test.ts`).
- Web: `apps/front/src/core/offline/offlineDb.ts`, `core/sync/syncEngine.ts`, `features/sync/{SyncCenterPage,OfflineRegistryPage,SyncIndicator}.tsx`; rutas `/admin/sincronizacion`, `/sucursal/sincronizacion`, `/admin/registro`, `/sucursal/registro`.
- Móvil: `apps/mobile/src/core/sync/{syncDb,outboxRows}.ts`, grupo `(manager)` "Modo operaciones".

**Endpoints**
- `POST /api/sync/push` → por operación `APPLIED | DUPLICATE | CONFLICT | REJECTED`. Tipos `CUSTOMER_CREATE/UPDATE`, `PRODUCT_CREATE/UPDATE`.
- `GET /api/sync/pull?companyId=&since=&limit=` → `cursor`, `hasMore`, `changes`, `tombstones`.

**Tablas y migraciones**
- Heredadas: V12–V14 (idempotencia de POS y pedidos offline por `client_operation_id`).
- V31 `offline_customers_and_sync`: clientes sin acceso (email/contraseña nulos solo para CUSTOMER), `app_users.registered_company_id`, documento único por empresa, `version` por trigger en `products`, `product_variants`, `app_users`, `sync_changes` (alimentada por triggers, `tx_id xid8`) y `sync_operations`.

**Decisiones y por qué**
- Triggers alimentan `sync_changes`: cubren **todos** los caminos de escritura existentes sin tocar su código.
- Cursor por `xid8`: se entrega lo visible y el cursor queda en `xmin` → puede haber reenvíos idempotentes, nunca pérdidas.
- IDs generados en el cliente (UUID): la foto se sube después con el endpoint de assets existente.
- Unicidad (SKU, documento, email) → CONFLICT con `USE_EXISTING | ADJUST_AND_RETRY | DISCARD`; versión vieja → `VERSION_MISMATCH` con `KEEP_MINE | KEEP_SERVER`.
- Límite de plan → REJECTED `PLAN_LIMIT_*` (no es un conflicto que el usuario pueda resolver).
- Las colas antiguas de pedidos/POS no se migraron para no arriesgar datos ya encolados en dispositivos.

**Pruebas**
- `sync.integration.test.ts` (reenvío, conflictos, tombstones, aislamiento A/B) y `syncEngine.test.ts`.
- `scripts/demo-offline.mjs`: 17 verificaciones; crea su propia tienda FREE y usa el mismo motor que web/móvil.

**Limitaciones honestas**
- Fotos offline solo en web: en móvil requieren `expo-image-picker` y un nuevo build nativo.
- Edición offline solo de datos básicos de producto y cliente; precio de variantes y stock se editan en línea.
- El vínculo cliente offline ↔ cuenta se completa cuando el cliente se registra con el mismo email.

**Cómo demostrarlo en 3 minutos**
1. `node scripts/demo-offline.mjs` → 17 ✔ (cola, idempotencia, conflictos, versión, límite, tombstones).
2. Web como encargado → `/sucursal/sincronizacion`: indicador "Al día".
3. DevTools → Network → Offline: "Sin conexión". En `/sucursal/registro` registrar un cliente y un producto → "2 en cola".
4. Registrar otro cliente con un documento ya existente.
5. Quitar Offline: se sincroniza; el duplicado aparece como Conflicto `DOCUMENT_TAKEN` → "Ajustar y reintentar".
6. Móvil (emulador): modo avión en Modo operaciones, registrar, desactivar → la cola queda vacía.

---

## Fase 3 — Reportes dinámicos y exportación

**Qué se hizo**
- Historial sintético realista por HTTP real (10.986 pedidos jul-2025 → 21-oct-2026 en 5 empresas).
- Catálogo completo de widgets por nivel: STANDARD (cancelación, unidades, categorías, tipo de entrega, inventario crítico, período anterior) y ADVANCED (recompra, crecimiento, clientes nuevos, tendencia 12 meses, mapa de calor día × hora, comparativa de sucursales).
- Constructor dinámico con capa semántica de lista blanca (18 dimensiones, 12 medidas), definiciones guardadas.
- Exportación XLSX y PDF generada en el backend, del constructor y del resumen, con la marca de la tienda.

**Archivos y rutas clave**
- `apps/back/src/reports/report-widgets.ts`, `report-facts.ts` (definición única de venta neta).
- `apps/back/src/reports/builder/{semantic-layer,semantic-query.repository,report-builder.service,report-definitions.service}.ts`.
- `apps/back/src/reports/export/report-export.service.ts`.
- `packages/contracts/src/report-builder.ts` (`reportBuilderDefinitionSchema` `.strict()`).
- Web: `features/reports/{ReportsPage,ReportBuilderPage,HeatmapChart,LockedWidgets}.tsx`; rutas `/admin/reportes`, `/admin/reportes/constructor`, `/sucursal/reportes/constructor`.
- Datos: `scripts/seed-realistic-history.mjs`, `docs/DATOS_SINTETICOS.md`.

**Endpoints**
- `GET admin|manager/reports/overview` y `period-bounds` (con `previous` por KPI desde STANDARD).
- `GET admin|manager/reports/semantic-catalog` · `POST admin|manager/reports/query`.
- `POST admin|manager/reports/query/export?format=xlsx|pdf` · `GET admin|manager/reports/overview/export?format=…`.
- `GET|POST /api/admin/reports/definitions` · `PUT|DELETE /api/admin/reports/definitions/:id`.

**Tablas y migraciones**
- V32 `report_definitions`: `company_id`, `created_by`, `name` (único por empresa), `definition JSONB` con **solo identificadores** del catálogo (sin SQL).

**Decisiones y por qué**
- El navegador envía ids (`STORE`, `NET_SALES`…); el backend los traduce desde la lista blanca a SQL parametrizado. Un campo extra como `sql` da 400.
- Transacción de solo lectura, `statement_timeout` 10 s y tope de 500 filas.
- Venta neta = Σ cobros PAID/REFUNDED por `paid_at` − Σ reembolsos por `refunded_at`, por día de Bolivia (`America/La_Paz`); con dimensiones de producto se reparte por subtotal sin cambiar totales.
- `exceljs` + `pdfkit` (JS puro, sin Chromium); se descartó Puppeteer por memoria.
- FREE recibe 403 `PLAN_LIMIT_REPORT_FEATURE` en constructor/exportación; PLUS recorta a 365 días; Cliente, Hora, Día de la semana, Clientes nuevos/recurrentes son solo MAX.
- Datos: todo por la API real; la única escritura SQL reescribe **columnas de fecha**, con semilla fija 20251001.

**Pruebas**
- `report-builder-real-data.integration.test.ts` (9 combinaciones contra SQL de referencia), `report-builder.integration.test.ts`, `reports-phase3.integration.test.ts`, `report-widgets.test.ts`; A/B de las 8 rutas nuevas.
- `scripts/demo-reportes.mjs`: 16 verificaciones (MAX/PLUS/FREE, SQL de referencia, XLSX y PDF validados).

**Limitaciones honestas**
- El valor de inventario es la foto actual (sin fecha), solo combinable con sucursal y atributos de producto.
- PDF con fuentes estándar (WinAnsi), sin TTF incrustadas.
- El descuento de fidelidad aparece antes que en la vida real porque su ventana usa la fecha real de la corrida.

**Cómo demostrarlo en 3 minutos**
1. `node scripts/demo-reportes.mjs` → 16 ✔ (deja los archivos en `%TEMP%\velora-demo-reportes`).
2. Propietaria MAX de Urbano → `/admin/reportes`: widgets ADVANCED; pulsar **PDF** y **Excel**.
3. `/admin/reportes/constructor`: 12 meses, Mes × Sucursal, Venta neta + Pedidos pagados → tabla y líneas.
4. Cambiar a Categoría × Talla, filtrar Sucursal Equipetrol, "Comparar con el período anterior"; Guardar y reabrir.
5. Día de la semana × Hora → mapa de calor (solo MAX).
6. PLUS (Andina): candados MAX y nota de recorte a 365 días. FREE (Primer Paso): constructor bloqueado.

---

## Fase 4 — Machine Learning local (solo MAX)

**Qué se hizo**
- Servicio Python `apps/ml` (CLI + FastAPI en `127.0.0.1:8090` con token) que entrena 4 modelos **por empresa**:
  - S1 `SALES_FORECAST` (regresión, venta neta diaria y pronóstico a 30 días con banda del 80 %);
  - S2 `CANCEL_RISK` (clasificación de pedidos ECOMMERCE, puntuados al checkout);
  - U1 `CUSTOMER_SEGMENTS` (RFM + KMeans, proyección PCA);
  - U2 `SALES_ANOMALIES` (z robusto con MAD sobre residuos, explicado con el calendario).
- Dashboard `/admin/ml` ("Inteligencia") con 4 pestañas y "Entrenar de nuevo".

**Archivos y rutas clave**
- `apps/ml/velora_ml/{api,runner,data,db,calendar}.py`, `models/{forecast,cancel_risk,segments,anomalies}.py`, `apps/ml/tests/`.
- `scripts/ml.mjs` (resuelve el Python del venv); scripts `pnpm ml:setup|dev:ml|ml:train|ml:test|ml:db-role`.
- `apps/back/src/ml/{ml.controller,ml.service,ml-client,ml.repository}.ts`; `packages/contracts/src/ml.ts`; web `features/ml/`.
- Defensa detallada: `docs/ML_MODELOS.md`; guía: `docs/FASE4_DEMO_ML.md`.

**Endpoints** (`/api/admin/ml/*`, ADMIN y PLATFORM_ADMIN, `?companyId=`)
- `GET overview` · `POST runs` (202 `{runIds}`, 409 si hay corrida activa) · `GET runs/:id`.
- `GET forecast` · `GET segments` · `GET cancel-risk` · `GET anomalies`.
- FREE/PLUS → 403 `PLAN_LIMIT_REPORT_FEATURE`; servicio caído → `POST runs` 503 `ML_SERVICE_UNAVAILABLE`.

**Tablas y migraciones**
- V33 `ml_foundation`: `ml_runs` (estado QUEUED/RUNNING/SUCCEEDED/FAILED/INSUFFICIENT_DATA, métricas JSONB), `ml_forecasts`, `ml_customer_segments`, `ml_anomalies`, `ml_order_risk` (todas con `company_id` y `run_id` en cascada).

**Decisiones y por qué**
- Python **lee** tablas operativas y **escribe solo `ml_*`**: rol `velora_ml` de mínimo privilegio + `db.assert_ml_table`.
- Validación temporal (nunca aleatoria): S1 walk-forward con 3 pliegues de 30 días y prueba final de 90; S2 partición 80/20 con umbral elegido en validación.
- Cada modelo se compara con referencias (ingenuo, estacional 7 días, media 28 días; clase mayoritaria y logística).
- S2 sin fuga: la consulta no lee `cancelled_at`, `paid_at`, `fulfilled_at` ni estado del pago (probado).
- U1: regla de elección de k fijada **antes** de compararla con lo sembrado (codo estable con silhouette ≥ 90 % de la mejor).
- Sin TensorFlow/torch/prophet; semillas fijas (`random_state = 42`); se guardan las últimas 5 corridas.

**Pruebas**
- pytest en `apps/ml/tests` (15 en la Fase 4; hoy 16 con la de calibración): sin fuga, particiones temporales, k determinista, frontera de escritura.
- `ml.integration.test.ts` (plan, A/B, ciclo con un doble del cliente ML, 409 y servicio caído).
- `scripts/demo-ml.mjs`: 13 verificaciones con entrenamiento real; la venta real del backtest coincide con el SQL de referencia.

**Limitaciones honestas**
- sMAPE alto (36–44 %): venta diaria de tienda pequeña muy ruidosa; S1 mejora 3–13 % sobre la mejor referencia.
- S2 tiene AUC bajo (regla sembrada débil); en VÉLORA la logística gana en PR-AUC y se muestran ambos.
- U2 en la versión original detectaba solo 2 de 5 fechas fuertes en Urbano (Black Friday no llegaba al umbral).
- Un entrenamiento a la vez; ~25 s por empresa.

**Cómo demostrarlo en 3 minutos**
1. `pnpm dev:ml` y `node scripts/demo-ml.mjs` → 13 ✔.
2. Propietaria MAX de Urbano → `/admin/ml` → "Entrenar de nuevo": En cola → Entrenando → Listo.
3. Pronóstico: real vs predicho con banda; tabla modelo vs 3 referencias; importancias.
4. Segmentos: mapa PCA, tarjetas Leales / En riesgo / Ocasionales / Una sola compra, tabla de elección de k.
5. Riesgo: ROC-AUC/PR-AUC vs referencias, matriz de confusión; explicar el momento de puntuación (checkout).
6. Con PLUS: "Disponible en MAX". Detener `dev:ml` y recargar: se ven los resultados guardados con aviso.

---

## Fase 4B — Plataforma Trama, entrada neutral y tiendas nuevas

**Qué se hizo**
- **Trama** pasa a ser la marca de la plataforma; `/` es el login neutral (sin fotos de tiendas ni VÉLORA). VÉLORA queda en `/t/velora`.
- Directorio público `/tiendas` (buscador y segmento), selector `/elegir-empresa`, redirección por rol `postLoginPath`.
- Tres tiendas nuevas por el flujo HTTP real: Casa Montalvo e Ímpetu Sport (un mismo dueño, MAX) y Solana (PLUS), con ilustraciones, logos y banners; 1.370 pedidos en 90 días.
- Móvil mínimo con marca Trama y selector de tienda desde el directorio.

**Archivos y rutas clave**
- `apps/back/src/companies/branding.controller.ts` (directorio), `packages/contracts/src/{companies,branding}.ts`.
- Web: `features/platform-entry/{DirectoryPage,ChooseCompanyPage}.tsx`, `shared/platform/PlatformBrand.tsx`, `styles/platform.css` (`[data-platform]`).
- Scripts: `scripts/seed-new-stores.mjs` (`--verify`, `--resume`, `--only`), `scripts/demo-plataforma.mjs`.
- Guía: `docs/FASE4B_PLATAFORMA.md`.

**Endpoints**
- `GET /api/companies/directory?q=&segment=` (público, solo campos de marca: nombre, slug, logo, banner, tagline, segmento, paleta).
- `PATCH /api/admin/companies/:companyId/branding` acepta `segment`.
- `/elegir-empresa` combina `GET /api/admin/companies`, `GET /api/admin/plan` y `GET /api/admin/stores`.

**Tablas y migraciones**
- V34 `company_directory`: `companies.listed` (false para `demo-%`), `companies.segment` (MUJER/HOMBRE/DEPORTIVA/INFANTIL/UNISEX), índice parcial `idx_companies_directory`.

**Decisiones y por qué**
- Separar marca de plataforma y de tienda: un SaaS no puede tener una tienda "por defecto"; se eliminó el fallback a VÉLORA (env, autoselección, títulos, manifest).
- Directorio público que **no** expone propietario, contacto privado, plan ni conteos.
- `segment` se agregó porque el filtro lo necesitaba y no existía.
- Tiendas creadas por la API real (no SQL) para que pasen por límites, marca y provisión.

**Pruebas**
- `directory.integration.test.ts` (datos privados, exclusión de demos e inactivas, búsqueda, A/B); 7 pruebas web y 3 móviles nuevas.
- `seed-new-stores.mjs --verify`: 19 verificaciones. `scripts/demo-plataforma.mjs`: 17 verificaciones.

**Limitaciones honestas**
- Solana (PLUS, `FULL_PALETTE`) no muestra tagline, banner ni contacto: lo impone su plan.
- El arte de prendas llevó 2 iteraciones; 9 imágenes se repararon en el almacenamiento local (`--repair-art`) porque no existe un endpoint para borrar imágenes.

**Cómo demostrarlo en 3 minutos**
1. `node scripts/demo-plataforma.mjs` → 17 ✔.
2. `/`: login de Trama, "Crear cuenta" (cliente o abrir tienda) y "Ver planes".
3. `/tiendas`: buscar y filtrar; entrar a `/t/casa-montalvo`, Ímpetu Sport, Solana y `/t/velora`.
4. Dueño con 2 empresas → `/elegir-empresa` → "Entrar"; "Cambiar de empresa" en el menú.
5. Dueña PLUS → directo a `/admin`; Inteligencia con candado MAX.
6. Encargado → directo a `/sucursal`; PLATFORM_ADMIN → `/plataforma` con todas las tiendas.

---

## Fase 4C — Experiencia de uso web y móvil completo

**Qué se hizo**
- Auditoría web `docs/UX_AUDIT.md`: 8 P1 y 15 P2 corregidos (sesión expirada, vuelta a la ruta pedida, logout que limpia empresa, menú hamburguesa, paginación, filtros en URL, `Bs 1.234,50`, fechas `dd/mm/aaaa`, textos en español, accesibilidad de diálogos y formularios).
- Los 7 P3 se cerraron después, en la Parte B (toasts, esqueletos, selector de empresa con logo, tablas como tarjetas en pantallas angostas, catálogo/POS con filtros en URL).
- Móvil completo: ThemeProvider por tienda, cliente completo (catálogo, detalle con disponibilidad, bolsa, checkout, pedidos, probador) y panel de propietario y encargado (resumen por plan, pedidos, inventario, catálogo, sucursales, mi plan).

**Archivos y rutas clave**
- `packages/contracts/src/{navigation,format}.ts` (redirecciones y formatos compartidos web/móvil, con pruebas).
- Web: `apps/front/src/shared/layout/Shells.tsx`, `app/RouteGuards.tsx`, `styles/usability.css`, `core/api/apiClient.ts`.
- Móvil: `apps/mobile/src/shared/theme/{tokens,ThemeProvider,makeStyles}.ts(x)`; rutas en `apps/mobile/src/app/` con grupos `(customer)`, `(owner)`, `(manager)`, más `stores.tsx` y `platform-only.tsx`.
- Guía: `docs/FASE4C_UX_MOVIL.md`.

**Endpoints**
- Único nuevo (aditivo): `GET /api/catalog/products/:id/availability?companyId=` → solo nivel `IN_STOCK | LOW | OUT` por variante.
- El resto del panel móvil consume los mismos endpoints de la web (`admin/plan`, `admin/stores`, `admin/reports/overview`, pedidos, inventario, catálogo).

**Tablas y migraciones**
- Ninguna migración nueva (se usan las existentes hasta V34).

**Decisiones y por qué**
- Lógica de navegación y formatos como funciones puras en contratos: una sola regla para web y móvil, probada.
- Disponibilidad pública devuelve solo el nivel, nunca la cantidad exacta (no filtra datos de inventario).
- Móvil sin crear empresas, editar marca, constructor, exportación, ML ni mejorar plan: se remite a la web.
- Gráficos móviles con `View` (sin agregar `react-native-svg`).

**Pruebas**
- `availability.integration.test.ts` (con A/B); `navigation.test.ts`, `format.test.ts` (13 pruebas nuevas en contracts), 5 en el front.
- Móvil: tema AA, derivados, redirección, sin literal "VÉLORA" y sin hexadecimales fuera de `shared/theme/`.
- `scripts/demo-movil.mjs`: 18 verificaciones (no modifica datos).

**Limitaciones honestas**
- El propietario no tiene endpoint de cancelación de pedidos (ni en web): se ofrece reembolsar antes de entregar.
- Descuento por compras y cuota del probador se **estiman** en el móvil con la misma regla del backend; el monto real lo fija el backend.
- La revisión visual se hizo por código y pruebas, sin capturas.

**Cómo demostrarlo en 3 minutos**
1. `node scripts/demo-movil.mjs` → 18 ✔.
2. Web en ventana < 1000 px como dueño con 2 empresas: menú hamburguesa y vuelta a la sección pedida.
3. `/admin/pedidos` e `/admin/inventario`: filtros en la URL (atrás los conserva), paginación, formatos es-BO.
4. Emulador (`EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:18080`, `pnpm dev:mobile`): login Trama → `/stores` → Casa Montalvo: toda la app toma su color; tallas agotadas en el detalle.
5. Como dueño: Mis empresas → Resumen → Pedidos → Inventario; cambiar a Ímpetu Sport cambia el tema.
6. Como dueña PLUS: widgets "Disponible en MAX"; como PLATFORM_ADMIN: aviso para usar la web.

---

## Tema por tienda (mejora transversal)

**Qué se hizo**
- La web aplica en **todo el documento** (incluida la barra lateral del panel, modales y gráficos) el tema derivado de los 4 colores de cada tienda.
- Ningún color fijo fuera de los tokens; paletas de muestra con identidad propia; editor de marca con vista previa completa y 8 paletas sugeridas.
- Logos y banners geométricos regenerados con las paletas vigentes.
- Paquete para compartir la BD con un compañero (`docs/COMPARTIR_BD.md`).

**Archivos y rutas clave**
- `packages/contracts/src/theme.ts` (`deriveTheme`) + `theme.test.ts`; `branding.ts` (`resolveBrandPalette`, `deriveAccentShades`, `contrastRatio`).
- Web: `apps/front/src/shared/brand/ThemeScope.tsx`, `core/theme/themeScope.ts`, `features/saas/BrandEditorPage.tsx`, `test/noHardcodedColors.test.ts`.
- Scripts: `scripts/verify-theme.mjs`, `scripts/brand-assets-final.mjs`, `scripts/backup-local.ps1`, `scripts/restore-local.ps1`.
- Documentación: `docs/TEMA_WEB.md` (auditoría y causa raíz), `docs/TEMA_PALETAS.md` (tokens y contrastes).

**Endpoints**
- Sin endpoints nuevos: las paletas se cambiaron con `PATCH /api/admin/companies/:companyId/branding` usando la cuenta de cada dueño, respetando el nivel de marca.

**Tablas y migraciones**
- Ninguna: usa `companies.brand_palette` (V29).

**Decisiones y por qué**
- Causa raíz: el tema solo envolvía las shells públicas y de cliente, solo 7 variables se sobrescribían y FREE heredaba el fondo de VÉLORA.
- `deriveTheme` en contratos (una sola función para web y móvil) y `ThemeScope` sobre `document.documentElement` según ámbito (tienda en `/t/:slug`, cliente y `/admin`; Trama en plataforma).
- FREE (solo acento) deriva fondo, texto y primario desde el matiz del acento.
- Contraste: texto ≥ 4,5:1 (AA); indicadores y series de gráficos ≥ 3:1 (WCAG 1.4.11).
- Regla de diversidad: acentos y barras de tiendas distintas separados ≥ 40° de matiz.

**Pruebas**
- `theme.test.ts`, `branding.test.ts` (contratos); `noHardcodedColors.test.ts` impide que vuelvan los colores fijos.
- `node scripts/verify-theme.mjs`: AA y diversidad de todas las tiendas.

**Limitaciones honestas**
- Las cuatro tiendas conservadas (VÉLORA, Casa Montalvo, Ímpetu Sport, Solana) ya tenían acentos cercanos; entre esos pares la regla de 40° no se cumple y `verify-theme` lo informa como aviso.
- Sin modo oscuro por tienda (decisión D5): las superficies oscuras usan el `--ink` de la empresa.

**Cómo demostrarlo en 3 minutos**
1. `node scripts/verify-theme.mjs` → AA y diversidad.
2. Abrir `/t/urbano-boutique` y luego `/t/andina-moda`: cambia todo el documento sin parpadeo de la marca anterior.
3. Entrar al panel `/admin` de Urbano: barra lateral, gráficos y botones con su paleta.
4. `/admin/marca`: elegir una de las 8 paletas sugeridas, ver la vista previa completa y la medición AA.
5. Con FREE (Primer Paso): cambiar solo el acento y ver el resto derivado.
6. Volver a `/` o `/plataforma`: vuelve la marca Trama.

---

## Fase 5 — Pagos: Stripe, QR DEMO y transferencia

**Qué se hizo**
- Pago de **planes** por tres métodos (Tarjeta/Stripe Checkout, QR, Transferencia) desde Mi plan; el plan cambia **solo** cuando el pago llega a PAID (idempotente y auditado); renovación del mismo plan suma 30 días al vencimiento; recibo PDF.
- Pago de **pedidos** por QR DEMO firmado (web y móvil), que se confirma solo y cuenta como QR en el reporte "Cobros por método".
- Transferencia con comprobante y cola de revisión de la plataforma (aprobar / rechazar con motivo / reenviar); la transferencia muestra el QR estático de la cuenta de cobro.
- Adaptador bancario OPENBCB/BCP como esqueleto, probado contra un servidor simulado.

**Archivos y rutas clave**
- `apps/back/src/billing/qr/{qr-gateway,qr-image,bank-qr.gateway}.ts`, `billing/qr-charge.service.ts`, `billing/payment-settlement.service.ts`, `billing/public-qr.controller.ts`, `billing/order-qr.service.ts`.
- `apps/back/src/plan-payments/{plan-payments.service,platform-billing.service,plan-receipt}.ts`.
- Web: `features/payments/{QrPaymentPanel,DemoBankPage,StripeReturnPage}.tsx`, `features/saas/PlanPayments.tsx`; rutas `/admin/mi-plan`, `/pagar/qr/:reference`, `/pago/stripe/retorno`, `/plataforma/cobros`, `/plataforma/pagos`.
- `scripts/stripe-listener.ps1`, `scripts/demo-pagos.mjs`; guía `docs/FASE5_PAGOS.md`.

**Endpoints**
- `GET /api/admin/plan/payment-options` · `POST|GET /api/admin/plan/payments` · `GET .../payments/:paymentId`.
- `POST .../payments/:paymentId/transfer-proof` · `POST .../payments/:paymentId/cancel` · `GET .../payments/:paymentId/receipt`.
- `POST /api/customer/orders/:orderId/payments/qr` · `GET /api/customer/payments/:paymentId/qr`.
- Público con token: `GET /api/pay/qr/:reference?t=` · `POST /api/pay/qr/:reference/confirm` · `POST .../cancel`.
- `GET|PUT /api/platform/billing-settings` · `POST|DELETE .../qr-image` · `GET /api/platform/payments` · `POST /api/platform/payments/:paymentId/review`.
- `GET /api/billing/payments/:paymentId/proof` · `GET /api/billing/transfer-qr/:storageKey`.
- Stripe: webhook `/api/payments/stripe/webhook` (revalida la sesión contra la API antes de activar un plan).

**Tablas y migraciones**
- V35 `payments_qr_transfer`: método `TRANSFER`, estados `PENDING_REVIEW` y `EXPIRED`, `payments.plan_id`, `payments.payment_reference`, tablas `qr_charges`, `platform_billing_settings` (semilla rotulada como datos de ejemplo) y `payment_transfer_proofs`.
- Base previa: V9 (pagos), V17 (Stripe), V30 (pago de suscripción).

**Decisiones y por qué**
- Un solo punto de liquidación (`PaymentSettlementService.markPaid`, `FOR UPDATE`, idempotente) para QR, Stripe y transferencia.
- QR DEMO: enlace firmado con HMAC a la pantalla "Banco demo", token de un solo uso (hash SHA-256, comparación en tiempo constante), vence a los 10 min (perezoso) y límite de intentos por IP → 403/410/429.
- Stripe confirma por webhook firmado **o** al consultar un pago PENDING (funciona en local sin URL pública). Monto siempre del servidor.
- No se inventó ningún endpoint bancario: sin documentación oficial, `OPENBCB/BCP` responde 503 `QR_PROVIDER_NOT_READY`.
- Pagos de plan nunca cuentan como ventas (los reportes unen `payments` con `orders`).

**Pruebas**
- `billing/qr/qr.test.ts`, `billing/qr/bank-qr.gateway.test.ts`.
- `qr-payments.integration.test.ts` (idempotencia, 403/410/429, monto alterado, vencimiento, aislamiento, reporte).
- `plan-payments.integration.test.ts` (3 métodos, plan solo en PAID, +30 días, PDF, transferencia 415/413/rechazo/reenvío, Stripe con doble HTTP).
- A/B: 8 rutas nuevas en `tenant-isolation.integration.test.ts`. `scripts/demo-pagos.mjs`: 25 comprobaciones.

**Limitaciones honestas**
- El QR es DEMO: no mueve dinero. En un QR real cada tienda necesitaría su propio convenio; en la demo todo cobro QR va a la cuenta de la plataforma.
- El límite de intentos del Banco demo es en memoria (por proceso).
- Un QR vencido que nadie consulta sigue PENDING en la BD hasta la siguiente lectura (no afecta cifras: los reportes cuentan PAID).
- El POS sigue registrando QR manual; `POST /api/admin/plan/change` con tarjeta DEMO se conserva para `/crear-tienda` y `demo-saas`.
- Stripe en modo test; sin clave vigente la tarjeta aparece "no configurada".

**Cómo demostrarlo en 3 minutos**
1. `node scripts/demo-pagos.mjs` → 25 ✔ (usa su propia tienda `demo-pagos`, oculta del directorio).
2. Web como cliente: Checkout → "Pagar ahora con QR" → Mis pedidos con cuenta regresiva → "Abrir el Banco demo" → Pagar → Pagado.
3. Propietario: `/admin/mi-plan` → Mejorar → QR (paga en el Banco demo) o Transferencia (subir comprobante).
4. PLATFORM_ADMIN: `/plataforma/pagos` → ver comprobante → Rechazar con motivo → el propietario reenvía → Aprobar.
5. Mi plan: plan activo y recibo PDF en el historial; `/admin/reportes` muestra el pago del pedido como QR.

---

## Datos finales (Parte B: `seed-final-history.mjs` e iteración ML)

**Qué se hizo**
- Historial final para la defensa por el **mismo flujo HTTP real** (carrito, pedido, pago, confirmación, entrega/cancelación, POS con caja, reposición `ENTRY`); la única escritura SQL reescribe **fechas** (nunca montos, estados ni stock). Semilla 20261111, reanudable.
- VÉLORA: retroceso 2024-11-11 → 2025-05-31 (sin días vacíos desde el 2024-11-11, sin tocar pedidos existentes).
- Casa Montalvo e Ímpetu Sport: retroceso 2026-05-10 → 2026-07-22. Solana: sus 451 pedidos se **re-fechan** al tramo 12-oct → ayer con crecimiento semanal ~10 % y ticket creciente.
- Urbano Boutique, Urbano Outlet y Andina continúan desde su ritmo real de 28 días; Primer Paso (FREE) continúa.
- ML Parte B: reentrenamiento de las 5 tiendas MAX con **una sola iteración declarada**: S2 calibrado con Platt en la validación temporal; U2 sobre **pedidos por día** en vez de venta en Bs.

**Archivos y rutas clave**
- `scripts/seed-final-history.mjs` (`--dry-run`, `--resume`, `--only <slug>`, `--until AAAA-MM-DD`, `--verify`); progreso en `scripts/.seed-progress/` (no versionado).
- `apps/ml/velora_ml/models/{cancel_risk,anomalies}.py`, `apps/ml/tests/test_calibration.py`.
- Documentación: `docs/DATOS_SINTETICOS.md` (sección Parte B) y `docs/ML_MODELOS.md` (Parte B).

**Endpoints**
- Ninguno nuevo; el generador usa los endpoints públicos, de cliente, de POS y de operaciones existentes. El reentrenamiento usa `pnpm ml:train -- --company <slug>` o `POST /api/admin/ml/runs`.

**Tablas y migraciones**
- Sin migraciones. Escribe en las tablas operativas por la API y en `ml_*` vía el servicio ML.

**Decisiones y por qué**
- Solo fechas por SQL, con `session_replication_role = replica`, para no disparar triggers de versión ni el cursor de sync.
- Día en curso: solo se ejecutan pedidos cuya hora ya pasó; nunca hay pedidos en el futuro.
- Altas coherentes: empresa, sucursales, catálogo, stock y cuentas con fecha ≤ primer pedido.
- ML: calibración monótona (ROC/PR-AUC no cambian; solo vuelve interpretables las probabilidades). No se ajustaron umbrales mirando las fechas sembradas.

**Pruebas**
- `--verify` (29-oct-2026): 0 días vacíos, 0 stock negativo, 0 totales incoherentes, 0 pedidos cruzados entre empresas, 0 pedidos en el futuro; 1 pago incoherente (pedido original de VÉLORA del 30-ago-2026, previo al generador, no se modificó).
- `test_platt_keeps_order_and_lowers_brier` (pytest).

**Limitaciones honestas**
- VÉLORA ene–may 2025 casi plana (~1,4 pedidos/día): el mínimo de un pedido diario domina sobre el 4 %/mes de una base tan baja.
- Calibración: Brier baja entre 20 % y 62 % en las 5 tiendas, pero el AUC no mejora; Montalvo e Ímpetu ≈ 0,50 (no superan al azar).
- Anomalías por pedidos: Urbano Boutique pasa a 4 de 5 fechas fuertes con 1 falso positivo, pero en tiendas de 2–4 pedidos diarios (VÉLORA, Outlet) aumentan los días sin explicación; no se ocultó.
- Casa Montalvo e Ímpetu sin pronóstico (menos de 300 días de historia: regla del modelo).
- El servicio ML que corría antes del cambio debe reiniciarse (`pnpm dev:ml`) para que "Entrenar de nuevo" use el código nuevo.

**Cómo demostrarlo en 3 minutos**
1. `node scripts/seed-final-history.mjs --verify` → tabla de comprobaciones y conteos por tienda.
2. `/admin/reportes/constructor` en VÉLORA: Mes × Venta neta desde nov-2024, sin huecos.
3. Solana (`/admin/reportes` de su dueña): crecimiento semanal y ticket creciente desde el 12-oct.
4. `/admin/ml` de Urbano Boutique → Riesgo: Brier calibrado; Anomalías: 4 de 5 fechas fuertes explicadas.
5. Mostrar en `docs/ML_MODELOS.md` la tabla "antes → después" de la iteración declarada.

---

## Preguntas probables y respuesta corta

1. **¿Cómo garantizan que un dueño no vea datos de otro?** `TenantScopeService` resuelve el alcance desde la BD en cada request; lo ajeno da 404; una suite A/B exige un caso por cada ruta ADMIN.
2. **¿Por qué una sola BD y no una por tenant?** Escala de examen, migraciones únicas y `company_id` en todo el dominio con pruebas de aislamiento; evita duplicar esquema.
3. **¿Qué pasa si vence la suscripción?** Pasa a límites FREE: se bloquea crear, nunca se borra ni oculta lo existente.
4. **¿Cómo se resuelven conflictos offline?** El servidor responde CONFLICT con opciones (usar existente, ajustar y reintentar, descartar; o conservar mío/servidor si es versión); los límites de plan son REJECTED.
5. **¿Se puede perder un cambio en el pull?** No: el cursor `xid8` se queda en `xmin`; puede reenviar, y el cliente es idempotente.
6. **¿El constructor permite inyección SQL?** No: solo viajan ids de una lista blanca, SQL parametrizado, transacción de solo lectura, 10 s y 500 filas.
7. **¿Cómo validaron el ML sin fuga?** Particiones temporales, referencias simples, y pruebas que verifican que la consulta de S2 no lee columnas posteriores al checkout.
8. **¿Por qué el AUC de cancelación es bajo?** La regla sembrada es débil; se reporta tal cual y se calibró para que las probabilidades sean interpretables.
9. **¿El QR es real?** Es DEMO firmado con HMAC; el adaptador bancario existe como esqueleto y no se inventó ningún endpoint sin la documentación oficial.
10. **¿Cómo evitan doble activación de un plan?** `markPaid` con `FOR UPDATE` e idempotencia: un pago ya PAID no vuelve a activar.
11. **¿Los datos son inventados por SQL?** No: todo se crea por la API real; el SQL solo reescribe fechas.
12. **¿Cómo se asegura el contraste con colores de cada tienda?** `deriveTheme` y `contrastRatio` en contratos, validación AA en front y back, y `verify-theme.mjs`.

---

## Pendiente

1. Tramo final de datos al 11-nov: `node scripts/seed-final-history.mjs --until 2026-11-11 --resume`.
2. Banco real (QR OPENBCB/BCP) pendiente de documentación oficial (`docs/bank-api/FALTA.md`).
3. Stripe: la clave de prueba del `.env` local está vencida y la tarjeta aparece "no configurada" hasta reemplazarla y correr `scripts/stripe-listener.ps1`.

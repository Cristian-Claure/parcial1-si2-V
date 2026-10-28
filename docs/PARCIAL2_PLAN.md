# Segundo parcial SI2 — Plan (Fase 1: SaaS multi-tenant, marca por empresa y niveles de reportes)

> Estado: **propuesta pendiente de aprobación**. Este documento no modifica código.
> Base: `main` @ V25 (Postgres local `velora-local-v25`, puerto 55433).

## 0. Decisiones ya tomadas

- Se conserva el 100% de lo existente y se evoluciona. Una sola base de datos, migraciones **V26+**, sin tablas duplicadas.
- No se escribe documentación ICONIX por ahora.
- El pago por QR queda para la **Fase 5**. Mientras tanto, las suscripciones usan un gateway **DEMO**.
- Offline completo (Fase 2), reportes dinámicos (Fase 3) e historial realista con ML local en Python (Fase 4).
- Cada fase tiene su rama y un PR con merge commit, y pasa `pnpm typecheck && pnpm lint && pnpm test`.

---

## 1. Hallazgos de la auditoría (con evidencia)

| Área | Estado actual | Implicación para la Fase 1 |
|---|---|---|
| **Tenencia** | `companies` existe desde V24 (`code`, `name`, `description`, `active`). VÉLORA tiene id fijo `10000000-…-0001`. `stores`, `categories` y `products` tienen `company_id NOT NULL`. V25 agrega `uq_stores_id_company`, `shopping_carts.company_id/store_id` y un carrito activo por (usuario, empresa). | La jerarquía empresa → sucursal → almacén **ya existe**. Falta el **propietario** y la marca. `companies` no tiene `slug`; `code` sirve como semilla para generarlo. |
| **Roles** | `app_users.role ∈ {ADMIN, STORE_MANAGER, CUSTOMER}` (CHECK en V1). Un STORE_MANAGER requiere `store_id` (`ck… role <> 'STORE_MANAGER' OR store_id IS NOT NULL`). | Hay que ampliar el CHECK con `PLATFORM_ADMIN`. El encargado ya está ligado a una sola sucursal mediante `app_users.store_id`, así que la relación es N:1 y no hace falta otra tabla. |
| **Alcance admin** | `AccessContextService.resolve()` (`common/authz`) solo resuelve la empresa del STORE_MANAGER. Para ADMIN devuelve `companyId: null` y cada endpoint recibe `?companyId=` sin validar a quién pertenece. Las comprobaciones `role === "ADMIN"` están repartidas en `reports.service.ts:612`, `payments.service.ts:406`, `inventory.service.ts:478`, `order-operations.service.ts:54`, `commerce-operations.service.ts:19` y `catalog-assets.service.ts:142`. `GET /api/admin/companies` lista **todas** las empresas. | Hoy ADMIN es un superusuario global. Cada servicio tiene su propio `resolveScope` (por ejemplo, el de reports). Ese es el punto que se centraliza en la Fase 1. |
| **Superficie admin** | Controladores con rutas `ADMIN`: `admin/users/managers`, `admin/audit`, `admin/companies`, `admin/stores`, `admin/reports/*` (5), `pos` (4), `commerce-operations`, `order-operations`, `payment-operations`, `catalog/manage/*`, `inventory/*`. | Esta es la lista exacta que debe cubrir la prueba de aislamiento A/B. |
| **Pagos** | `payments.order_id NOT NULL`, `method ∈ {COD, CASH, CARD, WEB, QR}` y `provider`/`external_reference` (índice único en V17). Stripe es una clase concreta (`StripeGatewayService`). **No existe una interfaz `PaymentGateway`.** | La "abstracción actual" es la tabla `payments` más el servicio, no una interfaz. Propuesta: crear `PaymentGateway` con dos implementaciones, `StripeGateway` (que envuelve la actual) y `DemoGateway`, y permitir que `payments` cubra suscripciones (ver §2). |
| **Totales de órdenes** | `orders.subtotal` y `orders.total` con `ck_orders_totals`. `order_items.subtotal`. **No hay columna de descuento.** | Añadir el mínimo: `discount_amount` y `discount_reason` en `orders`, con el CHECK `total = subtotal - discount_amount`. |
| **Try-on** | `try_on_jobs(user_id, product_id, …, status, created_at)` sin `company_id`. Proveedores `LOCAL`/`REPLICATE`. Solo hay límites de bytes (`VELORA_TRYON_*_MAX_BYTES`) y no hay cuotas. | La cuota por cliente, empresa y mes se calcula con `try_on_jobs ⋈ products.company_id`, sin columna nueva. Solo se agrega el índice `(user_id, created_at)`. |
| **Assets** | `ManagedAssetStorageService.store(bytes, contentType) → {storageKey}` con la clave `uuid.(jpg\|png\|webp)` y proveedor LOCAL o Azure Blob. `product_images.storage_key` es único. Se sirve en `/api/catalog/assets/:key`. | Logo y banner se guardan como `storage_key` en `companies` (`logo_storage_key`, `banner_storage_key`), igual que en `product_images`. No hace falta una tabla de assets nueva. |
| **Reportes** | `reportOverviewSchema = {title, scopeLabel, from, to, kpis[], charts[], tables[], deterministicInsights[]}`. Endpoints `admin\|manager/reports/{period-bounds, overview, ai-query, ai-narrative, voice-transcribe}`. `reports.service.ts` tiene unas 2100 líneas. | KPIs y gráficos ya son arreglos sin ids estables. El contrato de widgets agrega `id` y `minTier` a cada elemento y un arreglo `locked[]`, **sobre el mismo endpoint**. |
| **Front: marca** | Los tokens están en `:root` de `styles/global.css` (`--paper`, `--ink`, `--accent`, `--accent-deep`, `--accent-soft`, …). `shared/brand/Brand.tsx` (41 líneas) tiene "VÉLORA" y el logo fijos. `core/company/companyStore.ts` ya maneja `storefrontCompanyId` y `adminCompanyId` (en localStorage) y un selector. | El theming por empresa cabe sobrescribiendo variables en `[data-tenant]`. El store de empresas ya existe y solo hay que alimentarlo. |
| **Móvil** | `apps/mobile/src/shared/theme.ts` define `colors` como constante y 12 archivos lo importan. | Ver §4.4: se aplaza el ThemeContext. |
| **Datos locales** | La base local V25 tiene 1 empresa (VÉLORA), 0 usuarios, 0 sucursales y 0 órdenes. El admin se crea al arrancar (`bootstrap/admin-bootstrap.service.ts`, variables `BOOTSTRAP_ADMIN_*`). | **No hay encargados duplicados que limpiar en local**, pero la migración debe tolerar datos reales (ver backfill §2.3). Además, la migración **no puede suponer que existe un ADMIN**. |

**Veredicto sobre el modelo propuesto:** el código lo confirma.

- `companies.owner_user_id` es suficiente porque no hay membresías y el encargado ya es N:1 con la sucursal.
- Hay un matiz: ADMIN hoy es global, así que el cambio de semántica (ADMIN pasa a ser solo propietario) afecta a los 6 servicios citados. El servicio central de alcance es obligatorio, no opcional.

---

## 2. Esquema de la Fase 1 (migraciones V26+)

### V26 — `saas_tenancy_foundation`

```sql
-- Roles
ALTER TABLE app_users DROP CONSTRAINT ck_app_users_role;
ALTER TABLE app_users ADD CONSTRAINT ck_app_users_role
  CHECK (role IN ('PLATFORM_ADMIN','ADMIN','STORE_MANAGER','CUSTOMER'));
-- (ck_customer_type_by_role sigue siendo válido: PLATFORM_ADMIN no tiene customer_type)

-- Propietario y slug
ALTER TABLE companies
  ADD COLUMN owner_user_id UUID REFERENCES app_users(id) ON DELETE RESTRICT,
  ADD COLUMN slug VARCHAR(60);
UPDATE companies SET slug = lower(code) WHERE slug IS NULL;
ALTER TABLE companies ALTER COLUMN slug SET NOT NULL,
  ADD CONSTRAINT uq_companies_slug UNIQUE (slug),
  ADD CONSTRAINT ck_companies_slug CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$');
CREATE INDEX idx_companies_owner ON companies(owner_user_id);

-- Backfill del propietario (si ya existe un ADMIN): el ADMIN activo más antiguo
UPDATE companies c SET owner_user_id = (
  SELECT id FROM app_users WHERE role='ADMIN' AND status='ACTIVE' ORDER BY created_at LIMIT 1)
WHERE c.owner_user_id IS NULL;
```

- `owner_user_id` queda **nullable**, porque en una instalación nueva el ADMIN aún no existe.
- `AdminBootstrapService` se extiende: al crear el admin, asigna VÉLORA (si `owner_user_id IS NULL`) y crea su suscripción MAX `grandfathered`. Es idempotente.
- Una empresa sin propietario solo la ve PLATFORM_ADMIN. Se puede imponer `NOT NULL` en una V futura.

### V27 — `one_manager_per_store`

1. Query de verificación previa (se ejecuta y se documenta en el PR):
   ```sql
   SELECT store_id, count(*) FROM app_users
   WHERE role='STORE_MANAGER' AND status='ACTIVE' GROUP BY 1 HAVING count(*)>1;
   ```
2. Backfill: por cada sucursal con más de un encargado activo, se conserva el **más reciente** (`updated_at` mayor) y los demás pasan a `INACTIVE`. Se registra un `audit_event` por cada usuario afectado y no se borra a nadie. En local hay 0 filas afectadas.
3. Índice:
   ```sql
   CREATE UNIQUE INDEX uq_app_users_active_manager_per_store
     ON app_users(store_id) WHERE role='STORE_MANAGER' AND status='ACTIVE';
   ```

### V28 — `plans_and_subscriptions`

```sql
CREATE TABLE plans (
  id UUID PRIMARY KEY, code VARCHAR(20) UNIQUE NOT NULL,           -- FREE | PLUS | MAX
  name VARCHAR(60) NOT NULL, sort_order SMALLINT NOT NULL,
  price_monthly NUMERIC(12,2) NOT NULL, currency VARCHAR(3) NOT NULL,
  max_companies INT, max_stores_per_company INT, max_products_per_company INT,  -- NULL = ilimitado
  try_on_monthly_per_customer INT,                                    -- NULL = ilimitado
  branding_tier VARCHAR(10) NOT NULL CHECK (branding_tier IN ('BASIC','FULL_PALETTE','FULL')),
  report_tier VARCHAR(10) NOT NULL CHECK (report_tier IN ('BASIC','STANDARD','ADVANCED')),
  report_history_days INT,                                            -- NULL = completo
  can_export BOOLEAN NOT NULL, can_dynamic_reports BOOLEAN NOT NULL,
  can_ml_dashboards BOOLEAN NOT NULL, can_ai_narrative BOOLEAN NOT NULL,
  can_voice_reports BOOLEAN NOT NULL, can_period_comparison BOOLEAN NOT NULL,
  loyalty_discounts JSONB,       -- NULL = sin descuentos; [{"minOrders":3,"percent":5},{"minOrders":10,"percent":10}]
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES app_users(id),
  company_id UUID REFERENCES companies(id),      -- NULL = plan por cuenta (modo actual); permite el plan por empresa
  plan_id UUID NOT NULL REFERENCES plans(id),
  status VARCHAR(12) NOT NULL CHECK (status IN ('TRIAL','ACTIVE','PAST_DUE','CANCELLED')),
  current_period_start TIMESTAMPTZ NOT NULL, current_period_end TIMESTAMPTZ,  -- NULL = sin vencimiento (grandfathered)
  grandfathered BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX uq_subscriptions_current_owner
  ON subscriptions(owner_user_id) WHERE company_id IS NULL AND status <> 'CANCELLED';

-- La tabla payments cubre suscripciones (no se crea subscription_payments)
ALTER TABLE payments ALTER COLUMN order_id DROP NOT NULL,
  ADD COLUMN subscription_id UUID REFERENCES subscriptions(id),
  ADD CONSTRAINT ck_payments_target CHECK ((order_id IS NULL) <> (subscription_id IS NULL));
-- method acepta 'DEMO' (se amplía ck_payments_method); provider = 'DEMO'

-- Seed de los planes FREE/PLUS/MAX (matriz §5), con INSERT ... ON CONFLICT (code) DO UPDATE
```

- **El vencimiento se evalúa de forma perezosa:** `PlanLimitsService.currentSubscription()` cambia `ACTIVE → PAST_DUE` si `now > current_period_end`, y `TRIAL → PAST_DUE` al terminar la prueba.
- **Una suscripción `PAST_DUE` funciona como FREE**: la tienda sigue operando y solo se reducen los límites. Ningún pedido de cliente se bloquea.
- Las filas de `payments` de suscripción quedan **fuera** de los reportes de ventas: los reportes filtran `order_id IS NOT NULL` (hoy ya hacen join por orders).

### V29 — `company_branding_and_discounts`

```sql
ALTER TABLE companies
  ADD COLUMN display_name VARCHAR(160),          -- NULL → usa name
  ADD COLUMN tagline VARCHAR(200),
  ADD COLUMN logo_storage_key VARCHAR(120),      -- ManagedAssetStorageService (mismo CHECK que product_images)
  ADD COLUMN banner_storage_key VARCHAR(120),
  ADD COLUMN brand_palette JSONB,                -- {"primary","accent","paper","ink"} hex; los derivados se calculan, no se guardan
  ADD COLUMN contact JSONB;                      -- {"phone","email","address","socials":{"instagram",...}}
ALTER TABLE orders
  ADD COLUMN discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN discount_reason VARCHAR(120),
  ADD CONSTRAINT ck_orders_discount CHECK (discount_amount >= 0 AND discount_amount <= subtotal);
CREATE INDEX idx_try_on_jobs_user_created ON try_on_jobs(user_id, created_at);
```

Para VÉLORA: `brand_palette` = tokens actuales de `global.css` y `display_name` = 'VÉLORA'.

Por qué columnas JSONB para la paleta y el contacto, en lugar de una tabla `company_branding`:

- es una relación 1:1;
- Zod en `@velora/contracts` valida la forma;
- no se consultan por campos.

### 2.1 Backfill (resumen)

| Dato | Acción |
|---|---|
| VÉLORA.owner | El ADMIN activo más antiguo (V26) o el bootstrap admin (al arrancar). |
| VÉLORA.slug | `velora`. |
| Suscripción de ese owner | Plan MAX, `ACTIVE`, `grandfathered=true`, `current_period_end=NULL`. |
| Encargados duplicados | El más reciente queda activo y el resto pasa a INACTIVE con auditoría (V27). |
| Órdenes existentes | `discount_amount=0` (DEFAULT). Los totales no cambian. |

---

## 3. Backend: piezas centrales, endpoints y contratos

### 3.1 `TenantScopeService` (punto único de alcance)

Archivo: `common/authz/tenant-scope.service.ts`. Extiende `AccessContextService` sin reemplazarlo.

```ts
interface TenantScope { actor: ActorAccessContext; companyIds: string[] | "ALL"; }
resolve(principal): Promise<TenantScope>
// PLATFORM_ADMIN → "ALL" · ADMIN → empresas con owner_user_id = actor · STORE_MANAGER → [companyId]
requireCompany(principal, requestedCompanyId?): Promise<{ companyId, storeId|null }>
// Valida que requestedCompanyId ∈ companyIds; si no pertenece → 404 (no 403, para no revelar que existe)
requireStore(principal, storeId) / requireWarehouse(principal, warehouseId)
```

- Los 6 servicios con comprobaciones `role === "ADMIN"` y los `resolveScope` locales delegan en este servicio. Se borra la lógica duplicada en lugar de añadir otra capa.
- `GET /api/admin/companies` filtra por `companyIds`.
- **Regla de lint/test:** un test recorre los controladores con `@RequireRoles("ADMIN")` y verifica que el servicio invocado pasa por `TenantScopeService` (con la prueba A/B como red de seguridad).

### 3.2 `PlanLimitsService` (`plans/plan-limits.service.ts`)

| Método | Regla |
|---|---|
| `currentPlan(ownerId \| companyId)` | Evalúa el vencimiento de forma perezosa y resuelve el plan por cuenta. Si existe una fila con `company_id`, gana esa (plan por empresa). |
| `assertCanCreateCompany(owner)` | `count(companies where owner) < max_companies`. |
| `assertCanCreateStore(companyId)` | `count(stores activas) < max_stores_per_company`. |
| `assertCanCreateProduct(companyId)` | `count(products activos) < max_products_per_company`. |
| `assertBrandingAllowed(companyId, patch)` | BASIC solo permite nombre, logo y `accent`. FULL_PALETTE permite los 4 colores. FULL agrega banner, tagline y contacto completo. |
| `assertTryOnQuota(customerId, companyId)` | Cuenta los `try_on_jobs` del mes **calendario** en curso en esa empresa, con status ≠ FAILED. |
| `reportPolicy(companyId)` | `{ tier, historyDays, canExport, canDynamic, canMl, canNarrative, canVoice, canCompare }` |
| `loyaltyDiscount(customerId, companyId, subtotal)` | Si `loyalty_discounts` no es null: toma los pedidos `FULFILLED` previos del cliente en la empresa y aplica el escalón máximo. Devuelve `{amount, reason}`, que se guarda en `orders.discount_*` dentro de la transacción del checkout y del POS. |

- **Errores:** `ApiHttpError(402 \| 409, code)` con los códigos estables `PLAN_LIMIT_COMPANIES`, `PLAN_LIMIT_STORES`, `PLAN_LIMIT_PRODUCTS`, `PLAN_LIMIT_TRY_ON`, `PLAN_LIMIT_BRANDING`, `PLAN_LIMIT_REPORT_FEATURE` y `PLAN_LIMIT_REPORT_HISTORY`, más `SUBSCRIPTION_INACTIVE`.
- `api-exception.filter.ts` ya serializa `ApiHttpError`. Solo se agrega el campo `code` y `{limit, used, requiredPlan}` en `details`.
- **Upgrade:** inmediato (cambia el plan y empieza un periodo nuevo).
- **Downgrade:** se permite solo si el uso cabe en los límites del plan destino. Si no cabe, responde `409 PLAN_DOWNGRADE_EXCEEDS` con la lista de excedentes. Justificación: el modo "excedentes en solo-lectura" obliga a añadir un flag `read_only` a empresas, sucursales y productos, y a revisar el inventario y el POS, lo cual es demasiado costoso para la Fase 1. Queda como mejora posible.

### 3.3 Pagos

- `PaymentGateway` es una interfaz: `createCharge`, `confirm`, `refund`.
- `StripeGateway` envuelve el `StripeGatewayService` actual **sin cambiar su comportamiento**.
- `DemoGateway` aprueba en el momento (o falla si la tarjeta demo es `4000…0002`, para probar la ruta de error).
- La Fase 5 añade `QrGateway`.

### 3.4 Endpoints nuevos

| Método | Ruta | Rol | Notas |
|---|---|---|---|
| GET | `/api/plans` | público | Planes activos (comparación en /planes). |
| POST | `/api/onboarding/owner` | público | Registro de la cuenta propietaria (rol ADMIN). Usa el rate-limit de auth. |
| POST | `/api/onboarding/provision` | ADMIN | **Transaccional**: empresa, sucursal principal, almacén default, categorías base de moda y suscripción DEMO. Usa idempotency-key. |
| GET | `/api/admin/plan` | ADMIN | Plan, estado y uso frente a los límites. |
| POST | `/api/admin/plan/change` | ADMIN | Upgrade o downgrade con pago DEMO. |
| POST | `/api/admin/companies` | ADMIN | Crear empresa (respeta límites y provisiona como arriba). |
| PATCH | `/api/admin/companies/:id/branding` | ADMIN | Paleta, tagline y contacto (validados). |
| POST/DELETE | `/api/admin/companies/:id/branding/{logo,banner}` | ADMIN | Multipart que reutiliza `image-validation` y `ManagedAssetStorageService`. |
| POST | `/api/admin/stores` | ADMIN | Ya existe: se añade `assertCanCreateStore` y el alcance. |
| PUT | `/api/admin/stores/:id/manager` | ADMIN | Asignar o reemplazar el encargado. El anterior pasa a INACTIVE en la misma transacción. |
| GET | `/api/companies/by-slug/:slug` | público | Empresa con su marca (`brand` resuelto, con derivados). |
| GET | `/api/platform/{owners,companies,subscriptions}` | PLATFORM_ADMIN | Listados. |
| POST | `/api/platform/subscriptions/:id/plan` | PLATFORM_ADMIN | Cambiar plan o estado (soporte). |
| GET | `admin\|manager/reports/overview` | (existente) | **Mismo endpoint**: aplica `reportPolicy` (recorta el rango a `historyDays` y devuelve los widgets bloqueados). |

### 3.5 Contratos en `@velora/contracts`

- **`plans.ts`:** `planCodeSchema`, `planSchema`, `reportTierSchema`, `brandingTierSchema`, `planUsageSchema` y `planLimitErrorCodeSchema` (enum de los códigos `PLAN_LIMIT_*`).
- **`subscriptions.ts`:** `subscriptionStatusSchema`, `subscriptionSchema` y `changePlanRequestSchema`.
- **`onboarding.ts`:** `registerOwnerRequestSchema`, `provisionCompanyRequestSchema` (empresa, slug, marca y plan) y `provisionResponseSchema`.
- **`companies.ts`:** se extiende con `brandPaletteSchema` (hex `^#[0-9A-Fa-f]{6}$`), `companyContactSchema`, `companyBrandSchema` (que incluye los derivados `accentDeep` y `accentSoft` y `logoUrl`/`bannerUrl`) y `updateBrandingRequestSchema`.
- **`shared.ts` (utilidad pura, compartida por el front y el back):**
  - `contrastRatio(a, b)`;
  - `assertWcagAA(palette)`, que exige ink/paper ≥ 4.5 y blanco/accent ≥ 4.5 (texto de botón);
  - `deriveAccentShades(accent)`, que devuelve `accentDeep` (L −12% en HSL) y `accentSoft` (mezcla del 85% con paper), probada contra los valores actuales de VÉLORA.
- **`reports.ts`:**
  - `reportKpiSchema` y `reportChartSchema` ganan `id` y `minTier`;
  - `reportOverviewSchema` gana `tier`, `policy` y `locked: {id, title, kind, minTier}[]`;
  - el contrato es **retrocompatible**: los campos nuevos son aditivos.
- **`auth.ts`:** `userRoleSchema` incluye `PLATFORM_ADMIN`.

### 3.6 Catálogo de widgets

- `reports/report-widgets.ts` es un registro declarativo `{ id, kind, minTier, build(ctx) }`.
- `overview()` recorre el catálogo y separa los widgets:
  - permitidos (se calculan);
  - bloqueados (solo metadatos, **sin ejecutar su SQL**).
- Las consultas existentes de `reports.service.ts` se reubican como `build` sin reescribirse.
- En la Fase 1 basta con marcar `minTier` en los widgets actuales y añadir 1 o 2 marcadores ADVANCED bloqueados. La Fase 3 completa el catálogo.
- `ai-narrative`, `ai-query` y `voice-transcribe` llaman a `assertReportFeature`.

---

## 4. Pantallas web

### 4.1 Rutas

| Ruta | Descripción |
|---|---|
| `/` | VÉLORA, igual que hoy. VÉLORA sigue siendo la empresa por defecto. |
| `/t/:slug/*` | **Solución mínima.** Es un layout `TenantRoute` que resuelve `by-slug`, llama a `selectStorefront(company.id)`, aplica la marca y renderiza las mismas rutas hijas (`catalogo`, `bolsa`, `checkout`, …) con rutas relativas. No hay que refactorizar las rutas actuales. |
| Selector actual de empresas | Se conserva. |
| `/planes` y `/crear-tienda` | Marca de la plataforma (VÉLORA). Son páginas públicas fuera de `/t/`. `/crear-tienda` es un asistente de 4 pasos: cuenta, empresa y marca, plan, pago DEMO. |
| `admin/mi-plan` | Barras de uso frente a los límites y CTA para mejorar el plan. |
| `admin/empresas` | Crear empresa, más el selector filtrado a las propias (`loadAdmin` ya existe). |
| `admin/sucursales` | Crear sucursal y asignar o reemplazar su encargado. |
| `admin/marca` | Editor de marca con vista previa en vivo: formulario a la izquierda y `<div data-tenant>` a la derecha con un mini home, un botón y una tarjeta de producto. Muestra la medición de contraste AA. |
| `plataforma/*` | Para PLATFORM_ADMIN: propietarios, empresas, suscripciones y cambio de plan. Son tablas simples. |

### 4.2 Theming

```css
:root[data-tenant], [data-tenant][data-tenant] { /* selector compuesto: gana sin !important */ }
```

- `TenantThemeProvider` escribe `--paper`, `--ink`, `--accent`, `--accent-deep` y `--accent-soft` **como style inline** en el contenedor `data-tenant` (los valores vienen de la API). La regla CSS solo existe para tokens derivados estáticos.
- El style inline evita pelear especificidad con los selectores `:root` y `[data-theme]` actuales.
- En el **modo oscuro** la paleta de la empresa solo sobrescribe `--accent*`; paper e ink siguen el tema del sistema. Ver la decisión abierta D5.

### 4.3 Brand y home

- `Brand.tsx` recibe la empresa activa del `companyStore` y muestra el logo (`logoUrl`) o un monograma con la inicial, junto con `displayName`.
- Los headers y sidebars de `Shells.tsx` ya usan `<Brand/>`.
- `HomePage`: si la empresa es VÉLORA (`code === 'VELORA'`), muestra el hero editorial actual. Si no, `GenericTenantHome`: banner o gradiente de accent, tagline, productos destacados (los últimos 8 activos) y contacto.

### 4.4 Móvil

- El ThemeContext se **aplaza**: hay 12 archivos que importan `colors` estático y `StyleSheet.create` se evalúa al cargar el módulo. Migrarlo exige convertir los estilos a hooks (`useStyles`), lo que da un diff de riesgo alto con un beneficio bajo para el examen.
- **Mínimo de la Fase 1:**
  - mostrar el nombre y el logo de la empresa activa en el header;
  - traducir `PLAN_LIMIT_TRY_ON` ("Alcanzaste tus N pruebas de este mes en {empresa}").
- El acento dinámico se limita a los botones primarios, vía prop. No se toca `theme.ts`.

---

## 5. Matriz de planes y reportes (datos del seed; se cambia solo en el seed)

| Campo | FREE | PLUS | MAX |
|---|---|---|---|
| Tiendas (empresas) | 1 | 2 | 5 |
| Sucursales por tienda | 1 | 3 | 10 |
| Productos por tienda | 25 | 200 | ∞ |
| Probador por cliente/mes | 3 | 20 | ∞ |
| Descuentos automáticos | — | — | 3 pedidos → 5%, 10 pedidos → 10% |
| Marca | BASIC (nombre, logo, 1 color) | FULL_PALETTE | FULL (más banner, tagline y redes) |
| `report_tier` | BASIC | STANDARD | ADVANCED |
| Historial | 30 días | 365 días | completo |
| KPIs y gráficos | 5 KPIs (ventas, pedidos, ticket promedio, stock bajo, top 5) + 2 gráficos (por día, por categoría) | Todos los actuales: sucursal, método de pago, canal, inventario crítico… | Lo de STANDARD + recompra, crecimiento, ticket por cliente, tendencias, mapa de calor día/hora, comparativa entre sucursales |
| Filtros por sucursal y fechas | Solo fechas | ✔ | ✔ |
| Comparar contra el periodo anterior | — | ✔ | ✔ |
| Constructor dinámico y Excel/PDF | — | ✔ (Fase 3) | ✔ |
| Narración IA | — | ✔ *(D3)* | ✔ |
| Dashboards ML | — | — | ✔ (Fase 4) |
| Reportes por voz | — | — *(D3)* | ✔ |
| Precio DEMO/mes | 0 | 99 BOB | 249 BOB |

- Los widgets no permitidos llegan en `locked[]` con `minTier` y la UI los pinta como tarjetas bloqueadas ("Disponible en PLUS/MAX → Mejorar plan").
- El recorte de historial se hace **en el backend**: `from = max(from, today - historyDays)`. Si se pide un rango anterior, la respuesta trae `policy.clamped=true` y no da error.

---

## 6. Plan de pruebas

| Suite | Contenido |
|---|---|
| **Aislamiento** (`tenant-isolation.test.ts`, contra la BD de test) | Propietarios A y B, cada uno con empresa, sucursal, producto, orden y encargado. Para **cada** endpoint de la tabla §1 "Superficie admin", A pide los recursos de B por `companyId`, `storeId`, `warehouseId`, `orderId` y `productId`, y debe recibir 404 o una lista vacía, nunca datos de B. El encargado de A no ve la empresa de B. PLATFORM_ADMIN ve ambas. |
| **Límites** (unitarias de `PlanLimitsService` + HTTP) | Crear empresas, sucursales y productos hasta N y que el N+1 dé el `PLAN_LIMIT_*` correcto. Cuota del probador por mes y empresa (los jobs de otra empresa u otro mes no cuentan). Branding BASIC rechaza la paleta completa. Escalones de descuento y `total = subtotal - discount`. Vencimiento perezoso a PAST_DUE con límites FREE. Downgrade con excedentes da 409. |
| **Reportes por nivel** | `overview` con FREE devuelve solo los widgets BASIC, `locked` no vacío y el rango recortado a 30 días. Con PLUS, sin ML. Con MAX, `locked=[]`. `ai-narrative` con FREE da `PLAN_LIMIT_REPORT_FEATURE`. |
| **Contraste y derivados** | `contracts/shared.test.ts`: la paleta VÉLORA pasa AA, los derivados coinciden con `global.css` (±1 en cada canal) y negro sobre negro se rechaza. |
| **Migraciones** | `db:migrate:fresh` de V1 a V29 sobre una BD vacía. Además, migración sobre una BD poblada con 2 encargados activos en una sucursal: V27 desactiva uno y crea el índice. |
| **Regresión** | Todas las suites existentes en verde (`pnpm test`), `typecheck` y `lint`. `seed-historical-orders.mjs` sigue funcionando. Prueba de humo VÉLORA: login del admin, reportes, POS, checkout con Stripe test y try-on. |
| **Demo** (`scripts/demo-saas.mjs`, vía HTTP) | Owner FREE y owner PLUS. Crea empresas y sucursales hasta el límite y comprueba los rechazos. Verifica el aislamiento cruzado, que `/t/:slug` devuelve marcas distintas, que el dashboard trae widgets BASIC, STANDARD y ADVANCED distintos (con VÉLORA en MAX) y la prueba de humo de VÉLORA. Termina con exit code ≠ 0 si algo falla. |

---

## 7. Desglose de la Fase 1 en bloques (un commit por bloque, rama `feat/fase1-saas`)

| # | Bloque | Criterio de aceptación |
|---|---|---|
| 1 | **Esquema**: V26–V29, seed de planes, esquemas Drizzle, contratos base | `migrate:fresh` en verde. La BD poblada migra sin errores. VÉLORA tiene owner, slug y MAX. Las suites existentes pasan. |
| 2 | **Alcance y roles**: `TenantScopeService` con los 6 servicios migrados, PLATFORM_ADMIN, encargado único y `PUT stores/:id/manager` | Suite de aislamiento A/B en verde. Las pruebas existentes de reportes, POS y órdenes pasan sin cambios funcionales para VÉLORA. |
| 3 | **Planes y límites**: `PlanLimitsService`, códigos de error, cuota del probador, descuento en checkout y POS, recorte y widgets bloqueados en `overview` | Suites de límites y de reportes por nivel en verde. |
| 4 | **Onboarding**: `/planes`, `/crear-tienda`, provisioning transaccional, `PaymentGateway` y `DemoGateway`, "Mi plan" y cambio de plan | Un fallo a mitad del provisioning no deja filas huérfanas (test). Upgrade inmediato y downgrade 409. |
| 5 | **Marca**: branding API, logo y banner, contraste, `TenantThemeProvider`, `/t/:slug`, Brand, home genérico, editor con vista previa, mínimo móvil | VÉLORA se ve idéntica (comparación visual manual). Una empresa nueva muestra su logo y colores. AA validado en el front y en el back. |
| 6 | **Plataforma**: rutas y pantallas PLATFORM_ADMIN | PLATFORM_ADMIN cambia el plan de un owner y los límites cambian al instante. |
| 7 | **Demo**: `scripts/demo-saas.mjs` y su README | El script pasa de punta a punta sobre una BD recién migrada. |

---

## 8. Riesgos y decisiones abiertas

**Riesgos**

- **R1.** ADMIN deja de ser global. Cualquier script o test que dependa de que ADMIN vea todo se rompe. Mitigación: el bootstrap admin es dueño de VÉLORA y PLATFORM_ADMIN es un usuario aparte, creado con `BOOTSTRAP_PLATFORM_ADMIN_*` (opcional).
- **R2.** Al refactorizar los `resolveScope` de `reports.service.ts` (unas 2100 líneas) puede cambiar el comportamiento. Mitigación: el bloque 2 solo cambia la resolución del alcance, no las consultas.
- **R3.** Pasar `payments.order_id` a nullable afecta los joins existentes. Hay que revisar los `innerJoin(orders)` y los reportes que agregan `payments`.
- **R4.** Carrera en los límites, por ejemplo dos `create store` simultáneos. Mitigación: `SELECT … FOR UPDATE` sobre la fila de la suscripción en la transacción de creación.
- **R5.** La cuota del probador se calcula con un join a products. Si se borra un producto, la cuenta cambia. Es aceptable porque `products` no se borra físicamente.
- **R6.** La marca en modo oscuro: una paleta clara de la empresa puede romper el tema oscuro (ver D5).

**Decisiones abiertas** (para el docente o el dueño del proyecto)

- **D1.** ¿Plan por cuenta propietaria (propuesto) o por empresa? El esquema soporta las dos opciones con `subscriptions.company_id`.
- **D2.** Downgrade: ¿bloqueo (propuesto) o excedentes en solo lectura?
- **D3.** Narración IA y voz por nivel: la propuesta es narración desde STANDARD y voz solo en ADVANCED.
- **D4.** Escalones de descuento de MAX (3 → 5%, 10 → 10%) y si cuentan solo los pedidos FULFILLED (propuesto).
- **D5.** Modo oscuro con marca: ¿solo el acento (propuesto) o una paleta oscura por empresa?
- **D6.** Duración del TRIAL (¿14 días?) y si FREE necesita suscripción, propuesta: sí, `ACTIVE` sin vencimiento.
- **D7.** ¿Un CUSTOMER puede ser también propietario con el mismo email? Propuesta: no, son cuentas distintas, porque el rol es único por usuario.

### Decisiones confirmadas (dueño del proyecto)
- **D1** plan por cuenta propietaria (`subscriptions.company_id` permite pasar a plan por empresa).
- **D2** downgrade bloqueado con 409 `PLAN_DOWNGRADE_EXCEEDS` si el uso excede el plan destino.
- **D3** narración IA desde PLUS; voz solo MAX.
- **D4** descuento MAX por monto de compras FULFILLED de los últimos 12 meses en esa empresa: ≥1500 BOB 5%, ≥4000 BOB 10%, ≥8000 BOB 15% (en el seed: `loyalty_discounts = {"windowDays":365,"tiers":[{"minAmount":1500,"percent":5},…]}`).
- **D5** sin modo oscuro; superficies oscuras usan el `--ink` de la empresa (validado AA).
- **D6** TRIAL de 14 días solo en PLUS y MAX; FREE sin trial (ACTIVE sin vencimiento). PLATFORM_ADMIN puede ajustar fechas de suscripción.
- **D7** un correo = un rol; registro con correo existente → error claro.
- Suscripción vencida: límites FREE, se bloquea CREAR, nunca se borra ni oculta lo existente.
- El alcance se resuelve siempre desde la BD (no desde claims del JWT).

---

## 9. Fases siguientes (sin cambios respecto al plan previo)

| Fase | Contenido |
|---|---|
| 2 | Offline completo: clientes y productos offline y sincronización en ambos sentidos. |
| 3 | Reportes: reforzar los existentes, catálogo completo de widgets por nivel, constructor dinámico y exportación Excel/PDF. |
| 4 | Historial realista y ML local en Python (dashboards ADVANCED). |
| 5 | Pago por QR (`QrGateway`) para suscripciones y pedidos. |

---

## 10. Impacto del nuevo alcance en scripts existentes (ajustar en la Fase 4)

Desde el bloque 2, un ADMIN solo opera las compañías de las que es propietario (`companies.owner_user_id`); ya no existe un ADMIN global. No se modificaron los scripts; quedan así:

| Script | Uso de ADMIN | Estado con el nuevo alcance | Ajuste previsto (Fase 4) |
|---|---|---|---|
| `scripts/seed-historical-orders.mjs` | Inicia sesión como `seed.script.admin@velora.local` (credenciales en el código) y usa `POST /api/admin/payments/:id/confirm` y `POST /api/admin/orders/:id/fulfill` sobre VÉLORA. | **Deja de funcionar** tras transferir VÉLORA a la cuenta de administración habitual: las confirmaciones devuelven 404 (fuera de alcance). La parte de cliente (carrito, checkout, pagos) sigue funcionando. | Leer la cuenta operadora de variables de entorno y usar el **propietario** de la compañía destino o el **encargado** de la sucursal (rutas `/api/manager/*`). Quitar las credenciales del código. |
| `apps/back/scripts/upload-gallery-images.mjs` | `VELORA_MIGRATION_ADMIN_EMAIL/PASSWORD` → `POST /api/catalog/manage/products/:id/assets`. | Funciona solo si esa cuenta es la propietaria de VÉLORA o su encargado; con `migration.admin` u otra cuenta sin compañías → 404. | Documentar que la cuenta debe ser el propietario (o un encargado) de la compañía de los productos. |
| `scripts/load-env.ps1` | — | Sin impacto. | — |

Además, las suites y pruebas de aceptación que asumían un ADMIN global (por ejemplo `acceptance.admin`) deben iniciar sesión como el propietario de la compañía que verifican.

---

## 11. Estado de la Fase 1 (bloques 1 a 7 implementados)

| Bloque | Estado | Notas |
|---|---|---|
| 1 Esquema | Hecho | V26–V30 (V30: `payments.subscription_id`, se movió del bloque 1 al 4). `db:migrate:up` para bases existentes. |
| 2 Alcance y roles | Hecho | `TenantScopeService` desde la BD; suite A/B que exige un caso por cada ruta ADMIN enumerada por reflexión. |
| 3 Planes y límites | Hecho | `PlanLimitsService`, `PLAN_LIMIT_*`, cuota del probador, descuento MAX (pedidos web, offline y POS), widgets por nivel. |
| 4 Onboarding | Hecho | `PaymentGateway` (Demo + adaptador Stripe), provisioning transaccional, `/planes`, `/crear-tienda`, Mi plan, Mis tiendas. |
| 5 Marca | Hecho | Marca filtrada por nivel al leer (no se borra al bajar de plan), AA compartido front/back, `/t/:slug`, editor con vista previa, móvil mínimo. |
| 6 Plataforma | Hecho | `/plataforma` (propietarios, tiendas, suscripciones, cambio de plan, ajuste de fechas, transferencia de propiedad). |
| 7 Demo | Hecho | `scripts/demo-saas.mjs` (32 verificaciones). |

Pendiente para fases siguientes: gráfico de ventas por categoría y comparación de periodos (Fase 3), ThemeContext móvil (aplazado), pago QR (Fase 5), ajuste de scripts que usaban un ADMIN global (§10, Fase 4).

---

# Fase 2 — Offline completo (web y móvil)

## F2.1 Auditoría (estado al iniciar)

| Capa | Existe | Falta |
|---|---|---|
| Web (Dexie `velora-customer-v2`) | `offlineOrders` (cliente) y `posSales` (POS) con PENDING/CONFLICT/FAILED, tope de 5 intentos, `clientOperationId` en pedidos y ventas; sync al evento `online` solo para CUSTOMER; cachés de carrito y checkout. | **No hay cola genérica**: son dos tablas por tipo y dos funciones de sync; no hay estado SYNCING; no hay catálogo, clientes ni sucursales locales; el service worker precachea el shell (`navigateFallback`) pero **no** cachea lecturas del catálogo. |
| Móvil (expo-sqlite `velora-mobile.db`) | `offline_orders` con PENDING/SYNCING/CONFLICT/FAILED (recupera SYNCING al arrancar), `cache_entries` (lecturas cacheadas), `app_settings`. | Solo CUSTOMER (`requireCustomer` rechaza ADMIN y STORE_MANAGER); sin cola genérica, sin pull incremental. |
| Backend | Idempotencia por `client_operation_id` en `POST /api/customer/orders/offline-sync` (V12–V14) y en ventas POS. | No hay `/api/sync/*`, cursor ni tombstones; no hay versión por fila; `app_users.email` y `password_hash` son NOT NULL (un cliente sin acceso no cabe hoy); no hay vínculo cliente↔empresa. |

**Refutación con evidencia:** la decisión dice "outbox existente con estados PENDING/SYNCING/CONFLICT/FAILED"; en el código hay **dos colas por tipo** y SYNCING solo en móvil. Para no crear un segundo mecanismo: (1) todo lo nuevo entra en **una sola cola genérica** (`syncOutbox` en Dexie / `sync_outbox` en SQLite) con esos cuatro estados y el mismo tope de 5 reintentos; (2) un **único motor de sync** procesa en orden la cola genérica y las colas heredadas de pedidos y POS (que no se migran para no arriesgar datos ya encolados en dispositivos); (3) el centro de sincronización muestra las tres fuentes como una sola lista.

## F2.2 Esquema (V31+)

- **V31 `offline_customers_and_sync`**
  - `app_users.email` y `password_hash` pasan a NULL solo para clientes sin acceso (`CHECK (role <> 'CUSTOMER' OR ...)`, y para otros roles siguen obligatorios). El login rechaza cuentas sin contraseña.
  - `app_users.registered_company_id` (FK companies, nullable): empresa que registró al cliente sin acceso. Unicidad de documento por empresa: índice único parcial `(registered_company_id, lower(tax_id))`.
  - Vinculación: si luego alguien se registra con el mismo email y la cuenta es un CUSTOMER sin contraseña, se completa (contraseña y nombre) en vez de rechazar.
  - `version INTEGER NOT NULL DEFAULT 1` en `products`, `product_variants` y `app_users`, incrementada por trigger en cada UPDATE (control optimista de ediciones).
  - `sync_changes(seq BIGSERIAL, tx_id xid8, company_id, entity_type, entity_id, op UPSERT|DELETE, changed_at)` alimentada por **triggers** en `categories`, `products`, `product_variants`, `stores`, `warehouses`, `inventory_stocks` y clientes registrados por empresa. Cubre todos los caminos de escritura existentes sin tocar su código.
  - `sync_operations(client_operation_id PK, actor_user_id, company_id, op_type, entity_id, result JSONB, applied_at)`: registro de operaciones APLICADAS para responder `DUPLICATE` con el mismo resultado.

## F2.3 Protocolo y contratos (`@velora/contracts/sync.ts`)

- `POST /api/sync/push` `{ companyId, operations: [{ clientOperationId, type, payload, baseVersion? }] }` → `results: [{ clientOperationId, status: APPLIED|DUPLICATE|CONFLICT|REJECTED, code?, message?, entityId?, server? , options? }]`. Tipos: `CUSTOMER_CREATE`, `CUSTOMER_UPDATE`, `PRODUCT_CREATE` (variantes y stock inicial opcional por almacén), `PRODUCT_UPDATE`. Ids generados por el cliente (UUID) → la imagen offline se sube después con el endpoint de assets existente usando ese id.
- Reglas: alcance por `TenantScopeService` (compañía y almacén); `PlanLimitsService` → `REJECTED` con `PLAN_LIMIT_*` (nunca CONFLICT); unicidad (SKU, email, documento) → `CONFLICT` con opciones `USE_EXISTING | ADJUST_AND_RETRY | DISCARD` y el registro existente; edición con versión desactualizada → `CONFLICT` `VERSION_MISMATCH` con opciones `KEEP_MINE | KEEP_SERVER` y la versión del servidor; stock inicial = movimiento `ENTRY` validado por el servidor.
- `GET /api/sync/pull?companyId=&since=<cursor>&limit=` → `{ cursor, hasMore, changes: { categories, products, stores, warehouses, customers }, tombstones: [{ entityType, id }] }`. Cursor monotónico seguro ante transacciones en vuelo (se corta en el primer `tx_id` aún no visible). Producto INACTIVE o eliminado ⇒ tombstone.

## F2.4 Pantallas

- **Web**: indicador online/offline en los shells; centro de sincronización (`/admin/sincronizacion`, `/sucursal/sincronizacion`) con pendientes, errores y conflictos y las acciones reintentar, descartar y resolver; formularios "Registrar cliente" y "Registrar producto" que funcionan sin red. El service worker agrega caché de lectura del catálogo, empresas y planes (NetworkFirst).
- **Móvil**: "Modo operaciones" solo para STORE_MANAGER (registrar cliente, registrar producto, cola y conflictos; sin POS). Los módulos nativos se cargan con `import()` dinámico.

## F2.5 Bloques

1. Backend (V31, push/pull, idempotencia, conflictos, límites) con pruebas de reenvío, conflictos, tombstones y aislamiento A/B.
2. Web (Dexie v3, outbox genérica, motor único, formularios, centro, service worker).
3. Móvil (SQLite `sync_outbox`, motor, modo operaciones, centro).
4. `scripts/demo-offline.mjs` y guía manual de 3 minutos.

## F2.6 Estado de la Fase 2 (bloques 1 a 4 implementados)

| Bloque | Estado | Notas |
|---|---|---|
| 1 Backend | Hecho | V31; `POST /api/sync/push` y `GET /api/sync/pull` con alcance y límites; cursor xid8 (se entrega todo lo visible y el cursor queda en `xmin`, por lo que puede haber reenvíos idempotentes pero nunca pérdidas). |
| 2 Web | Hecho | Dexie v3 (`syncOutbox`, espejo, cursor, imágenes); motor único; formularios offline; centro de sincronización; service worker con caché de lectura del catálogo e imágenes. |
| 3 Móvil | Hecho | Motor de cola movido a `@velora/contracts` (compartido web/móvil); SQLite `sync_outbox`/`sync_mirror`/`sync_state`; modo operaciones para STORE_MANAGER. |
| 4 Demo | Hecho | `scripts/demo-offline.mjs` (17 verificaciones) y `docs/FASE2_DEMO_OFFLINE.md`. |

Pendiente o fuera de alcance:
- **Imágenes offline en el móvil**: requieren `expo-image-picker`, que no está instalado y obligaría a un nuevo build nativo. En la web sí están.
- **Edición offline**: solo de datos básicos de producto y cliente (con versión). Precios de variantes y stock se editan en línea.
- **Lint de mobile**: no configurado; instalar `eslint-config-expo` exige reinstalar dependencias por la ubicación del *virtual store* de pnpm.
- **Pedidos y POS offline existentes**: siguen en sus colas originales (no se migraron datos ya encolados en dispositivos), pero los procesa el mismo motor y se ven en el mismo centro.

---

# Fase 3 — Datos realistas y reportes

## F3.1 Auditoría

| Tema | Hallazgo |
|---|---|
| Reportes actuales | `GET admin\|manager/reports/{overview,period-bounds}` + IA (`ai-query`, `ai-narrative`, `voice-transcribe`). `overview` arma 10 KPIs, 5 gráficos (`sales-daily`, `sales-store`, `orders-channel`, `payments-method`, `inventory-store`) y la tabla `top-products`, filtrados por nivel con `applyReportTier` (Fase 1). No hay exportación. |
| Columnas de fecha | Ventas = `payments.paid_at` (y `refunded_at` para reembolsos); pedidos = `orders.created_at` / `fulfilled_at` / `cancelled_at`; inventario = foto actual de `inventory_stocks` (sin fecha) y `inventory_movements.created_at` en el historial; caja = `cash_sessions.opened_at/closed_at` y `cash_movements.created_at`. Zona horaria de negocio: `America/La_Paz` (UTC-4). |
| Exportación | No había librerías. Se instalan **exceljs 4.4** (XLSX con estilos, encabezado fijo y autofiltro; JS puro) y **pdfkit 0.17** (PDF vectorial con fuentes estándar, imágenes PNG/JPG y paginado; ~2 MB, sin Chromium). Se descarta Puppeteer por memoria. |
| Datos de VÉLORA | 1085 pedidos de jun-2025 a sep-2026, creciendo de ~28 a ~130 por mes; **ningún pedido en oct-2026** (hueco hasta hoy); 32 clientes. Las tiendas `demo-*` no tienen pedidos. |
| Scripts | `seed-historical-orders.mjs` usa una cuenta de scripts con un ADMIN global (§10): se reemplaza por `seed-realistic-history.mjs`. |

## F3.2 Esquema (V32+)

- **V32 `report_definitions`**: `id`, `company_id` (FK), `created_by` (FK app_users), `name`, `definition JSONB` (solo identificadores del catálogo semántico), `created_at`, `updated_at`, con nombre único por empresa. Sin SQL guardado.

## F3.3 Endpoints y contratos (`@velora/contracts/reports.ts`, aditivos)

- `GET admin|manager/reports/overview`: catálogo completo de widgets con `id`, `minTier` y `locked[]`; comparación contra el periodo anterior (`previous` por KPI) desde STANDARD.
- `GET admin|manager/reports/semantic-catalog`: dimensiones, medidas y filtros permitidos por el nivel.
- `POST admin|manager/reports/query`: `{ companyId, dimensions[≤3], measures[], filters[], sort, limit, compareWithPrevious }` → filas, totales y gráfico sugerido.
- `GET|POST|PUT|DELETE admin/reports/definitions`: definiciones guardadas por empresa.
- `POST admin|manager/reports/query/export?format=xlsx|pdf` y `GET admin|manager/reports/overview/export?format=…`: archivos generados en el backend desde STANDARD.
- **Contratos** en `@velora/contracts/report-builder.ts` (aditivos): `REPORT_DIMENSIONS`/`REPORT_MEASURES` (ids, etiquetas, `minTier`), `reportBuilderDefinitionSchema` (`.strict()`: un campo extra como `sql` da 400) y los resultados.
- **Decisiones del bloque 3**:
  - el constructor, la exportación y las definiciones responden **403** `PLAN_LIMIT_REPORT_FEATURE` para FREE (la IA y la voz conservan el 402 histórico);
  - las dimensiones Día de la semana, Hora y Cliente y las medidas Clientes nuevos y recurrentes son ADVANCED (MAX);
  - **venta neta** sale de `report-facts.ts` (`paymentEventsSql`), la misma fuente que usan los widgets; con dimensiones de producto cada pago se reparte entre los ítems por subtotal, sin cambiar los totales;
  - el valor de inventario es la foto actual y solo se combina con sucursal y atributos de producto;
  - las consultas corren en una transacción de solo lectura con `statement_timeout` de 10 s y un tope de 500 filas;
  - fuentes PDF: Helvetica y Times estándar (WinAnsi: tildes, ñ, ü, ¿ y ¡) sin incrustar TTF.

## F3.4 Pantallas

- **Reportes**: secciones por nivel con gráficos SVG propios (barras, líneas con periodo anterior, mapa de calor día/hora, comparativa de sucursales) y tarjetas bloqueadas.
- **Constructor** (`/admin/reportes/constructor`, `/sucursal/reportes/constructor`): selección guiada, vista previa en vivo, guardar y exportar.

## F3.5 Bloques

1. **Datos realistas**: generador HTTP reproducible y reanudable con patrones documentados en `docs/DATOS_SINTETICOS.md`, verificación estadística y respaldo.
2. **Reportes por nivel**: catálogo completo de widgets y pruebas contra SQL de referencia. Al terminar, pausa para revisión.
3. **Constructor dinámico y exportación** XLSX/PDF.
4. **Pruebas, demo y guía**.

## F3.6 Estado (cierre del 22-oct-2026)

- **En `main`**: Fase 1 (PR #28) y Fase 2 (PR #29), mergeadas.
- **Rama `feat/fase3-reportes`** (PR #30 en borrador, sin mergear): **Fase 3 completa** (bloques 1-4). Siguiente: **Fase 4 · ML local en Python**.

| Bloque | Estado | Notas |
|---|---|---|
| 1 Datos realistas | Hecho | `scripts/seed-realistic-history.mjs` reemplaza a `seed-historical-orders.mjs`; 10.986 pedidos (jul-2025 → 21-oct-2026) en Urbano Boutique y Urbano Outlet (MAX), Andina Moda (PLUS), Primer Paso (FREE) y VÉLORA. Patrones y verificación en `docs/DATOS_SINTETICOS.md`. |
| 2 Reportes por nivel | Hecho | Widgets STANDARD (cancelación, unidades, categorías, tipo de entrega, inventario crítico, comparación con el período anterior) y ADVANCED (recompra, crecimiento, clientes nuevos, tendencia de 12 meses, mapa de calor día × hora, comparativa de sucursales); el backend solo calcula lo permitido. Pruebas por nivel, ventana de historial y cifras contra una referencia independiente. |
| 3 Constructor dinámico y exportación | Hecho | Capa semántica con lista blanca (18 dimensiones, 12 medidas), `report_definitions` (V32), exportación XLSX/PDF en el backend del constructor y del resumen, y UI `/admin|sucursal/reportes/constructor`. Pruebas: 9 combinaciones contra SQL de referencia sobre los datos reales, suite HTTP (niveles, historial, entradas maliciosas, exportaciones y definiciones) y aislamiento A/B de las 8 rutas nuevas. |
| 4 Pruebas, demo y guía | Hecho | `scripts/demo-reportes.mjs` (16 verificaciones) y `docs/FASE3_DEMO_REPORTES.md`. Regresión: `demo-saas` 32/32 y `demo-offline` 17/17. |

Notas:
- El lint del móvil ya está configurado (`eslint-config-expo`), lo que cierra ese pendiente de la Fase 2.
- Los respaldos locales de la base y de los recursos están fuera del repositorio, en la carpeta de respaldos del equipo de desarrollo.
- Las credenciales de VÉLORA para el generador se leen del `.env` local (`VELORA_SEED_OWNER_EMAIL` / `VELORA_SEED_OWNER_PASSWORD`), que no está versionado.

---

# Fase 4 — Machine Learning local

Requisito 5 del examen: modelos supervisados y no supervisados, entrenados con el historial y mostrados en dashboards. **Solo plan MAX** (`report_tier` ADVANCED).

## F4.1 Auditoría

| Tema | Hallazgo |
|---|---|
| Python | 3.13.14 de Microsoft Store (`python`); no hay lanzador `py`. Cumple 3.11+. El venv se crea con `python -m venv apps/ml/.venv` y siempre se invoca por ruta. |
| Datos | 10.986 pedidos (jul-2025 → 21-oct-2026) en 5 empresas. Respaldo previo: `backups-velora/2026-10-22-pre-fase4` (9,9 MB, 32 tablas). |
| Etiquetas sembradas | `scripts/.seed-progress/seed-20251001-all.json` guarda el segmento de cada cliente (`LOYAL_HIGH`, `OCCASIONAL`, `ONE_TIME`, `CHURN_RISK`). Permite calcular el ARI de U1 sin cambiar el generador. |
| Venta neta | Misma definición que el bloque 3 (`report-facts.ts`): Σ cobros PAID/REFUNDED por `paid_at` − Σ reembolsos por `refunded_at`, por día de Bolivia. Python replica ese SQL y una prueba compara sus cifras con las del backend. |
| Workspace | `apps/ml` **no** tiene `package.json`: pnpm, `postinstall`, EAS y Azure no lo tocan. |

## F4.2 Arquitectura

- **`apps/ml`** (Python 3.11+, venv `apps/ml/.venv`, `requirements.txt` con versiones fijadas: scikit-learn, pandas, numpy, psycopg[binary], joblib, fastapi, uvicorn, pytest). Sin TensorFlow, torch ni prophet.
- El mismo paquete sirve por **CLI** (`python -m velora_ml train --company <slug|id>`) y como **API FastAPI** local en `127.0.0.1:8090`, con el token `X-Velora-ML-Token` (`VELORA_ML_TOKEN`). Solo admite un entrenamiento a la vez (lock en el proceso; si hay otro en curso, 409).
- **Flujo de una corrida**:
  1. El backend valida el alcance (`TenantScopeService`) y el plan (`PlanLimitsService`, `ML_DASHBOARDS`).
  2. Crea las corridas `QUEUED` en `ml_runs` y llama a `POST /train` con sus ids.
  3. Python las pasa a `RUNNING` y escribe los resultados y el estado final.
- Python **lee** las tablas operativas y **escribe solo `ml_*`**. Para garantizarlo, el rol local opcional `velora_ml` tiene mínimo privilegio: `SELECT` sobre las tablas que lee y DML solo sobre `ml_*`. Lo crea `pnpm ml:db-role` y guarda `VELORA_ML_DATABASE_URL` en `.env`. Es barato y demuestra la frontera; sin ese rol, usa `DATABASE_URL`.
- Todas las consultas del ML filtran por `company_id`. Si no hay datos suficientes, la corrida termina en `INSUFFICIENT_DATA` con un mensaje, sin fallar.
- Los artefactos (`joblib`) van a `apps/ml/artifacts/<company>/<model>/<run>.joblib` (no versionados). Se conservan las **últimas 5 corridas** por empresa y modelo; las anteriores se borran junto con sus resultados (cascada).
- **Scripts pnpm**:
  - `ml:setup` (crea el venv e instala);
  - `dev:ml` (API);
  - `ml:train` (CLI);
  - `ml:test` (pytest);
  - `ml:db-role`.

  Todos pasan por `scripts/ml.mjs`, que resuelve el Python del venv por ruta.

## F4.3 Esquema (V33)

- **`ml_runs`**:
  - `id`, `company_id`, `model_key` (`SALES_FORECAST`, `CANCEL_RISK`, `CUSTOMER_SEGMENTS`, `SALES_ANOMALIES`);
  - `status` (`QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `INSUFFICIENT_DATA`), `rows_used`, `data_from`, `data_to`;
  - `params`, `metrics` (JSONB: modelo frente a referencias, importancias y perfiles);
  - `artifact_version`, `requested_by`, `error`, `created_at`, `started_at`, `finished_at`.
- **Tablas de resultados** (todas con `company_id` y `run_id` en cascada, e índice por `(company_id, run_id)`):
  - `ml_forecasts`: día, `kind` (`BACKTEST`/`FORECAST`), real, predicho e intervalo inferior y superior;
  - `ml_customer_segments`: cliente, segmento, nombre, R, F, M y la proyección PCA (x, y);
  - `ml_anomalies`: día, real, esperado, z, dirección y explicación del calendario;
  - `ml_order_risk`: pedido abierto, probabilidad, nivel y variables de entrada.

## F4.4 Modelos

| Clave | Tipo | Objetivo | Validación | Referencias |
|---|---|---|---|---|
| `SALES_FORECAST` (S1) | Regresión | Venta neta diaria y pronóstico a 30 días con bandas | Walk-forward con ventana creciente: 3 pliegues de validación de 30 días y prueba final de 90 días; pronóstico recursivo en bloques de 30 días | Ingenuo, ingenuo estacional (7 días) y promedio móvil de 28 días |
| `CANCEL_RISK` (S2) | Clasificación | `CANCELLED` frente a `FULFILLED` en pedidos ECOMMERCE | Partición temporal 80/20; umbral elegido en validación interna (último 20 % del entrenamiento) | Clase mayoritaria y regresión logística |
| `CUSTOMER_SEGMENTS` (U1) | Clustering | RFM a la fecha de corte (log + estandarización), KMeans | k entre 2 y 8: silhouette, codo y estabilidad (ARI con 5 semillas); ARI frente a las etiquetas sembradas | — |
| `SALES_ANOMALIES` (U2) | Anomalías | z-score robusto (MAD) de los residuos en log frente a un modelo de demanda "normal" sin calendario especial | Recuperación de las fechas sembradas y falsos positivos | — |

Detalles adicionales:
- **S1**: grilla de hasta 20 combinaciones evaluada solo en los pliegues de validación.
- **S2**:
  - momento de puntuación = creación del pedido en el checkout, con el método de pago elegido (el primer pago creado);
  - la consulta nunca lee `cancelled_at`, `paid_at`, `fulfilled_at`, el estado del pago ni el historial, y una prueba lo verifica;
  - el desbalance se maneja con `class_weight`.
- **U1**: los nombres de segmento (Leales, Ocasionales, En riesgo, Una sola compra) salen de reglas explícitas sobre los centroides frente a la mediana.

## F4.5 Endpoints y contratos (`@velora/contracts/ml.ts`, aditivos)

Rutas `admin/ml/*` para ADMIN y PLATFORM_ADMIN (el STORE_MANAGER no entra), todas con `?companyId=`:
- `GET overview`: estado del servicio, última corrida por modelo e indicador de entrenamiento en curso;
- `POST runs`: devuelve **202** `{ runIds }`, o **409** si ya hay una corrida activa en la empresa o en el servicio;
- `GET runs/:id`;
- `GET forecast`, `GET segments`, `GET cancel-risk` y `GET anomalies`: resultados de la última corrida exitosa (o de `INSUFFICIENT_DATA`).

FREE y PLUS reciben **403** `PLAN_LIMIT_REPORT_FEATURE`. Si el servicio está caído, `POST runs` responde **503** `ML_SERVICE_UNAVAILABLE` y las lecturas siguen mostrando lo guardado. Todas las rutas entran en la suite A/B.

## F4.6 Pantallas

`/admin/ml` (menú "Inteligencia", bloqueado con "Disponible en MAX" fuera de ese plan) con 4 pestañas:
- **Pronóstico**: serie real frente a predicha con banda, métricas frente a referencias e importancias;
- **Segmentos**: dispersión PCA, tarjetas de perfil y tabla;
- **Riesgo de cancelación**: métricas, matriz de confusión, importancias y pedidos abiertos de mayor riesgo;
- **Anomalías**: serie con marcadores y tabla explicada.

Todas tienen "Entrenar de nuevo" con seguimiento del estado. Los gráficos son SVG propios y no hay narración IA.

## F4.7 Bloques

1. `apps/ml`, V33, los cuatro modelos escribiendo en `ml_*` y pruebas pytest. Entrenamiento de VÉLORA y Urbano Boutique.
2. Backend: cliente ML, ciclo de corridas, endpoints, control de plan y pruebas (MAX, A/B, doble del cliente ML, 409 y servicio caído).
3. Web: dashboards.
4. `scripts/demo-ml.mjs`, `docs/FASE4_DEMO_ML.md`, `docs/ML_MODELOS.md` y estado.

## F4.8 Estado

Fase 4 completa y mergeada (PR #31).

| Bloque | Estado | Notas |
|---|---|---|
| 1 Servicio ML y modelos | Hecho | Hay 4 modelos y 15 pruebas pytest. Cada empresa entrena en unos 25 s. S1 y S2 superan a sus referencias (ver `docs/ML_MODELOS.md`); U2 detecta 2 de 5 fechas fuertes en Urbano (limitación explicada). |
| 2 Backend | Hecho | 7 rutas `admin/ml/*` para ADMIN y PLATFORM_ADMIN, solo MAX. El back pasa de 173 a 180 pruebas: plan, A/B, ciclo con un doble del cliente, 409 y servicio caído. |
| 3 Web | Hecho | `/admin/ml` ("Inteligencia") con 4 pestañas, gráficos SVG propios y estados vacíos y de `INSUFFICIENT_DATA`. 3 pruebas de componentes. |
| 4 Demo y documentación | Hecho | `scripts/demo-ml.mjs` (13 verificaciones con un entrenamiento real), `docs/FASE4_DEMO_ML.md` y `docs/ML_MODELOS.md`. Regresión: saas 32/32, offline 17/17 y reportes 16/16. |

Notas:
- U1 eligió k = 2 con la silhouette pura. Se adoptó, antes de comparar con lo sembrado, la regla "codo estable con silhouette ≥ 90 % de la mejor" (iteración 1).
- U2 pasó de escala log a raíz cuadrada con nivel local (iteración 1) porque los días casi en cero dominaban las anomalías.
- `scipy` se fijó en 1.15.3 (dependencia transitiva compatible con scikit-learn 1.6.1).
- Las demos seguidas superan el límite de login del backend (429): para la regresión, levanta el backend con `VELORA_AUTH_RATE_LIMIT_MAX_REQUESTS` alto.


---

# Fase 4B — Plataforma Trama, entrada neutral y tres tiendas nuevas

Plan, decisiones, guía de 3 minutos y cuentas: `docs/FASE4B_PLATAFORMA.md`.

Estado (22-oct-2026): **Fase 4B completa**.
- Trama es la marca de la plataforma (`/` es el login neutral) y VÉLORA pasa a ser una tienda más en `/t/velora`.
- Se agregaron el directorio `/tiendas`, el selector `/elegir-empresa` y el móvil mínimo.
- Tres tiendas nuevas (Casa Montalvo, Ímpetu Sport y Solana) con 90 días de historial.

**Siguiente:**
1. Fase 5: pago por QR.
2. Cierre del parcial y documento PDF.

---

# Fase 4C — Experiencia de uso web + móvil completo

Plan, guía de 3 minutos y desviaciones: `docs/FASE4C_UX_MOVIL.md`. Auditoría web: `docs/UX_AUDIT.md`.

Estado (28-oct-2026): **Fase 4C completa**.
- Web: 8 P1 y 15 P2 corregidos (redirecciones compartidas, sesión expirada, menú hamburguesa, filtros en la URL, paginación, formatos es-BO, textos en español).
- Móvil: tema por empresa con las funciones de `@velora/contracts`, marca Trama, cliente completo y panel del propietario y del encargado.
- Un endpoint aditivo: disponibilidad pública por variante (solo nivel), con prueba A/B.

## Estado general (28-oct-2026)

Las Fases 1, 2, 3, 4, 4B y 4C y la mejora de tema por tienda están mergeadas en `main` (PRs #28, #29, #30, #31, #32, #34 y #36).

**Mejora "tema por tienda" (PR #36, en `main`):** la web aplica en todo el documento el tema derivado de los 4 colores de cada tienda (`deriveTheme`, barra lateral incluida) y ya no queda ningún color fijo fuera de los tokens. Las paletas de muestra tienen identidad propia, el editor de marca trae una vista previa completa y 8 paletas sugeridas, y hay un paquete para compartir la BD (`docs/TEMA_WEB.md`, `docs/TEMA_PALETAS.md`, `docs/COMPARTIR_BD.md`).

**Pendiente:**
1. Fase 5: pago por QR.
2. Los 7 hallazgos P3 de `docs/UX_AUDIT.md` (pulido web).
3. Cierre: regresión final (pruebas y demos) y PDF de defensa.
4. Menor: regenerar los logos y banners de Urbano Boutique, Urbano Outlet y Primer Paso con sus colores nuevos (hoy son imágenes de la paleta anterior; se suben desde `/admin/marca`).

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

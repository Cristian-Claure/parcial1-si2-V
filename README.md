# VÉLORA

VÉLORA es una plataforma omnicanal para comercio de moda con operación por empresa, sucursal y almacén. La migración vigente utiliza un monorepo TypeScript con API NestJS, Web React/Vite PWA, aplicación móvil React Native/Expo y PostgreSQL.

## Estado técnico validado

La rama autoritativa de la migración es `migration/nest-react-rn-azure`.

El cierre técnico previo al despliegue fue validado el **11 de septiembre de 2026** con los siguientes resultados:

- PostgreSQL 17 limpio con migraciones **V1 → V25** ejecutadas consecutivamente: PASS.
- API NestJS: build, typecheck y lint: PASS.
- API: **24 archivos de prueba / 76 tests**: PASS.
- Web React/Vite/PWA: production build, typecheck y lint: PASS.
- Web: **5 archivos de prueba / 9 tests**: PASS.
- Mobile React Native/Expo: typecheck y **6 tests**: PASS.
- Expo Android export: PASS, bundle validado con 1554 módulos.
- Smoke runtime contra base vacía: Health, Admin Bootstrap, autenticación ADMIN/CUSTOMER, Companies, Catalog, Cart, Orders y Push: PASS.
- Azure readiness: App Service, Static Web Apps, PostgreSQL TLS y Azure Blob: PASS.

El despliegue público en Azure se realiza después de este checkpoint Git.

## Arquitectura actual

```text
React + Vite PWA ───────┐
                        ├──> NestJS API ───> PostgreSQL 17
React Native + Expo ────┘         │
                                  ├──> Azure Blob Storage
                                  ├──> Stripe
                                  ├──> Firebase Cloud Messaging
                                  ├──> OpenAI
                                  └──> Replicate
```

Producción objetivo:

- **API:** Azure App Service, Linux/Node.js.
- **Web:** Azure Static Web Apps.
- **Base de datos:** Azure Database for PostgreSQL Flexible Server.
- **Assets administrados:** Azure Blob Storage.
- **Mobile:** Expo/EAS para Android.

El API ya toma `PORT` desde el entorno y escucha en `0.0.0.0`. La Web incluye `staticwebapp.config.json` con fallback SPA. La referencia de producción usa PostgreSQL con TLS mediante `sslmode=verify-full`.

## Stack

- Node.js `>=22.13.0`.
- pnpm `11.24.0`.
- NestJS 12.
- React 19 + Vite 8 + PWA.
- React Native + Expo SDK 57 + Expo Router.
- PostgreSQL 17.
- Drizzle ORM.
- Zod.
- Stripe.
- Firebase Cloud Messaging.
- Azure Blob Storage SDK.
- OpenAI para funciones de IA.
- Replicate para Virtual Try-On cloud.

## Estructura del repositorio

```text
apps/
  api/       API NestJS
  web/       React + Vite PWA
  mobile/    React Native + Expo
packages/
  config/    configuración runtime compartida
  contracts/ contratos, tipos y validaciones
  database/  Drizzle schema y cliente PostgreSQL
back_velora/src/main/resources/db/migration/
             migraciones SQL autoritativas V1-V25
docs/        documentación técnica y de despliegue
```

Los directorios legacy se conservan como referencia histórica durante el cierre de migración. **No forman parte del runtime actual**. Las migraciones SQL V1-V25 permanecen en `back_velora/src/main/resources/db/migration` y son autoritativas.

## Roles

- `ADMIN`: alcance administrativo global.
- `STORE_MANAGER`: opera con la `Store` asignada directamente al usuario.
- `CUSTOMER`: catálogo, carrito, checkout, pedidos, pagos, notificaciones y experiencia Web/Mobile.

No existe `StoreMembership` en la arquitectura vigente.

## Reglas comerciales críticas

### Company, Store y Warehouse

- Una `Store` pertenece a una sola `Company`.
- El catálogo se maneja a nivel `Company`.
- Un `Warehouse` pertenece a una `Store` y puede ser interno o externo.
- Cada `Store` dispone de un Warehouse principal/default para `PICKUP`.

### PICKUP

- Usa exclusivamente el Warehouse principal/default de la Store seleccionada.
- El Warehouse principal debe cubrir el carrito completo.
- No se agregan Warehouses secundarios.
- No existe pickup multi-Store.

### DELIVERY

- Puede resolver inventario entre varios Warehouses permitidos de la Store según las reglas implementadas.

### Carrito e inventario

- El carrito normal **no reserva stock a largo plazo**.
- No existe `ProductReservation` ni un mecanismo de reserva prolongada de carrito.
- Las reservas/allocations operativas nacen al crear el pedido.

## Módulos principales

- Auth y RBAC.
- Companies / Stores / Warehouses.
- Catalog e Inventory.
- Cart / Checkout.
- Orders y allocations de inventario.
- Payments y Stripe.
- POS y caja.
- Offline customer/POS.
- Push Web + Android mediante Firebase.
- Virtual Try-On.
- Reports + AI.
- Audit.
- Admin Bootstrap.
- Azure Blob managed assets.

## Configuración

Copia el archivo de ejemplo:

```powershell
Copy-Item .env.example .env
```

Nunca versiones `.env`, passwords, tokens, claves privadas ni credenciales de proveedores.

Variables especialmente relevantes para producción:

```text
DATABASE_URL
VELORA_JWT_SECRET
VELORA_CORS_ALLOWED_ORIGINS
VELORA_RATE_LIMIT_TRUST_PROXY_HEADERS
VELORA_PUBLIC_BACKEND_URL
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
VELORA_ASSET_STORAGE_PROVIDER
AZURE_STORAGE_CONNECTION_STRING
VELORA_AZURE_BLOB_CONTAINER
VELORA_PUSH_FIREBASE_ENABLED
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
BOOTSTRAP_ADMIN_ENABLED
BOOTSTRAP_ADMIN_EMAIL
BOOTSTRAP_ADMIN_PASSWORD
VITE_API_BASE_URL
EXPO_PUBLIC_API_BASE_URL
```

Los ejemplos específicos de Web y Mobile están en:

- `apps/web/.env.production.example`
- `apps/mobile/.env.production.example`

## Comandos principales

Instalación:

```powershell
pnpm install --frozen-lockfile
```

Build de paquetes compartidos:

```powershell
pnpm build:packages
```

Desarrollo:

```powershell
pnpm dev:api
pnpm dev:web
pnpm dev:mobile
```

Build de Azure:

```powershell
pnpm build:azure:api
pnpm build:azure:web
```

Validaciones:

```powershell
pnpm --filter @velora/api typecheck
pnpm --filter @velora/api lint
pnpm --filter @velora/api test

pnpm --filter @velora/web typecheck
pnpm --filter @velora/web lint
pnpm --filter @velora/web test

pnpm --filter @velora/mobile typecheck
pnpm --filter @velora/mobile test
pnpm --filter @velora/mobile validate:bundle
```

## Base de datos

Las migraciones autoritativas son **V1-V25** y deben aplicarse en orden sobre una base nueva. V1-V24 son históricas e inmutables; V25 agrega la fundación de parity commerce utilizada por la migración actual.

La secuencia V1→V25 fue validada desde una PostgreSQL 17 completamente vacía antes de este cierre.

## Instalación y despliegue

- Instalación reproducible: [INSTALLATION.md](INSTALLATION.md)
- Despliegue Azure: [docs/AZURE_DEPLOYMENT.md](docs/AZURE_DEPLOYMENT.md)

## Seguridad

- JWT stateless.
- Passwords con bcrypt.
- Rate limiting configurable.
- CORS por allow-list.
- PostgreSQL de Azure mediante TLS.
- Secretos únicamente por entorno/plataforma.
- Push failure aislado de las transacciones comerciales.
- Admin Bootstrap deshabilitado por defecto e idempotente.

## Checkpoint

Este README describe exclusivamente la arquitectura vigente de migración. Para cambios futuros se debe preservar el aislamiento por Company/Store, las reglas PICKUP/DELIVERY, V1-V24 inmutables y los contratos ya validados en la regresión integrada.

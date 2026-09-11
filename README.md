# VÉLORA

VÉLORA es una plataforma omnicanal de comercio de moda. El repositorio actual usa exclusivamente el stack TypeScript migrado y validado para Web, API y Mobile.

## Arquitectura vigente

- `apps/api`: API NestJS 12.
- `apps/web`: React 19 + Vite + PWA.
- `apps/mobile`: React Native + Expo SDK 57.
- `packages/config`: configuración runtime compartida.
- `packages/contracts`: contratos y esquemas compartidos.
- `packages/database`: Drizzle, schema PostgreSQL y migraciones SQL V1-V25.
- `docs/AZURE_DEPLOYMENT.md`: guía de despliegue en Azure.

Persistencia: PostgreSQL 17. Producción: Azure App Service, Azure Static Web Apps, Azure Database for PostgreSQL Flexible Server y Azure Blob Storage.

## Reglas de dominio clave

- Una Company posee una o más Stores.
- El catálogo pertenece a Company.
- Un Warehouse pertenece a una Store.
- PICKUP usa exclusivamente el Warehouse default de la Store elegida y debe cubrir el carrito completo.
- DELIVERY puede asignar stock entre múltiples Warehouses de la Store.
- El carrito no mantiene reservas de stock prolongadas.
- ADMIN tiene alcance global.
- STORE_MANAGER usa la Store asignada directamente al usuario.
- No existe StoreMembership ni selección arbitraria de la primera Store.

## Funcionalidad

- autenticación JWT y RBAC;
- catálogo, productos, variantes e inventario;
- carrito, checkout, pedidos e idempotencia offline;
- PICKUP y DELIVERY;
- Stripe y operación de pagos;
- POS y sesiones de caja;
- Try-On con almacenamiento administrado;
- reportes, IA y auditoría;
- Push Web/Android con Firebase Cloud Messaging;
- Admin Bootstrap seguro por variables de entorno;
- PWA Web y app Expo.

## Base de datos

Las migraciones autoritativas están en:

```text
packages/database/migrations/V1__...sql
...
packages/database/migrations/V25__commerce_parity_foundation.sql
```

V1-V24 se conservan inmutables. Para una base nueva y vacía:

```powershell
.\scripts\load-env.ps1
pnpm db:migrate:fresh
```

El comando rechaza bases que ya tengan tablas en el schema `public`; no elimina datos.

## Desarrollo local

Requisitos principales:

- Node.js >= 22.13
- pnpm 11.24.0
- PostgreSQL 17 o Docker Desktop
- Android Studio/SDK cuando se necesite build nativo

Instalación:

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env
```

PostgreSQL local con Docker:

```powershell
docker compose up -d postgres
.\scripts\load-env.ps1
pnpm db:migrate:fresh
```

Aplicaciones:

```powershell
pnpm dev:api
pnpm dev:web
pnpm dev:mobile
```

Validación:

```powershell
pnpm build:azure:api
pnpm --filter @velora/api typecheck
pnpm --filter @velora/api lint
pnpm --filter @velora/api test

pnpm build:azure:web
pnpm --filter @velora/web typecheck
pnpm --filter @velora/web lint
pnpm --filter @velora/web test

pnpm --filter @velora/mobile typecheck
pnpm --filter @velora/mobile test
pnpm --filter @velora/mobile validate:bundle
```

## Producción Azure

Consulta `docs/AZURE_DEPLOYMENT.md`. Los secretos se configuran únicamente como App Settings/secretos del entorno y nunca se versionan.

## Documentación

- `INSTALLATION.md`: preparación desde un clon limpio.
- `docs/AZURE_DEPLOYMENT.md`: despliegue.
- `.env.example`: referencia de variables sin secretos.

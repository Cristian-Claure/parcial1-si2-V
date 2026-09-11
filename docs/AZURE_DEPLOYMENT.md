# Despliegue de VÉLORA en Azure

Esta guía corresponde al stack vigente validado el 11 de septiembre de 2026.

## Arquitectura de producción

```text
Azure Static Web Apps (React/Vite)
              │
              ▼
Azure App Service (NestJS API)
      │        │         │
      │        │         ├── Firebase Cloud Messaging
      │        │         ├── Stripe
      │        │         ├── OpenAI / Replicate
      │        │
      │        └──────────── Azure Blob Storage
      │
      └───────────────────── Azure Database for PostgreSQL Flexible Server

Expo/EAS Android ───────────> Azure App Service
```

## 1. Prerrequisitos

- Rama `migration/nest-react-rn-azure` publicada en GitHub.
- Azure CLI autenticado o acceso equivalente al portal.
- Suscripción Azure activa.
- PostgreSQL 17 compatible.
- Secretos de producción disponibles fuera de Git.

No reutilices secretos de desarrollo.

## 2. PostgreSQL Flexible Server

Crea Azure Database for PostgreSQL Flexible Server y una base para VÉLORA.

La conexión del API se entrega mediante `DATABASE_URL`.

Ejemplo:

```text
postgresql://<user>:<password>@<server>.postgres.database.azure.com:5432/velora_db?sslmode=verify-full
```

Azure exige TLS; el proyecto conserva la cadena de conexión completa y `node-postgres` la consume directamente.

Antes de publicar tráfico aplica **V1-V25 en orden**. Nunca edites V1-V24.

Con `psql` disponible:

```powershell
$migrations = Get-ChildItem "back_velora/src/main/resources/db/migration/V*.sql" | Sort-Object {
    if ($_.Name -match '^V(\d+)__') { [int]$Matches[1] } else { [int]::MaxValue }
}
foreach ($migration in $migrations) {
    psql "$env:DATABASE_URL" -X -v ON_ERROR_STOP=1 -f $migration.FullName
    if ($LASTEXITCODE -ne 0) { throw "Migration failed: $($migration.Name)" }
}
```

## 3. Azure Blob Storage

Crea una Storage Account y un contenedor privado, por ejemplo:

```text
velora-assets
```

Configura en App Service:

```text
VELORA_ASSET_STORAGE_PROVIDER=AZURE_BLOB
AZURE_STORAGE_CONNECTION_STRING=<secret>
VELORA_AZURE_BLOB_CONTAINER=velora-assets
```

El backend crea el contenedor si no existe, pero es preferible aprovisionarlo explícitamente y aplicar las políticas de acceso en Azure.

## 4. API en Azure App Service

Usa App Service Linux con runtime Node.js compatible con el `engines.node` del repositorio.

Build desde la raíz:

```powershell
pnpm install --frozen-lockfile
pnpm build:azure:api
```

El API generado está en `apps/api/dist` y escucha `PORT` en `0.0.0.0`.

Startup disponible desde la raíz:

```text
pnpm start:azure:api
```

Si el entorno de hosting arranca directamente Node después de instalar el workspace:

```text
node apps/api/dist/main.js
```

Health check:

```text
/api/health
```

### Variables mínimas del API

```text
DATABASE_URL
VELORA_JWT_SECRET
VELORA_CORS_ALLOWED_ORIGINS
VELORA_RATE_LIMIT_TRUST_PROXY_HEADERS=true
VELORA_PUBLIC_BACKEND_URL
VELORA_ASSET_STORAGE_PROVIDER=AZURE_BLOB
AZURE_STORAGE_CONNECTION_STRING
VELORA_AZURE_BLOB_CONTAINER
```

Según las funcionalidades habilitadas, agrega:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_SUCCESS_URL
STRIPE_CANCEL_URL
OPENAI_API_KEY
REPLICATE_API_TOKEN
VELORA_PUSH_FIREBASE_ENABLED
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
BOOTSTRAP_ADMIN_ENABLED
BOOTSTRAP_ADMIN_EMAIL
BOOTSTRAP_ADMIN_PASSWORD
```

`FIREBASE_PRIVATE_KEY`, passwords, tokens y connection strings son secretos de App Service. No deben guardarse en archivos versionados.

## 5. Admin inicial

En el primer arranque puedes habilitar temporalmente:

```text
BOOTSTRAP_ADMIN_ENABLED=true
BOOTSTRAP_ADMIN_EMAIL=<admin-email>
BOOTSTRAP_ADMIN_PASSWORD=<secret>
```

El bootstrap es idempotente y no asigna Store arbitraria al ADMIN.

Después de verificar el acceso puedes deshabilitarlo:

```text
BOOTSTRAP_ADMIN_ENABLED=false
```

## 6. Web en Azure Static Web Apps

Variables de build:

```text
VITE_API_BASE_URL=https://<your-api>.azurewebsites.net
VITE_STOREFRONT_COMPANY_ID=
```

Build:

```powershell
pnpm install --frozen-lockfile
pnpm build:azure:web
```

Output:

```text
apps/web/dist
```

`apps/web/public/staticwebapp.config.json` se copia al root del output y proporciona `navigationFallback` hacia `/index.html`, necesario para React Router.

Después de obtener el dominio real de Static Web Apps, configura en el API:

```text
VELORA_CORS_ALLOWED_ORIGINS=https://<your-web>.azurestaticapps.net
STRIPE_SUCCESS_URL=https://<your-web>.azurestaticapps.net/pago/stripe/retorno
STRIPE_CANCEL_URL=https://<your-web>.azurestaticapps.net/mis-pedidos
```

## 7. Mobile Expo/EAS

Para build de producción parte de:

```text
apps/mobile/.env.production.example
```

Configura:

```text
EXPO_PUBLIC_API_BASE_URL=https://<your-api>.azurewebsites.net
EXPO_PUBLIC_STOREFRONT_COMPANY_ID=
```

Antes de EAS:

```powershell
pnpm --filter @velora/mobile typecheck
pnpm --filter @velora/mobile test
pnpm --filter @velora/mobile validate:bundle
```

Android mantiene `google-services.json` público de configuración Firebase y el backend conserva las credenciales privadas únicamente en App Service.

## 8. Stripe

Configura el webhook público contra el API desplegado y guarda el signing secret en:

```text
STRIPE_WEBHOOK_SECRET
```

Las URLs de retorno deben apuntar al dominio final de Static Web Apps.

## 9. Push Firebase

Para habilitar entrega real:

```text
VELORA_PUSH_FIREBASE_ENABLED=true
FIREBASE_PROJECT_ID=<project-id>
FIREBASE_CLIENT_EMAIL=<service-account-client-email>
FIREBASE_PRIVATE_KEY=<secret>
```

No publiques la clave privada en GitHub, Static Web Apps ni variables `VITE_*`/`EXPO_PUBLIC_*`.

## 10. Smoke test de producción

Después del despliegue verifica, en este orden:

```text
GET  /api/health                           200 / UP
POST /api/auth/login                       ADMIN OK
GET  /api/auth/me                          autenticado
GET  /api/companies                        200
GET  Web /                                 200
REFRESH de rutas SPA                       sin 404
Login CUSTOMER                             OK
Catalog                                    OK
Cart                                       OK
Checkout                                   OK
Orders                                     OK
Push registration                          OK
Azure Blob upload/read                     OK
Stripe webhook                             según entorno configurado
```

## 11. Seguridad de producción

- HTTPS únicamente.
- PostgreSQL con TLS y validación de certificado/hostname.
- CORS limitado al dominio Web real.
- Secretos en App Service/servicio de secretos, nunca en Git.
- `VELORA_RATE_LIMIT_TRUST_PROXY_HEADERS=true` detrás del proxy de Azure.
- Bootstrap ADMIN deshabilitado después del aprovisionamiento cuando ya no sea necesario.
- No exponer variables backend mediante `VITE_*` o `EXPO_PUBLIC_*`.

## 12. Rollback operativo

El rollback de aplicación debe hacerse desplegando un artefacto/commit previamente validado. **No** se revierte una migración histórica editando V1-V24.

Antes de cualquier cambio posterior de esquema crea una nueva migración `V26+`.

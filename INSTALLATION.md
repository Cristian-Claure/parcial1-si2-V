# Instalación reproducible de VÉLORA

Esta guía levanta el stack vigente de VÉLORA desde un clon limpio.

## 1. Requisitos

Obligatorios:

- Git.
- Node.js `>=22.13.0`.
- pnpm `11.24.0`.
- Docker Desktop con Docker Engine operativo.

Para desarrollo Mobile con emulador también se recomienda Android Studio. Para el bundle de validación se utiliza Expo CLI a través del workspace.

Comprueba:

```powershell
git --version
node --version
pnpm --version
docker version
```

## 2. Clonar y seleccionar la rama

```powershell
git clone <URL_DEL_REPOSITORIO>
Set-Location PARCIAL_SI2_V
git switch migration/nest-react-rn-azure
```

## 3. Instalar dependencias

Desde la raíz:

```powershell
pnpm install --frozen-lockfile
```

El repositorio es un workspace pnpm. No instales dependencias por separado dentro de cada aplicación.

## 4. Configuración local

```powershell
Copy-Item .env.example .env
```

Edita `.env` y cambia, como mínimo:

```text
VELORA_DB_PASSWORD
DATABASE_URL
VELORA_JWT_SECRET
```

Para el entorno Docker incluido, los valores locales habituales son:

```text
VELORA_DB_HOST=localhost
VELORA_DB_PORT=55432
VELORA_DB_NAME=velora_db
VELORA_DB_USER=velora
DATABASE_URL=postgresql://velora:<password>@127.0.0.1:55432/velora_db
PORT=8080
```

Los secretos reales no se versionan.

## 5. Levantar PostgreSQL local

```powershell
docker compose up -d postgres
docker compose ps
```

El servicio utiliza PostgreSQL 17.

## 6. Aplicar V1-V25 en orden

Las migraciones están en:

```text
back_velora/src/main/resources/db/migration/
```

Desde PowerShell:

```powershell
$migrationDir = "back_velora/src/main/resources/db/migration"
$migrations = Get-ChildItem -LiteralPath $migrationDir -Filter "V*.sql" | Sort-Object {
    if ($_.Name -match '^V(\d+)__') { [int]$Matches[1] } else { [int]::MaxValue }
}

foreach ($migration in $migrations) {
    Write-Host "Applying $($migration.Name)"
    Get-Content -Raw -LiteralPath $migration.FullName |
        docker compose exec -T postgres sh -lc 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
    if ($LASTEXITCODE -ne 0) { throw "Migration failed: $($migration.Name)" }
}
```

Debe haber exactamente V1-V25. No modifiques V1-V24.

## 7. Compilar paquetes compartidos

```powershell
pnpm build:packages
```

Esto compila `@velora/config`, `@velora/contracts` y `@velora/database` antes del API.

## 8. Ejecutar API

```powershell
pnpm dev:api
```

Por defecto:

```text
http://127.0.0.1:8080
```

Health:

```text
GET http://127.0.0.1:8080/api/health
```

## 9. Ejecutar Web

En otra terminal:

```powershell
pnpm dev:web
```

Vite utiliza normalmente:

```text
http://localhost:5173
```

## 10. Ejecutar Mobile

En otra terminal:

```powershell
pnpm dev:mobile
```

Android Emulator usa el valor local de `EXPO_PUBLIC_API_BASE_URL` mostrado en `.env.example` (`10.0.2.2` para alcanzar el host).

## 11. Validación completa

API:

```powershell
pnpm build:azure:api
pnpm --filter @velora/api typecheck
pnpm --filter @velora/api lint
pnpm --filter @velora/api test
```

Web:

```powershell
pnpm build:azure:web
pnpm --filter @velora/web typecheck
pnpm --filter @velora/web lint
pnpm --filter @velora/web test
```

Mobile:

```powershell
pnpm --filter @velora/mobile typecheck
pnpm --filter @velora/mobile test
pnpm --filter @velora/mobile validate:bundle
```

El checkpoint de cierre validó 76 tests API, 9 tests Web y 6 tests Mobile, además del export Android.

## 12. Admin Bootstrap

Está deshabilitado por defecto. Para aprovisionar un ADMIN inicial en un entorno nuevo:

```text
BOOTSTRAP_ADMIN_ENABLED=true
BOOTSTRAP_ADMIN_EMAIL=<email>
BOOTSTRAP_ADMIN_PASSWORD=<secret>
BOOTSTRAP_ADMIN_FIRST_NAME=Admin
BOOTSTRAP_ADMIN_LAST_NAME=Velora
```

El proceso es idempotente. El ADMIN nace activo, sin `storeId` y sin `customerType`.

Después del aprovisionamiento inicial puedes volver a establecer:

```text
BOOTSTRAP_ADMIN_ENABLED=false
```

## 13. Push

El proveedor Firebase está deshabilitado por defecto hasta configurar credenciales backend:

```text
VELORA_PUSH_FIREBASE_ENABLED=true
FIREBASE_PROJECT_ID=<project-id>
FIREBASE_CLIENT_EMAIL=<service-account-client-email>
FIREBASE_PRIVATE_KEY=<private-key>
```

La Web usa Firebase Installation ID y Android utiliza token FCM nativo mediante Expo Notifications.

## 14. Azure local-to-production

Antes de desplegar revisa:

- `apps/web/.env.production.example`
- `apps/mobile/.env.production.example`
- la sección Azure de `.env.example`
- `docs/AZURE_DEPLOYMENT.md`

La URI PostgreSQL de Azure debe mantener TLS, por ejemplo:

```text
postgresql://<user>:<password>@<server>.postgres.database.azure.com:5432/velora_db?sslmode=verify-full
```

## 15. Fresh-clone checklist

```text
pnpm install --frozen-lockfile       PASS
PostgreSQL 17                        UP
V1-V25                               PASS
build:azure:api                      PASS
API typecheck/lint/tests             PASS
build:azure:web                      PASS
Web typecheck/lint/tests             PASS
Mobile typecheck/tests               PASS
Expo Android export                  PASS
GET /api/health                      UP
```

## 16. Problemas comunes

### API no encuentra packages del workspace

Ejecuta primero:

```powershell
pnpm build:packages
```

### PostgreSQL no conecta

Comprueba:

```powershell
docker compose ps
```

y confirma `DATABASE_URL`, puerto, usuario y base.

### Web no llega al API

Comprueba `VITE_API_BASE_URL` y `VELORA_CORS_ALLOWED_ORIGINS`.

### Android Emulator no llega al API local

Usa:

```text
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080
```

### Rutas Web dan 404 en producción

El build debe contener `staticwebapp.config.json` en la raíz de `apps/web/dist`. El script `build:azure:web` ya valida el build utilizado por el proyecto.

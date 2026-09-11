# Instalación de VÉLORA desde un clon limpio

## 1. Requisitos

Instala:

- Git.
- Node.js 22.13 o superior.
- pnpm 11.24.0.
- Docker Desktop o PostgreSQL 17.
- Android Studio/Android SDK si vas a compilar la app Android.
- PowerShell 5.1+ o PowerShell 7 en Windows.

No se requiere Java/Spring, Angular CLI, Kotlin como aplicación independiente ni Python/FastAPI para ejecutar el stack vigente.

## 2. Clonar

```powershell
git clone <URL_DEL_REPOSITORIO>
cd PARCIAL_SI2_V
git status
```

El árbol fuente vigente debe contener `apps/`, `packages/`, `scripts/` y `docs/`.

## 3. Dependencias

```powershell
corepack enable
corepack prepare pnpm@11.24.0 --activate
pnpm install --frozen-lockfile
```

## 4. Entorno

```powershell
Copy-Item .env.example .env
```

Completa `.env` con valores locales. Nunca publiques ese archivo.

Carga las variables en la sesión de PowerShell:

```powershell
.\scripts\load-env.ps1
```

## 5. PostgreSQL nuevo

Con Docker:

```powershell
docker compose up -d postgres
.\scripts\load-env.ps1
pnpm db:migrate:fresh
```

Las migraciones viven en `packages/database/migrations` y deben existir exactamente V1-V25. V1-V24 son históricas e inmutables.

`db:migrate:fresh` está diseñado solo para una base nueva: si detecta tablas existentes en `public`, se detiene sin borrar nada.

## 6. API

```powershell
pnpm build:packages
pnpm --filter @velora/api build
pnpm --filter @velora/api typecheck
pnpm --filter @velora/api lint
pnpm --filter @velora/api test
pnpm dev:api
```

Health:

```text
GET http://127.0.0.1:8080/api/health
```

## 7. Web

```powershell
pnpm --filter @velora/contracts build
pnpm --filter @velora/web build
pnpm --filter @velora/web typecheck
pnpm --filter @velora/web lint
pnpm --filter @velora/web test
pnpm dev:web
```

Default local: `http://localhost:5173`.

## 8. Mobile

```powershell
pnpm --filter @velora/mobile typecheck
pnpm --filter @velora/mobile test
pnpm --filter @velora/mobile validate:bundle
pnpm dev:mobile
```

Android Emulator usa normalmente `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080`.

## 9. Variables importantes

Backend:

- `DATABASE_URL`
- `VELORA_JWT_SECRET`
- `VELORA_CORS_ALLOWED_ORIGINS`
- Stripe
- OpenAI/Replicate cuando corresponda
- Azure Blob
- Firebase backend
- Admin Bootstrap

Web:

- `VITE_API_BASE_URL`
- `VITE_STOREFRONT_COMPANY_ID`

Mobile:

- `EXPO_PUBLIC_API_BASE_URL`
- `EXPO_PUBLIC_STOREFRONT_COMPANY_ID`

Consulta `.env.example` para el contrato completo.

## 10. Fresh-clone checklist

```text
pnpm install --frozen-lockfile         PASS
V1-V25 sobre PostgreSQL vacío          PASS
API build/typecheck/lint/tests         PASS
Web build/typecheck/lint/tests         PASS
Mobile typecheck/tests/export Android PASS
GET /api/health                       PASS
```

## 11. Azure

Consulta `docs/AZURE_DEPLOYMENT.md`. En producción usa PostgreSQL con TLS, Azure Blob y URLs HTTPS para Web/API/Mobile.

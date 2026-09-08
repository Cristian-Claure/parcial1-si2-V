# VÉLORA API

Backend REST headless de VÉLORA implementado con NestJS y TypeScript.

## Arquitectura

La API mantiene separación Clean Code por responsabilidad:

- `controller`: capa HTTP;
- `service`: reglas de negocio y casos de uso;
- `repository`: persistencia PostgreSQL mediante Drizzle;
- `guard`: autenticación y autorización;
- `filter`: traducción uniforme de errores HTTP;
- `packages/contracts`: contratos compartidos y validación Zod;
- `packages/config`: configuración runtime;
- `packages/database`: acceso y schema Drizzle.

## Desarrollo

Desde la raíz del monorepo:

```powershell
pnpm --filter @velora/api dev
```

La API usa `PORT=3000` por defecto.

Health check:

```text
GET /api/health
```

Autenticación:

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
```

## Validación

```powershell
pnpm --filter @velora/api typecheck
pnpm --filter @velora/api lint
pnpm --filter @velora/api test
pnpm --filter @velora/api build
```

## Persistencia

PostgreSQL sigue siendo la fuente de datos. Las 23 migraciones Flyway históricas se preservan durante la migración tecnológica y Drizzle refleja el schema existente.

## Seguridad

- JWT HS256 con issuer `velora`;
- BCrypt con factor 10;
- CORS configurable;
- rate limiting de autenticación configurable;
- secretos solo por variables de entorno/configuración segura.

## Despliegue objetivo

Microsoft Azure App Service para la API. El frontend React/PWA se desplegará por separado y la aplicación móvil usa React Native/Expo.
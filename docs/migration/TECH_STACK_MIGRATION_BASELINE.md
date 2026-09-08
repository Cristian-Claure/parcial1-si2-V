# VÉLORA · Migración tecnológica 2026

## Baseline congelado

- Fuente: `origin/main`.
- Commit: `2c797d5325506db331cb08ba92be2e599059c79c`.
- Árbol Git: `f4d598f19456e0c9e76e25e51d556057918cc7bd`.
- PostgreSQL existente y 23 migraciones Flyway históricas.
- `back_velora`, `front_velora`, `mobile_velora` y `ai_velora` se preservan hasta la paridad integrada.

## Stack objetivo

- Backend: Next.js + TypeScript.
- Frontend: React + Vite + TypeScript.
- PWA: Workbox/Vite PWA + IndexedDB/Dexie.
- Mobile: React Native + Expo SDK 57 + Expo Router.
- Database access: Drizzle ORM sobre PostgreSQL.
- Cloud: Azure.
- Web: Azure Static Web Apps.
- API: Azure App Service.
- DB: Azure Database for PostgreSQL Flexible Server.
- Storage: Azure Blob Storage.
- Secrets: Azure Key Vault/runtime configuration.
- Observabilidad: Application Insights.

## Gates

1. No modificar V1-V23.
2. Mantener contratos API salvo decisión documentada.
3. Mantener JWT/RBAC, CORS, rate limiting y auditoría.
4. Mantener PWA instalable.
5. Mantener CUSTOMER offline, conflictos 409 e idempotencia.
6. Mantener POS offline e idempotencia.
7. Mantener Firebase push web/mobile.
8. Mantener Stripe.
9. Mantener Replicate para Try-On.
10. La foto de persona del Try-On continúa siendo transitoria.
11. GCS se reemplaza por Azure Blob solamente en el stack nuevo.
12. Clean Code: Route Handler -> Use Case/Service -> Repository.
13. CI/CD será obligatorio antes del despliegue Azure.

## Fase 1

Esta fase crea y valida el esqueleto. No migra todavía reglas de negocio.
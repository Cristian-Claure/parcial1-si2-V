# Despliegue VÉLORA en Azure

## Topología objetivo

- API: Azure App Service Linux / Node.js.
- Web: Azure Static Web Apps.
- Base de datos: Azure Database for PostgreSQL Flexible Server.
- Assets administrados: Azure Blob Storage.
- Mobile: Expo/Android apuntando al API HTTPS.
- Push: Firebase Cloud Messaging HTTP v1.

## 1. PostgreSQL Flexible Server

Crea un servidor PostgreSQL y una base nueva para VÉLORA. Usa una cadena con TLS, por ejemplo:

```text
postgresql://<user>:<password>@<server>.postgres.database.azure.com:5432/velora_db?sslmode=verify-full
```

Desde un entorno con acceso de red al servidor:

```powershell
$env:DATABASE_URL="<cadena-Azure>"
pnpm db:migrate:fresh
```

El runner usa `packages/database/migrations/V1-V25` y se niega a ejecutarse si el schema `public` ya contiene tablas.

## 2. Azure Blob Storage

Crea un Storage Account y el contenedor `velora-assets`. Configura en App Service:

```text
VELORA_ASSET_STORAGE_PROVIDER=AZURE_BLOB
AZURE_STORAGE_CONNECTION_STRING=<secret>
VELORA_AZURE_BLOB_CONTAINER=velora-assets
```

## 3. API en App Service

Build:

```powershell
pnpm install --frozen-lockfile
pnpm build:azure:api
```

Startup command:

```text
pnpm start:azure:api
```

Nest consume `PORT` y escucha en `0.0.0.0`.

App Settings mínimos:

- `DATABASE_URL`
- `VELORA_JWT_SECRET`
- `VELORA_CORS_ALLOWED_ORIGINS`
- `VELORA_RATE_LIMIT_TRUST_PROXY_HEADERS=true`
- `VELORA_PUBLIC_BACKEND_URL`
- variables Stripe requeridas
- variables Azure Blob
- Firebase backend si Push queda habilitado
- OpenAI/Replicate si esas funciones estarán activas
- Bootstrap ADMIN solo durante el aprovisionamiento inicial si se necesita

Health check:

```text
/api/health
```

## 4. Web en Static Web Apps

Build:

```powershell
pnpm build:azure:web
```

Output:

```text
apps/web/dist
```

Build-time variables:

```text
VITE_API_BASE_URL=https://<api>.azurewebsites.net
VITE_STOREFRONT_COMPANY_ID=
```

`apps/web/public/staticwebapp.config.json` provee el fallback SPA para React Router y debe quedar dentro de `dist`.

Actualiza CORS del API con el hostname HTTPS real de Static Web Apps.

## 5. Mobile

Configura antes del build:

```text
EXPO_PUBLIC_API_BASE_URL=https://<api>.azurewebsites.net
EXPO_PUBLIC_STOREFRONT_COMPANY_ID=
```

Mantén `google-services.json` como configuración cliente Firebase; las credenciales privadas de servicio FCM pertenecen únicamente al backend.

## 6. Admin Bootstrap

Para el aprovisionamiento inicial:

```text
BOOTSTRAP_ADMIN_ENABLED=true
BOOTSTRAP_ADMIN_EMAIL=<email>
BOOTSTRAP_ADMIN_PASSWORD=<secret>
BOOTSTRAP_ADMIN_FIRST_NAME=Admin
BOOTSTRAP_ADMIN_LAST_NAME=Velora
```

Después de confirmar la cuenta, puede deshabilitarse `BOOTSTRAP_ADMIN_ENABLED`.

## 7. Smoke público

Valida:

1. `GET /api/health`.
2. Login ADMIN.
3. Registro/login CUSTOMER.
4. Companies y catálogo.
5. carrito y checkout.
6. PICKUP con Warehouse default.
7. DELIVERY.
8. pedidos y pagos.
9. POS.
10. Push Web/Android.
11. Try-On y Azure Blob.
12. rutas Web al refrescar directamente.

## 8. Secretos

No guardes en Git:

- passwords;
- `DATABASE_URL` real;
- `VELORA_JWT_SECRET`;
- Stripe secrets;
- `OPENAI_API_KEY`;
- `REPLICATE_API_TOKEN`;
- `AZURE_STORAGE_CONNECTION_STRING`;
- `FIREBASE_PRIVATE_KEY`;
- password del bootstrap.

Usa App Settings/secretos de Azure y variables de build seguras.

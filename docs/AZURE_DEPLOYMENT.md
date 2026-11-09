# Despliegue de TRAMA en Azure (demo)

Demo temporal para la presentación. Todo vive en el grupo **`rg-trama-demo`** (región **westus2**) y se
borra con `scripts/azure/teardown.ps1`.

## URLs públicas

| Servicio | URL |
| --- | --- |
| Web + PWA (Static Web Apps) | https://orange-field-02809c21e.4.azurestaticapps.net |
| Backend (App Service) | https://trama-back-2e5347.azurewebsites.net — salud: `/api/health` |
| Servicio ML (App Service, interno) | https://trama-ml-2e5347.azurewebsites.net (`/health` público; `/train` y `/status` exigen token) |
| Webhook de Stripe (modo prueba) | https://trama-back-2e5347.azurewebsites.net/api/payments/stripe/webhook |

## Recursos

| Recurso | Nombre | SKU |
| --- | --- | --- |
| App Service Plan Linux | `plan-trama-demo` | B1 (B2 solo durante el build) |
| Web App Node 22 (backend) | `trama-back-2e5347` | en el plan B1 |
| Web App Python 3.12 (ML) | `trama-ml-2e5347` | en el mismo plan B1 |
| Static Web App | `trama-web-2e5347` | Free |
| PostgreSQL Flexible Server 17 | `trama-pg-2e5347` (BD `velora_db`) | Burstable B1ms, 32 GB, `azure.extensions=PGCRYPTO` |
| Storage Account | `tramast2e5347` (contenedor privado `velora-assets`) | Standard LRS |

Región: centralus, eastus y eastus2 no tienen cuota de VMs B1 en esta suscripción; por eso todo está en
westus2 (el nombre del grupo conserva la ubicación de metadatos `centralus`, sin efecto en los recursos).

## Secretos

Todos los valores viven en **`.env.azure.local`** (ignorado por Git) y los scripts los leen sin imprimirlos:
`AZ_*` (cuenta de servicio), `AZURE_POSTGRES_ADMIN_*`, `DATABASE_URL`, `VELORA_ML_DATABASE_URL`,
`VELORA_ML_DB_PASSWORD`, `AZURE_STORAGE_CONNECTION_STRING`, `VELORA_JWT_SECRET`, `VELORA_QR_SIGNING_SECRET`,
`VELORA_ML_TOKEN`, `STRIPE_SECRET_KEY` (prueba), `STRIPE_WEBHOOK_SECRET`, cuentas `BOOTSTRAP_*` y las
contraseñas de demostración (`VELORA_TRAMA_*`), `OPENAI_API_KEY` y `REPLICATE_API_TOKEN` (una sola línea por
variable, con la clave validada). JWT, firma de QR, token de ML y contraseñas de PostgreSQL se generaron nuevos
para la nube. El límite de intentos de login queda en el valor por defecto del código.

## IA (asistentes, dictado y Try-On)

`deploy-back.ps1` aplica como App Settings del backend las variables de `packages/config` que existan en
`.env.azure.local` (solo nombres):

| Uso | Variables |
| --- | --- |
| OpenAI (asistente de reportes, asistente de productos, transcripción) | `OPENAI_API_KEY`, `VELORA_AI_MODEL`, `VELORA_AI_TRANSCRIBE_MODEL`, `VELORA_AI_MAX_CATALOG_PRODUCTS`, `VELORA_OPENAI_BASE_URL` |
| Try-On | `VELORA_TRYON_PROVIDER`, `REPLICATE_API_TOKEN`, `VELORA_REPLICATE_BASE_URL`, `VELORA_TRYON_REPLICATE_MODEL`, `VELORA_TRYON_MAX_INPUT_BYTES`, `VELORA_TRYON_PROVIDER_TIMEOUT_SECONDS`, `VELORA_TRYON_RESULT_MAX_BYTES`, `VELORA_TRYON_LOCAL_URL`, `VELORA_TRYON_LOCAL_MODEL` |

- **Interruptor LOCAL/REPLICATE**: `VELORA_TRYON_PROVIDER=REPLICATE` por defecto. Para volver a `LOCAL` sin
  redesplegar (requiere `VELORA_TRYON_LOCAL_URL`; sin ella el probador responde 503 "El proveedor LOCAL no está
  configurado"):
  `az webapp config appsettings set -g rg-trama-demo -n trama-back-2e5347 --settings VELORA_TRYON_PROVIDER=LOCAL`
  (y `=REPLICATE` para regresar). El cambio reinicia la Web App (~1 min).
- Replicate recibe la foto y la prenda (`TRY_ON_GARMENT`, leída del Blob privado) por su **Files API**; no
  necesita descargar nada desde `VELORA_PUBLIC_BACKEND_URL`. Foto máxima 5 MB; cada llamada al proveedor
  tiene 30 s y la generación sigue de forma asíncrona (la app consulta el estado del trabajo).
- **Costo**: `prunaai/p-image-try-on` cobra US$ 0,015 por generación con una prenda. OpenAI se cobra por
  tokens/minutos de audio en la cuenta de la clave.
- **Planes** (decisión D3, intencional): el asistente de productos del cliente funciona en todas las tiendas;
  la consulta y narración con IA de reportes, desde PLUS; el dictado de reportes, solo en MAX (FREE/PLUS
  responden 402 con el plan requerido). Cuota del probador por cliente y tienda: FREE 3, PLUS 20, MAX ilimitado
  al mes.
- **Dictado**: la web graba con `MediaRecorder` y transcribe en el backend (`/reports/voice-transcribe` con
  OpenAI); no usa el reconocimiento de voz del navegador, así que funciona en Brave. Sin micrófono o sin
  permiso muestra el motivo y la consulta escrita sigue disponible.
- **APK**: Expo 57 usa `expo/fetch` como `fetch` global, que no admite partes `{ uri }` en `FormData`; el
  probador envía la foto como multipart armado en `apps/mobile/src/features/try-on/tryOnUpload.ts`.

## Procedimiento (PowerShell, desde la raíz del repo)

El `az login` de usuario está bloqueado (AADSTS530035); los scripts entran con la cuenta de servicio
(`az login --service-principal`) de forma automática.

```powershell
.\scripts\azure\provision.ps1        # grupo, plan B1, Web Apps, SWA, PostgreSQL + pgcrypto, Storage (idempotente)
.\scripts\azure\upload-assets.ps1    # sube apps/back/storage/assets al Blob y compara cantidades
.\scripts\azure\restore-db.ps1 -FromContainer velora-local-v25   # dump nuevo de la BD local + restauración
.\scripts\azure\deploy-back.ps1 -Ml  # App Settings + ZIP del backend y del ML (build Oryx, B2 temporal)
.\scripts\azure\deploy-front.ps1     # build de la web/PWA con la URL del backend y publicación en SWA
.\scripts\azure\stripe-webhook.ps1   # webhook de Stripe (prueba) + secreto + reinicio + evento firmado
.\scripts\azure\verify.ps1           # 12 comprobaciones HTTP
.\scripts\azure\teardown.ps1         # borra el grupo (pide escribir "CONFIRMO BORRAR")
```

### Volver a subir la base de datos

`restore-db.ps1` es re-ejecutable: **borra y recrea** `velora_db` en Azure, hace `pg_restore` del dump,
recrea el rol `velora_ml` (SELECT en tablas operativas, DML solo en `ml_*`, `statement_timeout` 45 min) y
aplica las migraciones pendientes (`pnpm db:migrate:up`). La BD local solo se lee (`pg_dump`).

```powershell
# Dump nuevo desde el contenedor local
.\scripts\azure\restore-db.ps1 -FromContainer velora-local-v25 -SourceDb velora_migrated_v25
# o desde un dump existente (formato custom de pg_dump)
.\scripts\azure\restore-db.ps1 -DumpPath C:\ruta\trama.dump
```

Usa `postgres:17-alpine` como cliente (Docker). El firewall de PostgreSQL permite servicios de Azure y la IP
del operador al momento de `provision.ps1`; si tu IP cambió, vuelve a ejecutar `provision.ps1`.

### Backend (App Service + Oryx)

- ZIP creado con `scripts/azure/zipdir.py` (Python `zipfile`, rutas con `/`): `package.json`,
  `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `packages/*`, `apps/back` y los
  `package.json` de `apps/front`/`apps/mobile` (para que el workspace coincida con el lockfile). Nunca
  incluye `.env*`, `node_modules`, `dist` ni `storage`.
- `CUSTOM_BUILD_COMMAND` de Oryx:
  `corepack enable && corepack prepare pnpm@11.24.0 --activate && pnpm install --frozen-lockfile --filter "@velora/back..." && pnpm build:azure:back`
  (`build:azure:back` compila `@velora/config`, `contracts` y `database` antes del backend; el
  `postinstall` raíz hace lo mismo en instalaciones completas).
- Arranque: `cd apps/back && node dist/main.js` (Nest escucha `PORT` en `0.0.0.0`).
- El plan sube a **B2 solo durante el build** y vuelve a **B1** al terminar (también si falla).
- Activos y comprobantes: `VELORA_ASSET_STORAGE_PROVIDER=AZURE_BLOB`. `ManagedAssetStorageService`
  guarda imágenes y comprobantes PDF en el contenedor **privado** `velora-assets`; el backend los sirve
  (los comprobantes solo por rutas autenticadas).
- URLs públicas: `VELORA_PUBLIC_BACKEND_URL`, `VELORA_PUBLIC_WEB_URL` (enlaces del QR del Banco demo),
  `VELORA_CORS_ALLOWED_ORIGINS` = URL de la SWA, `STRIPE_SUCCESS_URL`/`STRIPE_CANCEL_URL` hacia la web.

### Servicio ML

Segunda Web App Python en el mismo plan (ZIP de `apps/ml` + `seed-labels.json`), arranque
`python -m uvicorn velora_ml.api:app --host 0.0.0.0 --port 8000`. Usa el rol `velora_ml` por SSL
(`VELORA_ML_DATABASE_URL`) y guarda modelos en `/home/data/ml-artifacts` (persistente). El backend lo llama
con `VELORA_ML_URL` + `VELORA_ML_TOKEN`. Si el servicio no responde, "Entrenar de nuevo" devuelve
`ML_SERVICE_UNAVAILABLE` y se siguen viendo los últimos resultados guardados.

### Web + PWA (Static Web Apps)

`deploy-front.ps1` compila con `VITE_API_BASE_URL` = backend de Azure y publica `apps/front/dist` con la SWA
CLI (token de despliegue por variable de entorno). `apps/front/public/staticwebapp.config.json` aporta el
fallback SPA y `Cache-Control: no-cache` para `sw.js`, `registerSW.js`, `manifest.webmanifest` e `index.html`.

### Stripe (modo prueba)

`stripe-webhook.ps1` crea el endpoint por la API con la clave de prueba y los eventos que maneja
`stripe-webhook.service.ts`: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`. Guarda el secreto en
`STRIPE_WEBHOOK_SECRET`, lo aplica, reinicia y envía un evento firmado de prueba. Al hacer teardown, borra
también el endpoint en el panel de Stripe.

### Móvil (APK con EAS)

`apps/mobile/eas.json` (perfil `production`, `buildType: apk`) fija `EXPO_PUBLIC_API_BASE_URL` y
`EXPO_PUBLIC_WEB_URL` con las URLs de arriba (EAS no sube `.env.production` porque está en `.gitignore`).
Sin `EXPO_PUBLIC_STOREFRONT_COMPANY_ID`, la app muestra el directorio de tiendas.

```powershell
cd apps/mobile
npx eas-cli build --platform android --profile production
```

## Cuentas de demostración

Ver `docs/FASE4B_PLATAFORMA.md` (cliente `cliente.demo@trama.seed.local`, propietario MAX
`rodrigo.salvatierra@trama.seed.local`, etc.). Están en la BD restaurada.

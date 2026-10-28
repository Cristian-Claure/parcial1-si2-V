# Restaurar el proyecto en otra PC (paquete para un compañero)

> **Advertencia.** El dump (`velora_migrated_v25.dump`) contiene **correos y hashes de contraseñas** de las cuentas de prueba. **No se sube a GitHub** (`.gitignore` ignora `*.dump`, los ZIP y `backups*/`). Se entrega por un medio privado, como un USB o una carpeta compartida con acceso restringido, y se borra cuando ya no haga falta.

## 1. Generar el paquete (quien lo comparte)

```powershell
.\scripts\backup-local.ps1 -Destination "$HOME\Documents\backups-velora\paquete-companero-<fecha>"
```

Genera estos archivos y verifica cada uno:

| Archivo | Contenido | Verificación |
|---|---|---|
| `velora_migrated_v25.dump` | Dump completo (`pg_dump -Fc`) desde el contenedor | `pg_restore --list` lo lee |
| `storage-assets.zip` | `apps/back/storage/assets` (logos, banners y fotos de producto) | Misma cantidad de archivos que en disco |
| `front-products.zip` | `apps/front/src/assets/products` (fotos de VÉLORA) | Misma cantidad de archivos que en disco |
| `.env.template` | Solo los nombres de las variables, sin valores | — |
| `LEEME.txt` | Pasos cortos | — |

## 2. Requisitos (quien restaura)

- Docker Desktop.
- Node 22.13 o superior, y pnpm 11.24 vía corepack (`corepack enable`; el repo fija la versión en `packageManager`).
- Python 3.12 o superior, solo para el servicio de ML (opcional).
- Git, PowerShell 5.1 o 7.

## 3. Pasos

1. Clonar el repositorio y entrar a la carpeta.
2. Crear `.env` desde `.env.example` (ver §4 qué valores pedir y cuáles generar):
   ```powershell
   Copy-Item .env.example .env   # luego completar los valores
   ```
   Para usar el mismo nombre, puerto y base que la PC original, en `.env` define `VELORA_DB_PORT=55433` y `VELORA_DB_NAME=velora_migrated_v25`. En `.env.example` vienen 55432 y `velora_db`. El contenedor se llama `velora-local-v25`; otro nombre se pasa con `-ContainerName`.
3. Restaurar la base y los archivos desde el paquete:
   ```powershell
   .\scripts\restore-local.ps1 -Package "D:\paquete-companero-<fecha>"
   ```
   El script crea el contenedor `velora-local-v25` (postgres:17-alpine) con el puerto `VELORA_DB_PORT` (55432 en `.env.example`; en la PC original es 55433) y la base `VELORA_DB_NAME` si no existe.

   Después restaura con `pg_restore --clean --if-exists --no-owner --no-acl` y descomprime `storage-assets.zip` en `apps/back/storage/assets` y `front-products.zip` en `apps/front/src/assets/products`.

   Al final muestra cuántos pedidos quedaron. Deben ser unos 12.356.
4. Instalar, compilar y aplicar las migraciones pendientes:
   ```powershell
   $env:CI="true"; pnpm install
   pnpm build:packages
   pnpm db:migrate:up
   pnpm ml:db-role          # opcional (ML): recrea el rol velora_ml y escribe VELORA_ML_DATABASE_URL en .env
   ```
5. Levantar los servicios, cada uno en su propia ventana:
   ```powershell
   . .\scripts\load-env.ps1; pnpm dev:back       # API en :8080 (PORT)
   $env:VITE_API_BASE_URL="http://127.0.0.1:8080"; pnpm dev:front   # web en :5173
   . .\scripts\load-env.ps1; pnpm ml:setup; pnpm dev:ml   # opcional: ML en :8090
   ```
6. Comprobar que todo funciona: `node scripts/verify-theme.mjs` (AA y diversidad de las tiendas) y `node scripts/demo-plataforma.mjs`.

### Si el puerto 8080 está ocupado

Hay que usar otro puerto para el backend **en esa ventana** y apuntar la web a él:

```powershell
. .\scripts\load-env.ps1
$env:PORT="18080"; $env:VELORA_PUBLIC_BACKEND_URL="http://127.0.0.1:18080"; pnpm dev:back
$env:VITE_API_BASE_URL="http://127.0.0.1:18080"; pnpm dev:front
$env:VELORA_DEMO_API_BASE="http://127.0.0.1:18080"   # para los scripts de demo
```

`VELORA_PUBLIC_BACKEND_URL` es necesario porque el backend arma las URLs de logos e imágenes con ese valor.

## 4. Variables de `.env`

**Pedírselas por privado al dueño del proyecto:**

- `BOOTSTRAP_PLATFORM_ADMIN_EMAIL` y `BOOTSTRAP_PLATFORM_ADMIN_PASSWORD`: la cuenta de la plataforma ya existe en el dump y su contraseña tiene que coincidir.
- `VELORA_SEED_OWNER_EMAIL` y `VELORA_SEED_OWNER_PASSWORD`: el dueño de VÉLORA, que también está en el dump.
- Opcionales, solo si va a usar esas funciones (mejor con cuentas propias): `OPENAI_API_KEY`, `REPLICATE_API_TOKEN`, `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`, `FIREBASE_*` y `AZURE_STORAGE_CONNECTION_STRING`. Sin ellas, la IA, el probador remoto, Stripe y las notificaciones quedan desactivados, y el resto funciona.

**Las genera él mismo:**

- `VELORA_DB_USER`, `VELORA_DB_PASSWORD` y `DATABASE_URL`: valores locales nuevos. Los usa el contenedor que crea `restore-local.ps1`.
- `VELORA_JWT_SECRET`, `VELORA_ML_TOKEN` y `VELORA_AI_INTERNAL_TOKEN`: cadenas aleatorias largas. Para generarlas: `[Convert]::ToBase64String((1..48 | % { Get-Random -Max 256 }))`.
- `VELORA_ML_DATABASE_URL`: la escribe `pnpm ml:db-role`.
- `VELORA_TRAMA_OWNER_PASSWORD`, `VELORA_TRAMA_MANAGER_PASSWORD` y `VELORA_TRAMA_CUSTOMER_PASSWORD`: son las contraseñas de demostración de `docs/FASE4B_PLATAFORMA.md` (`SeedPropietario2026`, `SeedEncargado2026`, `SeedCliente2026`).
- `VELORA_ASSET_STORAGE_PROVIDER=LOCAL` y `VELORA_ASSET_LOCAL_DIR`: como en `.env.example`.

## 5. Cuentas de prueba

| Rol | Correo | Contraseña |
|---|---|---|
| Cliente | `cliente.demo@trama.seed.local` | `SeedCliente2026` |
| Dueño con 2 empresas (MAX) | `rodrigo.salvatierra@trama.seed.local` | `SeedPropietario2026` |
| Dueña PLUS | `daniela.ferrufino@trama.seed.local` | `SeedPropietario2026` |
| Dueños de Urbano, Andina y Primer Paso | `lucia.arce@urbano.seed.velora.local`, `mateo.quispe@andina.seed.velora.local`, `valeria.rojas@primerpaso.seed.velora.local` | `SeedPropietario2026` |
| Encargado | `encargado.casa-montalvo.calacoto@seed.local` | `SeedEncargado2026` |
| Plataforma y dueño de VÉLORA | Los de §4 (por privado) | — |

## 6. Problemas frecuentes

- **`pg_restore` muestra avisos de `--clean` sobre objetos que no existen:** es normal en una base vacía. El script comprueba la cantidad de pedidos al final.
- **No se ven los logos ni las imágenes:** revisa que `storage-assets.zip` se haya descomprimido en `apps/back/storage/assets` y que `VELORA_PUBLIC_BACKEND_URL` apunte al puerto real del backend.
- **El servicio de ML no conecta:** ejecuta `pnpm ml:db-role` (el dump se restaura sin permisos para ese rol) y vuelve a levantar `pnpm dev:ml`.

# Fase 4B — Plataforma "Trama", entrada neutral y 3 tiendas nuevas

Este plan reemplaza la decisión anterior de que la marca de plataforma fuera VÉLORA. **Trama** pasa a ser la plataforma y VÉLORA queda como una tienda más (`/t/velora`, con su home editorial y sus datos).

## 4B.1 Decisiones

| Id | Decisión |
|---|---|
| D-A | `/` es el **login neutral** de la plataforma: sin fotos de tiendas y sin la palabra VÉLORA, con "Crear cuenta" y "Ver planes" en la pantalla y en el header público. `/login` y `/registro` quedan como alias. "Crear cuenta" ofrece dos caminos: "Soy cliente" y "Quiero abrir mi tienda". Redirección por rol con una función pura probada. Sin empresa por defecto: las rutas que la necesitan redirigen a `/tiendas`. |
| D-B | Marca **Trama** ("Tu tienda de moda, lista en minutos."): estilo SaaS geométrico con motivo de tejido vectorial. Tokens en `[data-platform]`, `PlatformBrand` separado de `Brand`, monograma "T" tejido en SVG (claro y oscuro) y PWA con nombre e íconos de Trama. |
| D-C | Tiendas **Casa Montalvo** e **Ímpetu Sport** (Rodrigo Salvatierra, MAX) y **Solana** (Daniela Ferrufino, PLUS), creadas por el flujo HTTP real con `scripts/seed-new-stores.mjs`. Ilustraciones vectoriales por prenda (SVG → PNG con sharp), logos monograma y banners. |
| D-D | Móvil mínimo: login y registro con marca Trama y selector de tienda desde el directorio cuando no hay pin. Se respeta `.env.production`; el tema por empresa sigue aplazado. |

## 4B.2 Esquema (V34)

- `companies.listed BOOLEAN NOT NULL DEFAULT true`. Backfill: `false` para los slugs `demo-%` (tiendas de las demos automáticas).
- `companies.segment VARCHAR(20) NULL` con check `MUJER | HOMBRE | DEPORTIVA | INFANTIL | UNISEX`. Lo necesita el filtro por segmento del directorio y no existía. Backfill de las tiendas de muestra:
  - VÉLORA: `MUJER` (moda femenina);
  - Urbano Boutique, Urbano Outlet, Andina Moda y Primer Paso: `UNISEX` (sus catálogos sintéticos tienen ropa de hombre y de mujer).
- Índice parcial `idx_companies_directory (active, listed)`.

## 4B.3 Endpoints y contratos (aditivos)

- `GET /api/companies/directory?q=&segment=` (público). Devuelve **solo campos de marca** de las empresas activas y listadas: nombre, slug, logo, banner, tagline, segmento y paleta resuelta. No expone ids internos de propietario, contacto privado, plan ni conteos.
- `updateBrandingRequestSchema` gana `segment` (opcional) y `adminBrandingResponse.stored.segment`.
- `GET /api/admin/companies` ya existe; `/elegir-empresa` lo combina con `GET /api/admin/plan` y `GET /api/admin/stores` para mostrar el plan y las sucursales.
- Contratos nuevos: `companySegmentSchema`, `directoryEntrySchema` y `directoryQuerySchema`.
- Pruebas:
  - A/B: el directorio es público, así que se prueba que no filtra datos privados; los cambios de branding ya están en la suite;
  - el directorio excluye `demo-*`, las empresas inactivas y las no listadas;
  - búsqueda y filtro por segmento.

## 4B.4 Pantallas web

| Ruta | Contenido |
|---|---|
| `/` (y `/login`) | Login de Trama: panel geométrico con el motivo de tejido, formulario y CTA "Crear cuenta" y "Ver planes". |
| `/registro` | Dos caminos: "Soy cliente" (formulario actual) y "Quiero abrir mi tienda" (`/crear-tienda`). |
| `/tiendas` | Directorio público con buscador, filtro por segmento y tarjetas con los colores de cada tienda. |
| `/elegir-empresa` | Tarjetas de las empresas del propietario (logo, nombre, plan, sucursales y "Entrar"). Recuerda la última y aparece como "Cambiar de empresa" en el menú. |
| `/planes`, `/crear-tienda`, `/plataforma`, "Mi plan" | Marca Trama: "Más popular" con `highlight` y texto `ink`. |
| `/t/:slug/*` | Igual que hoy (público). VÉLORA conserva su home editorial. |

Redirección tras el login (`postLoginPath`):
- CUSTOMER: la última tienda visitada (`/t/<slug>`) o `/tiendas`;
- ADMIN con 1 empresa: `/admin`; con 2 o más: `/elegir-empresa`;
- STORE_MANAGER: `/sucursal`;
- PLATFORM_ADMIN: `/plataforma`.

Se elimina el fallback a VÉLORA: `VITE_STOREFRONT_COMPANY_ID` y la autoselección de empresa única, los textos y `<title>`, el footer, el `Brand` por defecto y el manifest.

## 4B.5 Bloques

1. **Backend**: V34, directorio público, `segment` en branding y pruebas.
2. **Web**: tema Trama, entrada neutral, auth, header y footer públicos, `/planes`, `/crear-tienda`, `/elegir-empresa`, `/tiendas`, redirecciones, eliminación del VÉLORA por defecto y PWA.
3. **Móvil mínimo**.
4. **Tres tiendas**: script idempotente y reanudable, ilustraciones, logos y banners, y verificación por conteos.
5. **Opcional**: unos 90 días de historial para las tres tiendas por el flujo real (se omite si exige reescribir el generador o tarda más de 25 minutos).
6. `scripts/demo-plataforma.mjs`, guía de 3 minutos (en este documento) y estado en `PARCIAL2_PLAN.md`.

## 4B.6 Estado

Fase 4B completa (22-oct-2026).

| Bloque | Estado | Notas |
|---|---|---|
| 1 Backend | Hecho | V34 (`listed`, `segment`) y directorio público. 4 pruebas: datos privados, demos, búsqueda y A/B. |
| 2 Web | Hecho | Entrada neutral, marca Trama, `/tiendas`, `/elegir-empresa`, `postLoginPath`, sin tienda por defecto y PWA Trama. 7 pruebas nuevas. |
| 3 Móvil | Hecho | Marca Trama, selector desde el directorio y tienda activa en el encabezado; se respeta el pin. 3 pruebas nuevas. |
| 4 Tres tiendas | Hecho | `seed-new-stores.mjs` (19 verificaciones) con 26, 26 y 27 productos y 740 variantes en total. |
| 5 Historial | Hecho | 1.370 pedidos en 90 días (439, 480 y 451) y 71–78 clientes compradores por tienda, en unos 1,5 min. |
| 6 Demo y guía | Hecho | `demo-plataforma.mjs` 17/17. Regresión: saas, offline, reportes, ML y plataforma en verde. |

Desviaciones:
- Solana (PLUS) no muestra tagline, banner ni contacto: su nivel de marca (`FULL_PALETTE`) no los incluye, así que se respetó el plan.
- El arte de las prendas llevó 2 iteraciones. Las 9 imágenes ya subidas de vestidos y trajes de baño se repararon sobrescribiendo sus PNG en el almacenamiento local (`--repair-art`), sin SQL: no existe un endpoint para borrar imágenes.
- `companies.segment` se agregó en V34 porque el directorio lo necesita y no existía.

Nota de repositorio: las 52 imágenes de `apps/front/src/assets/products/` entraron por error al índice en `c0c3d1c` (Fase 4). Esta rama las vuelve a dejar sin versionar (`git rm --cached`; los archivos siguen en disco y en el respaldo `pre-plataforma`).

## 4B.7 Guía de demostración (3 minutos)

### Levantar en local

```powershell
. .\scripts\load-env.ps1
pnpm build:packages
pnpm dev:back            # API en :8080 (desde apps/back: encuentra logos e imágenes locales)
pnpm dev:front           # web en :5173
pnpm dev:ml              # opcional: Inteligencia (ML)
node scripts/seed-new-stores.mjs --verify    # 19 verificaciones de las tiendas nuevas
node scripts/demo-plataforma.mjs             # demo automática de la plataforma
```

Para recrear las tiendas desde cero: `node scripts/seed-new-stores.mjs` (idempotente; `--resume` y `--only <slug>`). El historial de 90 días: `node scripts/seed-realistic-history.mjs --only trama`.

### Cuentas

| Flujo | Correo | Contraseña |
|---|---|---|
| Cliente | `cliente.demo@trama.seed.local` | `SeedCliente2026` |
| Dueño con 2 empresas (MAX) | `rodrigo.salvatierra@trama.seed.local` | `SeedPropietario2026` |
| Dueña de 1 empresa (PLUS) | `daniela.ferrufino@trama.seed.local` | `SeedPropietario2026` |
| Encargado | `encargado.casa-montalvo.calacoto@seed.local` (también `.equipetrol` y `.cala-cala`; `encargado.impetu-sport.sopocachi`/`.urubo`; `encargado.solana.equipetrol`/`.sopocachi`/`.zona-norte`) | `SeedEncargado2026` |
| Plataforma | `BOOTSTRAP_PLATFORM_ADMIN_EMAIL` de tu `.env` local | la de tu `.env` |

### Recorrido

1. **`/`**: login neutral de Trama, sin fotos de tiendas ni VÉLORA, con el motivo de tejido. Muestra "Crear cuenta" (dos caminos: cliente o abrir mi tienda) y "Ver planes" ("Más popular" resaltado).
2. **`/tiendas`**:
   - directorio con buscador y filtro por segmento; cada tarjeta lleva los colores, el logo y el banner de su tienda;
   - entra a **Casa Montalvo** (`/t/casa-montalvo`), **Ímpetu Sport** y **Solana**;
   - VÉLORA sigue en `/t/velora` con su home editorial.
3. **Cliente**: inicia sesión y vuelve a la última tienda visitada (o al directorio). Agrega una prenda a la bolsa.
4. **Rodrigo (2 empresas)**:
   - tras el login va a `/elegir-empresa` (logo, plan MAX, sucursales y "Entrar");
   - en el menú, "Cambiar de empresa";
   - Inventario muestra variantes críticas (≤3) y agotadas.
5. **Daniela (1 empresa, PLUS)**: entra directo a `/admin`. Inteligencia aparece con candado MAX y una 4.ª sucursal da `PLAN_LIMIT_STORES`.
6. **Encargado**: va directo a `/sucursal` de Calacoto.
7. **Plataforma**: `/plataforma` con la marca Trama y todas las tiendas.

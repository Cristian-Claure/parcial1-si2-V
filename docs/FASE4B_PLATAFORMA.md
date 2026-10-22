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
  - VÉLORA y Andina Moda: `MUJER`;
  - Urbano Boutique y Urbano Outlet: `UNISEX`;
  - Primer Paso: `INFANTIL`.
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

| Bloque | Estado |
|---|---|
| 1 Backend | En curso |
| 2 Web | Pendiente |
| 3 Móvil | Pendiente |
| 4 Tres tiendas | Pendiente |
| 5 Historial (opcional) | Pendiente |
| 6 Demo y guía | Pendiente |

Nota de repositorio: las 52 imágenes de `apps/front/src/assets/products/` entraron por error al índice en `c0c3d1c` (Fase 4). Esta rama las vuelve a dejar sin versionar (`git rm --cached`; los archivos siguen en disco y en el respaldo `pre-plataforma`).

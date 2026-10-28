# Tema por tienda en la web — auditoría (antes de la mejora)

**Veredicto: causa raíz confirmada, con dos causas que se suman.**

1. **El tema de empresa solo cubre parte de la web.** `TenantTheme` (`shared/brand/TenantTheme.tsx:9-11`) envuelve únicamente `PublicShell` y `CustomerShell` (`shared/layout/Shells.tsx:70` y `:114`). `OperationsShell` (panel `/admin` y `/sucursal`) **no** lo usa, así que el panel siempre pinta con los tokens de VÉLORA de `:root` (`styles/global.css:7-25`). Además, es un `<div data-tenant>` con estilos inline: los modales y portales fuera del árbol no lo heredan, y no aplica a `<html>`/`<body>`.
2. **Solo se sobrescriben 7 variables** (`shared/brand/tenantStyle.ts:20-21`: paper, ink, ink-soft, accent, accent-deep, accent-soft, on-accent). Siguen fijos en arena/café: `--paper-raised #FFFFFF`, `--hairline #E7E0D5`, `--terracotta #B5623E` y las sombras `rgba(23,19,15,…)` (`global.css:12-25`). En `.tenant-theme`, el botón primario usa `var(--ink)` (`saas.css:108`), no el color primario de la tienda.
3. **Las paletas mismas caen en VÉLORA.** `resolveBrandPalette` (`packages/contracts/src/branding.ts`) completa paper/ink con `DEFAULT_BRAND_PALETTE` (arena `#FAF6F0` y tinta café `#17130F`). El backend, para el plan FREE (nivel BASIC), solo conserva el acento (`apps/back/src/companies/branding.service.ts:177`). Resultado en el directorio local: Primer Paso (FREE) usa paper `#FAF6F0`/ink `#17130F` idénticos a VÉLORA, y Urbano Outlet, Andina Moda y Solana tienen papeles cálidos `#FBF8F3`, `#FAF5EE` y `#FFF8EF`.

## Colores fijos encontrados (hex, rgb/rgba y nombres)

| Archivo | Cantidad | Qué es |
|---|---|---|
| `styles/global.css` | 62 + 14 nombres | Tokens de `:root` (7-25, válidos). **Barra lateral** `#2a2422`, `.ops #231d1b`, select `#3a3230` y blancos con alfa (180-190). **Placeholder de imagen de producto** `#76574e #e7d7ce #f7eee8` (119). **Fondo de detalle** `#eadbd2` (139). Inputs `#d7cbc3`, label `#4f4540` (169-170). Avisos `#d9cfc8…#fdf7ea` (51-54). Scrims y overlays `rgba(23,19,15,…)` (78, 89, 159, 334), modal `rgba(23,18,17,.58)` (289), header público `rgba(255,250,246,.9)` (61), tarjeta offline `#b9a89e #fff8ed` (243), botón peligro `#d8aaaa` (45). |
| `styles/platform.css` | 32 | Casi todo es el bloque de tokens de Trama `[data-platform]` (válido). |
| `styles/saas.css` | 10 | `#fff` en cintas y monogramas (13, 72, 78, 84, 88, 96), `#f7e3dc` (47), `#f6ece8` (116), overlay de banner `rgba(0,0,0,.1/.55)` (89). |
| `features/reports/builder.css` | 4 | `#fff` (46, 85, 94, 235). |
| `features/reports/reports.css` · `features/audit/audit.css` · `features/ml/ml.css` | 3 · 2 · 1 | `white` en chips y mezclas, `rgba(255,255,255,.14)` del candado del menú (ml.css:109). |
| `styles/usability.css` | 1 + 1 | Fondo del menú móvil `rgba(20,20,43,.45)` (76) y foco `white` en la barra (15). |
| `features/reports/ReportChartCard.tsx:16-21` | 6 | **Paleta de gráficos fija de VÉLORA** (`#8B6A34 #B5623E #3F6B4A #6B4F22 #17130F #6F675D`). |
| `features/ml/mlFormat.ts:3` | 5 | Colores de segmentos ML (`#6B7FA8 #B08D57 #8E6C8A #4F8A8B #A35D5D`). |
| `features/saas/BrandEditorPage.tsx:15`, `CompaniesPage.tsx:16`, `CreateStorePage.tsx:23` | 3 | Acento por defecto `#8B6A34` (VÉLORA) al crear o editar. |
| `features/catalog/CatalogPages.tsx:18` | 3 | Muestras de color por nombre de prenda (dato del producto: se conserva). |
| `shared/platform/PlatformBrand.tsx` | 12 | Monograma Trama (logo: se conserva). |

## Plan

`deriveTheme` en `@velora/contracts` (todos los tokens, incluida la barra lateral, sombras, gráficos y FREE derivado desde el acento). `ThemeScope` aplica las variables en `document.documentElement` según el ámbito (tienda en `/t/:slug`, cliente y `/admin`; Trama en plataforma), con caché anti-parpadeo. Todo color fijo pasa a tokens y una prueba impide que vuelvan.

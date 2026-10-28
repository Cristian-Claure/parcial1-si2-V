# Fase 4C — Experiencia de uso web + móvil completo (cliente y propietario)

Rama `feat/ux-movil-completo`. Base: `main` @ `7dd6443` (Fase 4B mergeada). BD local `velora-local-v25` → `velora_migrated_v25` con 12.356 pedidos y 32 empresas (no se regenera).

## 4C.1 Punto de partida (auditoría rápida)

| Área | Estado | Implicación |
|---|---|---|
| Redirecciones web | `postLoginPath` en `apps/front/src/core/auth`, guardas en `RouteGuards.tsx`. `RequireRole` manda al login con `from`, pero la vuelta solo se respeta para CUSTOMER; un cliente en `/admin` va a su inicio por rol; no hay manejo global de 401 ni pantalla de 403 por plan. | Se mueve la lógica a funciones puras en `@velora/contracts/navigation.ts` (las usan web y móvil) y se completan los casos. |
| Shells web | Barra lateral fija, sin hamburguesa; el selector de compañía muestra `code`; textos técnicos ("Warehouse + ProductVariant", "React Web", "Fulfill", estados en inglés). | P1/P2 de la auditoría (ver `docs/UX_AUDIT.md`). |
| Tema móvil | `shared/theme.ts` exporta `colors` y `commonStyles` estáticos (paleta VÉLORA); 17 archivos con `StyleSheet.create` a nivel de módulo; 12 colores hexadecimales fuera del tema. | ThemeProvider + `makeStyles` memoizado por tema. |
| Auth móvil | `requireCustomer` rechaza ADMIN y PLATFORM_ADMIN. | Se admite ADMIN (propietario); PLATFORM_ADMIN recibe un aviso para usar la web. |
| Endpoints de dueño | Ya existen: `admin/companies`, `admin/plan`, `admin/stores`, `admin/users/managers`, `admin/reports/overview` (widgets por nivel con `locked[]`), `admin|manager/orders` y acciones de pago y entrega, `inventory/warehouses|stock|movements`, `catalog/manage/products` (`PUT products/:id` con `status`, `PUT variants/:id` con `price`). | Sin endpoints nuevos para el panel: el móvil consume lo que ya usa la web y el alcance lo decide `TenantScopeService`. Única excepción (aditiva, ver §4C.8): disponibilidad pública por variante. |

## 4C.2 Bloques (un commit por bloque)

1. **Web**: `docs/UX_AUDIT.md` (P1/P2/P3), correcciones de todos los P1 y P2, redirecciones puras en `@velora/contracts` con pruebas.
2. **Móvil base**: ThemeProvider/`useTheme`/`makeStyles`, tokens Trama compartidos, `PlatformBrand`/`CompanyBrand`, navegación por rol, directorio y elegir empresa, íconos y `app.json` cosmético. Pruebas: tema AA, derivados, redirección, sin "VÉLORA" y sin hexadecimales fuera del tema.
3. **Móvil cliente completo**.
4. **Móvil propietario y encargado**.
5. `scripts/demo-movil.mjs`, guía de 3 minutos (§4C.7) y estado en `PARCIAL2_PLAN.md`.

## 4C.3 Arquitectura del tema móvil

```
@velora/contracts/branding.ts   TRAMA_TOKENS (paper, paperRaised, ink, inkSoft, hairline, accent, accentDeep, accentSoft, highlight)
                                resolveBrandPalette() · deriveAccentShades() · contrastRatio()   ← mismas funciones que la web
apps/mobile/src/shared/theme/
  tokens.ts      (puro, sin react-native)  buildPlatformTheme() · buildStoreTheme(palette) · SEMANTIC (éxito/aviso/error/info)
  ThemeProvider.tsx   contexto: tema de la tienda activa (o Trama si no hay); <PlatformTheme> fuerza Trama
  makeStyles.ts       makeStyles((t) => ({...})) → hook useStyles() memoizado por tema (StyleSheet.create)
```

- Plataforma (login, registro, tiendas, elegir empresa, mi plan, aviso de PLATFORM_ADMIN): tokens Trama.
- Tienda (cliente) y panel del dueño: paleta de la empresa activa (`resolveBrandPalette`); cambia al cambiar de tienda/empresa.
- Si el acento de la empresa no cumple AA con su texto, `onAccent` ya lo resuelve; los colores semánticos no cambian.
- Pruebas estáticas: ningún `#RRGGBB` fuera de `shared/theme/` y ningún literal "VÉLORA" en `src/`.

## 4C.4 Árbol de rutas móvil (expo-router)

```
app/
  _layout.tsx            fuentes · AppProviders · ThemeProvider
  index.tsx              redirección por rol (mobileHomePath de @velora/contracts)
  login.tsx              Trama · "Soy cliente" / "Quiero abrir mi tienda" (abre EXPO_PUBLIC_WEB_URL/crear-tienda)
  register.tsx           registro de cliente
  stores.tsx             directorio (buscador + segmento) — también accesible sin sesión
  platform-only.tsx      aviso para PLATFORM_ADMIN: usar la web
  (customer)/            rol CUSTOMER (tienda activa obligatoria → /stores)
    home · catalog · product/[id] · favorites · cart · checkout · orders · account · try-on · stripe-return
  (owner)/owner/         rol ADMIN
    companies            Mis empresas (recuerda la última)
    dashboard            Resumen: widgets del backend según plan, rango y sucursal, bloqueados "Disponible en PLUS/MAX"
    orders · order/[id]  pedidos operativos y acciones con confirmación
    inventory            stock por sucursal/almacén y variante, filtros bajo/agotado, movimiento rápido
    catalog · product/[id]  activar/desactivar, editar precio de variante
    branches             sucursales, encargado, almacenes y estado
    plan                 uso contra límites (la mejora se hace en la web)
    register-product · register-customer   formularios del Modo operaciones reutilizados
  (manager)/             rol STORE_MANAGER (antes (operations); las URLs no cambian)
    operations · register-product · register-customer · sync-center
    manager/orders · manager/inventory   mismas pantallas del dueño con alcance de sucursal
```

## 4C.5 Fuera de alcance en móvil

Crear empresas, editar la marca, el constructor dinámico de reportes, exportar a Excel o PDF, los dashboards de ML y mejorar el plan. Todo se hace en la web; el móvil muestra el enlace.

## 4C.6 Reglas

Una sola BD, alcance siempre desde `TenantScopeService`, cambios aditivos en `@velora/contracts`, sin tocar Azure, sin llamadas a OpenAI/Replicate, `slug`/`scheme`/`android.package`/EAS sin cambios, pin de `.env.production` respetado.

## 4C.7 Guía de demostración (3 minutos)

### Levantar en local

```powershell
. .\scripts\load-env.ps1
pnpm build:packages
# Backend (en esta PC el 8080 lo ocupa otro proyecto; se usa 18080 solo en local):
$env:PORT="18080"; $env:VELORA_PUBLIC_BACKEND_URL="http://127.0.0.1:18080"; $env:VELORA_AUTH_RATE_LIMIT_MAX_REQUESTS="10000"
pnpm --filter @velora/back build; cd apps\back; node dist/main.js     # o pnpm dev:back si el 8080 está libre
pnpm dev:front                                   # web en :5173 (VITE_API_BASE_URL debe apuntar al backend)
pnpm dev:ml                                      # opcional: Inteligencia
# Móvil (Expo Go o emulador Android):
$env:EXPO_PUBLIC_API_BASE_URL="http://10.0.2.2:18080"; $env:EXPO_PUBLIC_WEB_URL="http://10.0.2.2:5173"
pnpm dev:mobile
$env:VELORA_DEMO_API_BASE="http://127.0.0.1:18080"; node scripts/demo-movil.mjs   # 18 verificaciones
```

Sin `EXPO_PUBLIC_STOREFRONT_COMPANY_ID` el móvil siempre muestra el directorio; con él (producción) la tienda queda fijada.

### Cuentas

Las mismas de la Fase 4B (`docs/FASE4B_PLATAFORMA.md` §4B.7): cliente `cliente.demo@trama.seed.local`, Rodrigo (2 empresas, MAX), Daniela (1 empresa, PLUS), encargado `encargado.casa-montalvo.calacoto@seed.local` y el PLATFORM_ADMIN del `.env`.

### Qué mirar

| Min | Dónde | Qué mirar |
|---|---|---|
| 0:00 | Web, ventana angosta (< 1000px) en `/admin` como Rodrigo | Menú hamburguesa; con 2 empresas pasa por `/elegir-empresa` y vuelve a la sección pedida; "Cambiar de empresa" conserva la sección. |
| 0:30 | Web `/admin/pedidos` e `/admin/inventario` | Filtros en la URL (atrás los conserva), paginación, `Bs 1.234,50`, fechas `dd/mm/aaaa`, estados en español, confirmación con Escape. |
| 1:00 | Emulador: login | Marca Trama, "Soy cliente" / "Quiero abrir mi tienda" (abre la web). |
| 1:15 | Emulador como cliente | `/stores` con buscador y segmento; al entrar a Casa Montalvo toda la app toma su color; detalle con galería deslizable y tallas agotadas; bolsa y checkout con el descuento por compras estimado (MAX). |
| 2:00 | Emulador como Rodrigo | Mis empresas → Resumen (KPIs con comparación, barras, sucursal, rango) → Pedidos (confirmar/entregar) → Inventario (bajo/agotado, movimiento rápido) → Catálogo (activar y precio). Cambiar a Ímpetu Sport cambia el tema. |
| 2:30 | Emulador como Daniela (PLUS) | Widgets bloqueados "Disponible en MAX". |
| 2:45 | Emulador como encargado y como PLATFORM_ADMIN | Encargado: Modo operaciones + Pedidos y Stock de su sucursal. Plataforma: aviso para usar la web. |

## 4C.8 Estado

Fase 4C completa (28-oct-2026).

| Bloque | Estado | Notas |
|---|---|---|
| 1 Web | Hecho | `docs/UX_AUDIT.md`: 8 P1 y 15 P2 corregidos, 7 P3 pendientes. Redirecciones y formatos en `@velora/contracts` (13 pruebas nuevas en contracts, 5 en el front). |
| 2 Móvil base | Hecho | ThemeProvider/`makeStyles`, `PlatformBrand`/`CompanyBrand`, grupos por rol, `/stores`, Mis empresas, íconos regenerados. Pruebas: AA, derivados, redirección, sin VÉLORA y sin hex fuera del tema. |
| 3 Cliente | Hecho | Home, catálogo con filtros, detalle con galería y disponibilidad, descuento por compras, cuota del probador. |
| 4 Propietario y encargado | Hecho | Resumen por plan, pedidos, inventario, catálogo, sucursales, mi plan, formularios del Modo operaciones; el encargado reutiliza Pedidos e Inventario. |
| 5 Demo y guía | Hecho | `scripts/demo-movil.mjs` 18/18. Regresión: saas 32/32, offline 17/17, reportes 16/16, ML 13/13, plataforma 17/17. |

Desviaciones:
- **Endpoint nuevo (aditivo):** `GET /api/catalog/products/:id/availability?companyId=` devuelve solo el nivel (`IN_STOCK`/`LOW`/`OUT`) por variante. La auditoría mostró una carencia real: el cliente no tenía forma de saber qué talla estaba agotada. Incluye prueba de integración con aislamiento A/B.
- **Cancelar pedido como propietario:** no existe un endpoint de cancelación para el dueño (tampoco en la web); el móvil ofrece lo mismo que la web: reembolsar antes de entregar.
- **Descuento por compras y cuota del probador:** no hay endpoints de vista previa; el móvil los estima con la misma regla del backend (planes públicos + pedidos/trabajos del propio cliente) y lo rotula como estimado. El monto real lo fija el backend al crear el pedido.
- **Gráficos:** barras con `View` (no se agregó `react-native-svg`); los mapas de calor remiten a la web.
- **Puerto local:** el 8080 estaba ocupado por otro contenedor (`mrp-backend`); las demos corrieron contra 18080 con `VELORA_PUBLIC_BACKEND_URL` local. No se tocó ese contenedor.

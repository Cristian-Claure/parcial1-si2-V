# Fase 4C — Experiencia de uso web + móvil completo (cliente y propietario)

Rama `feat/ux-movil-completo`. Base: `main` @ `7dd6443` (Fase 4B mergeada). BD local `velora-local-v25` → `velora_migrated_v25` con 12.356 pedidos y 32 empresas (no se regenera).

## 4C.1 Punto de partida (auditoría rápida)

| Área | Estado | Implicación |
|---|---|---|
| Redirecciones web | `postLoginPath` en `apps/front/src/core/auth`, guardas en `RouteGuards.tsx`. `RequireRole` manda al login con `from`, pero la vuelta solo se respeta para CUSTOMER; un cliente en `/admin` va a su inicio por rol; no hay manejo global de 401 ni pantalla de 403 por plan. | Se mueve la lógica a funciones puras en `@velora/contracts/navigation.ts` (las usan web y móvil) y se completan los casos. |
| Shells web | Barra lateral fija, sin hamburguesa; el selector de compañía muestra `code`; textos técnicos ("Warehouse + ProductVariant", "React Web", "Fulfill", estados en inglés). | P1/P2 de la auditoría (ver `docs/UX_AUDIT.md`). |
| Tema móvil | `shared/theme.ts` exporta `colors` y `commonStyles` estáticos (paleta VÉLORA); 17 archivos con `StyleSheet.create` a nivel de módulo; 12 colores hexadecimales fuera del tema. | ThemeProvider + `makeStyles` memoizado por tema. |
| Auth móvil | `requireCustomer` rechaza ADMIN y PLATFORM_ADMIN. | Se admite ADMIN (propietario); PLATFORM_ADMIN recibe un aviso para usar la web. |
| Endpoints de dueño | Ya existen: `admin/companies`, `admin/plan`, `admin/stores`, `admin/users/managers`, `admin/reports/overview` (widgets por nivel con `locked[]`), `admin|manager/orders` y acciones de pago y entrega, `inventory/warehouses|stock|movements`, `catalog/manage/products` (`PUT products/:id` con `status`, `PUT variants/:id` con `price`). | **Sin endpoints nuevos.** El móvil solo consume lo que ya usa la web; el alcance lo decide `TenantScopeService`. |

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

_Se completa en el bloque 5._

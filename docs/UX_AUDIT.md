# Auditoría de uso — web (Fase 4C)

Método: lectura de código (rutas, guardas, shells, páginas y CSS) y pruebas automáticas (Vitest + Testing Library). Sin capturas; la revisión visual queda a cargo del dueño del proyecto.

Prioridad: **P1** confunde o bloquea · **P2** molesta · **P3** pulido. Todos los P1 y P2 están corregidos en el bloque 1; los P3 quedan listados.

## P1 — corregidos

| # | Hallazgo | Archivo | Corrección |
|---|---|---|---|
| 1 | Un 401 (token vencido) dejaba la sesión "abierta": cada acción fallaba con un error genérico y nunca se volvía al login. | `core/api/apiClient.ts`, `core/auth/authStore.ts` | `onUnauthorized` en el cliente → `authStore.expire()`; la guarda lleva a `/login` con `from` y `expired`, y el login muestra "Tu sesión expiró". Prueba en `Redirects.test.tsx`. |
| 2 | La vuelta tras el login solo funcionaba para clientes: un dueño que abría `/admin/inventario` terminaba en `/admin`. | `postLoginPath` (ahora en `@velora/contracts/navigation.ts`) | Se respeta `from` si el rol puede abrir esa ruta (`canRoleOpen`); se descartan rutas externas y de entrada. |
| 3 | Dueño con 2+ empresas: `/elegir-empresa` ignoraba a dónde iba y siempre entraba a `/admin`. | `ChooseCompanyPage.tsx`, `Shells.tsx` | `chooseCompanyPath(from)` + `afterCompanyChoicePath`; vuelve a la sección pedida. |
| 4 | El logout no limpiaba la empresa del panel ni la tienda activa: la siguiente cuenta en el mismo navegador heredaba la empresa y el tema del anterior. | `companyStore.ts`, `authStore.ts` | `companyStore.reset()` al cerrar sesión (se conserva solo el slug de la última tienda visitada) y salida ordenada a `/` sin rebote por las guardas. |
| 5 | Dueño sin empresas activas: el panel mostraba "Seleccione una compañía" sin nada que seleccionar. | `Shells.tsx` | Pantalla "Aún no tienes una empresa activa" con "Crear empresa" y "Ver mi plan" (esas dos rutas siguen accesibles). |
| 6 | En pantallas < 760px la barra lateral (13 enlaces) se apilaba sobre el contenido; entre 760 y 1000px robaba 220px. | `Shells.tsx`, `styles/usability.css` | Barra colapsable con menú hamburguesa bajo 1000px (cierra al navegar, con Escape o tocando fuera; `aria-expanded`/`aria-controls`). |
| 7 | Pedidos operativos renderizaba todos los pedidos de la empresa (miles con el historial de 12.356) en una sola lista. | `OperationalOrdersPage.tsx` | Paginación de 20, búsqueda y filtros por estado del pedido, del pago y sucursal. |
| 8 | Inventario: una tabla de cientos de variantes sin búsqueda ni filtro de agotado/bajo; además `event.currentTarget.reset()` después de un `await` fallaba (el formulario no se limpiaba). | `InventoryPage.tsx`, `Dashboards.tsx` | Búsqueda, filtro por nivel (con contadores clicables), paginación de 25 y `form.reset()` sobre la referencia guardada. |

## P2 — corregidos

| # | Hallazgo | Archivo | Corrección |
|---|---|---|---|
| 9 | Un cliente que entraba a `/admin` volvía a una tienda arbitraria. | `RouteGuards.tsx` | `guardRoute` compartido: cliente → `/tiendas`; encargado → `/sucursal`. |
| 10 | Cambiar de empresa en el selector no reubicaba la ruta; el enlace "Cambiar de empresa" perdía la sección. | `Shells.tsx` | `equivalentOwnerPath` conserva la sección y descarta parámetros de la empresa anterior. |
| 11 | `/t/:slug` inexistente: solo un botón, sin ayuda para encontrar la tienda. | `TenantEntry.tsx` | "Tienda no encontrada" con las tiendas del directorio en la misma pantalla. |
| 12 | Montos con `toFixed(2)` y sufijo "BOB" (`1234.50 BOB`); fechas con `toLocaleString()` del navegador. | 10 páginas | `formatMoney` → `Bs 1.234,50`, `formatDateTime` → `dd/mm/aaaa hh:mm` (en `@velora/contracts`, compartidos con el móvil). |
| 13 | Estados y tipos en inglés o técnicos (`RESERVED`, `PAID`, `FULFILLED`, `ENTRY`, "Fulfill", "React Web", "Warehouse + ProductVariant", "Company → Stores", "NestJS"). | Pedidos, inventario, resumen | Etiquetas en español (`ORDER_STATUS_LABELS`, `PAYMENT_*`, `MOVEMENT_TYPE_LABELS`) y textos para personas. |
| 14 | Filtros del catálogo, pedidos e inventario en estado local: se perdían con "atrás" o al recargar. | `CatalogPages.tsx`, pedidos, inventario | `useUrlState`: filtros, orden y página en la query string. |
| 15 | Asistente flotante con el monograma de VÉLORA en todas las tiendas y también en pantallas de la plataforma. | `FloatingAssistantButton.tsx` | Usa el logo (o la inicial) de la tienda activa y solo aparece dentro de una tienda. |
| 16 | Dueño nuevo sin guía: el resumen no indicaba qué hacer primero. | `Dashboards.tsx` | "Primeros pasos": sucursal, productos y marca, con enlaces; desaparece al completarse. |
| 17 | Diálogo de confirmación: sin Escape, sin foco inicial, doble clic posible y errores que lo cerraban sin aviso. | `ConfirmDialog.tsx` | Escape, foco en "Volver" y devolución del foco, estado "Procesando…" y error dentro del diálogo. |
| 18 | Registro con validación del navegador (idioma del sistema y sin explicar la regla de contraseña). | `AuthPages.tsx`, `registerValidation.ts` | Validación en línea en español con `aria-invalid`/`aria-describedby`. |
| 19 | Inputs de 14,7px (zoom automático en iOS), botones `.small` de ~34px y sin `:focus-visible` en enlaces y botones. | `styles/usability.css` | Inputs ≥ 16px y ≥ 44px de alto, botones y enlaces ≥ 44px (40px `.small` con puntero fino), contorno de foco con el acento. |
| 20 | Modales sin altura máxima (se cortaban en pantallas bajas); títulos largos desbordaban tarjetas. | `styles/usability.css` | `max-height: 100dvh − 2rem` con scroll y utilidades `.truncate` / `overflow-wrap`. |
| 21 | Listas sin estado vacío ni carga (pedidos, stock, elegir empresa). | Pedidos, inventario, elegir empresa | Estados vacíos con acción ("Quitar filtros", "Crear mi primera empresa") y esqueletos de carga. |
| 22 | Errores de límite de plan al crear sucursal o encargado no se mostraban. | `Dashboards.tsx` | `PlanErrorNotice` con enlace a "Mi plan". |
| 23 | El cliente no tenía "Cambiar de tienda" en su menú. | `Shells.tsx` | Enlace a `/tiendas` en la barra del cliente; "Otras tiendas" en el header público. |

Ya cumplían (verificado en el código): `/catalogo` sin tienda → `/tiendas`; 403 por plan en Inteligencia y en el constructor muestra "Disponible en MAX / PLUS/MAX" con botón a `/admin/mi-plan`; tablas dentro de `.table-wrap` con scroll horizontal; `lang="es"`; los enlaces profundos funcionan porque todas las rutas son de primer nivel en el router y las guardas guardan `from`.

## P3 — corregidos (Parte B, 29-oct-2026)

1. **Marca en `/t/:slug`**: al abrir otra tienda se suelta la marca anterior antes de pintar (`leaveTenant` en `useLayoutEffect`); mientras carga se ve un esqueleto con la marca Trama (`TenantEntry.tsx`).
2. **Avisos breves**: `toast()` + `<Toaster />` (`shared/feedback/toastStore.ts`, región `aria-live`, se cierran solos a los 4,5 s) en Mi plan, Empresas, Plataforma, Cobros, Inventario, Pedidos operativos y Registro offline. Los errores siguen como `Notice` persistente.
3. **Catálogo de gestión y POS**: búsqueda (nombre o SKU), categoría y página en la URL (`?q=&categoria=&pagina=`, 20 productos por página; POS 24 variantes por página) con `useUrlState` y `Pagination`.
4. **Reportes en pantallas angostas**: las tablas de detalle pasan a tarjetas (≤ 640 px) con la etiqueta de cada columna (`data-label`).
5. **Selector de empresa con logo**: `CompanySwitcher` (patrón listbox: ↑/↓, Inicio/Fin, Enter, Escape) reemplaza el `<select>` nativo de la barra lateral.
6. **Esqueletos**: `PageSkeleton`/`Skeleton` reemplazan el spinner en Mi plan, Planes, Crear tienda, Bolsa, Checkout, Detalle de producto, Banco demo, Cobros, Pagos y la entrada de tienda.
7. **Términos técnicos**: Auditoría muestra roles en español, la ruta legible (`admin › orders › fulfill`, el patrón completo queda en el título), "Correcto/Error (código)" y la referencia abreviada; Sincronización traduce los códigos de conflicto.

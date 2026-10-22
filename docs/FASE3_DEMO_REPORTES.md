# Fase 3 · Guía de demostración de reportes (3 minutos)

Requisitos: Docker con la BD `velora_migrated_v25` (historial sintético de la Fase 3), backend
(`pnpm dev:back`, que corre en `apps/back` y así encuentra los logos locales) y web (`pnpm dev:front`).

Cuentas de las tiendas de muestra (locales, documentadas en `docs/DATOS_SINTETICOS.md`):

| Plan | Tienda | Propietario |
|---|---|---|
| MAX | Urbano Boutique (y Urbano Outlet) | `lucia.arce@urbano.seed.velora.local` |
| PLUS | Andina Moda | `mateo.quispe@andina.seed.velora.local` |
| FREE | Primer Paso | `valeria.rojas@primerpaso.seed.velora.local` |

## A. Demo automática (30 s)

```powershell
pnpm build:packages
node scripts/demo-reportes.mjs
# Otro puerto: $env:VELORA_DEMO_API_BASE="http://127.0.0.1:18080"
```

Lee `VELORA_DEMO_{MAX,PLUS,FREE}_{EMAIL,PASSWORD}` del entorno o del `.env` local (no las imprime) y
`DATABASE_URL` para el SQL de referencia (solo lectura). Verifica 16 puntos:

1. **MAX**: venta neta y pedidos por mes × sucursal (12 meses) = SQL de referencia, y el total = KPI "Venta neta" del resumen.
2. **MAX**: unidades por categoría × talla filtrado por sucursal, con período anterior = SQL de referencia.
3. **PLUS**: valor de inventario por sucursal × categoría = SQL; la dimensión Cliente (ADVANCED) da 403 "Disponible en MAX"; el backend recorta el historial a 365 días.
4. **FREE**: constructor y exportación → `403 PLAN_LIMIT_REPORT_FEATURE`; `companyId` ajeno → 404.
5. **Exportación**: XLSX (hojas Resumen y Datos, encabezado fijo, autofiltro) y PDF (marca, filtros, totales, "Página X de Y") del constructor y del resumen; los deja en `%TEMP%\velora-demo-reportes`.
6. **Definiciones**: guardar, listar y eliminar.

Sale con código 1 si algo falla.

## B. Recorrido en el navegador (2 min 30 s)

1. **MAX · Reportes** (`/admin/reportes`, Urbano Boutique). Señala los widgets ADVANCED (mapa de calor, tendencia, comparativa de sucursales) y pulsa **PDF** y **Excel**: el archivo sale con el logo, los colores y los filtros.
2. Pulsa **Constructor** (`/admin/reportes/constructor`):
   - Período **12 meses**; agrupar por **Mes** y **Sucursal**; medidas **Venta neta** y **Pedidos pagados**. La vista previa sugiere líneas y muestra la tabla con totales.
   - Cambia a **Categoría** + **Talla**, filtra **Sucursal: Equipetrol**, marca **Comparar con el período anterior**: aparecen las variaciones por fila y en los totales.
   - Agrupa por **Día de la semana** + **Hora del día** con **Pedidos pagados**: sugiere mapa de calor (solo MAX).
   - Escribe un nombre y pulsa **Guardar**; ábrelo luego desde **Reportes guardados**. Exporta **PDF**.
3. **PLUS · Andina Moda**: en el constructor, Cliente, Hora, Día de la semana, Clientes nuevos y Clientes recurrentes aparecen con candado **MAX**. Elige **Todo el historial**: la nota indica que el período se ajustó a 365 días.
4. **FREE · Primer Paso**: en Reportes se ve "Constructor y exportación · Disponible en PLUS/MAX". Si entras a `/admin/reportes/constructor`, la tarjeta bloqueada invita a mejorar el plan.

Cierra con la **seguridad**: el navegador solo envía identificadores del catálogo (`STORE`, `NET_SALES`…). El backend los traduce desde una lista blanca a SQL parametrizado, dentro de una transacción de solo lectura con *timeout* de 10 s y un tope de 500 filas. El alcance siempre sale de `TenantScopeService`.

# Datos sintéticos realistas (Fase 3)

Generador: `scripts/seed-realistic-history.mjs` (reemplaza a `seed-historical-orders.mjs`). Produce
historial de **julio 2025 → 21 oct 2026** para alimentar reportes (Fase 3) y el entrenamiento ML (Fase 4).

## Principio: flujo real, solo fechas por SQL

Todo se crea por la API HTTP real: onboarding de propietarios y planes (tarjeta DEMO), marca y logo,
sucursales, puntos POS, categorías, productos y variantes, stock inicial (`ENTRY`), registro de clientes,
carrito → pedido → pago → confirmación → entrega o cancelación, ventas POS con sesión de caja (apertura y
cierre) y reposiciones (`ENTRY`, `reference_type = SEED_RESTOCK`) cuando el disponible proyectado baja de 6.

La única escritura SQL reescribe **columnas de fecha** de las filas generadas por cada pedido (pedido,
ítems, asignaciones, pagos, historial de pagos, movimientos de inventario, carrito, sesiones y movimientos
de caja), del stock inicial, de las reposiciones y del alta de clientes. Nunca toca montos, estados ni stock.
Se ejecuta con `session_replication_role = replica` para no disparar triggers de versión ni el cursor de
sincronización de la Fase 2.

## Tiendas

| Empresa | Plan | Sucursales | Productos | Clientes | Pedidos/día base | Crecimiento mensual | Ecommerce | Delivery | Desde |
|---|---|---|---|---|---|---|---|---|---|
| Urbano Boutique | MAX | 4 (Equipetrol, Centro, Las Brisas, Norte) | 60 | 450 | 6 | 5 % | 60 % | 55 % | jul-2025 |
| Urbano Outlet (misma cuenta) | MAX | 2 (Ventura, Plan 3000) | 40 | 170 | 2 | 4 % | 30 % | 35 % | jul-2025 |
| Andina Moda | PLUS | 3 (Sopocachi, Calacoto, El Alto) | 50 | 230 | 3 | 4,5 % | 50 % | 45 % | jul-2025 |
| Primer Paso | FREE | 1 (Cochabamba Centro) | 18 | 150 | 3 | 4 % | 40 % | 30 % | 11-sep-2026 (~40 días) |
| VÉLORA (existente) | — | las suyas | las suyas | +180 | 2,2 | 3 % | 45 % | 50 % | completa jul-2025 sin huecos |

Las sucursales tienen pesos de demanda distintos (la principal = 1; las demás 0,5–0,85).

## Patrones de demanda

Pedidos esperados por día = `base × (1 + crecimiento)^meses × semana × quincena × fecha especial × ruido`
(ruido log-normal σ = 0,15) y luego Poisson. Semilla fija **20251001** (mulberry32 por clave), así que dos
corridas producen los mismos pedidos.

- **Semana** (dom..sáb): 1,20 · 0,80 · 0,85 · 0,90 · 1,00 · 1,25 · 1,45 — viernes a domingo más altos.
- **Quincena / fin de mes**: días 14–16 ×1,15; último, penúltimo y día 1 ×1,20.
- **Fechas especiales**: Día del Padre 19-mar ×1,6 (16–18 ×1,25); Día de la Madre 27-may ×1,8 (24–26 ×1,3);
  Black Friday 28-nov-2025 ×2,5 (29–30 ×1,4); 15–23 dic ×1,5, 24 dic ×1,8, 25 dic ×0,5.
- **Categoría** (hemisferio sur): abrigos y tejidos ×2,6 en jun–ago (×0,6 el resto); vestidos, sandalias y
  lentes ×2,2 en nov–feb y ×0,5 en invierno.
- **Pareto**: pesos de producto con cola larga; el 20 % de productos concentra 64–79 % de las unidades.
- **Segmentos de cliente**: fiel de ticket alto 12 %, ocasional 40 %, compra única 33 %, en riesgo de
  abandono 15 % (deja de comprar entre el 35 y el 65 % de su vida restante). Altas crecientes hacia el final.
- **Horas locales (UTC-4)**: ecommerce con picos 12–14 h (38 %) y 19–22 h (40 %); POS entre 10 y 20 h.
- **Canal y entrega**: POS = `IN_STORE` (efectivo 58 %, QR 27 %, tarjeta 15 %); ecommerce DELIVERY
  (contra entrega 45 %, QR 35 %, tarjeta 20 %) o PICKUP (efectivo 40 %, QR 40 %, tarjeta 20 %). Sin Stripe.
- **Cancelaciones**: base 4 % + 6 % DELIVERY + 5 % ticket > 600 Bs + 5 % contra entrega (+1,5 % QR).
  Resultado: DELIVERY 14,9 %, PICKUP 7,2 %, IN_STORE 0,7 % (anulaciones del POS).
- **Pendientes**: en los últimos días, 55 % de los pedidos ecommerce queda reservado o con pago pendiente.
- **Descuento de fidelidad**: lo calcula el backend (planes con escalones). Como la ventana del descuento usa
  la fecha real de la corrida, todas las compras entregadas cuentan y el descuento aparece antes que en la vida
  real (Urbano Boutique 47 % de pedidos con descuento, VÉLORA 21 %). No hay `try_on_jobs` sintéticos.

## Continuidad (`--fill-gaps`)

Después de la corrida principal: cada empresa activa (excepto FREE) queda con **al menos un pedido por día en
los últimos 90 días** y, en el mes en curso, con el **85 % del ritmo diario de los 60 días previos** ajustado
por día de semana. Usa el mismo flujo HTTP, con claves de idempotencia propias (`gap`).

## Uso

```powershell
node scripts/seed-realistic-history.mjs --dry-run              # solo plan y conteos
node scripts/seed-realistic-history.mjs                          # todo (≈ 6 min con el backend local)
node scripts/seed-realistic-history.mjs --only velora --resume  # una tienda / reanudar
node scripts/seed-realistic-history.mjs --resume --fill-gaps    # continuidad
node scripts/seed-realistic-history.mjs --verify                 # estadísticas en JSON
```

Variables (`.env` raíz, nunca se imprimen): `VELORA_SEED_API_BASE`, `DATABASE_URL`,
`VELORA_SEED_OWNER_EMAIL` / `VELORA_SEED_OWNER_PASSWORD` (sin ellas se omite VÉLORA). El backend debe correr
con el límite de intentos de login alto y **sin** claves de OpenAI/Replicate. El progreso se guarda en
`scripts/.seed-progress/` (ignorado por git).

Cuentas locales: propietarios `lucia.arce@urbano.seed.velora.local`, `mateo.quispe@andina.seed.velora.local`,
`valeria.rojas@primerpaso.seed.velora.local` (contraseña `SeedPropietario2026`); clientes
`<empresa>.clienteNNNN@clientes.seed.velora.local` (`SeedCliente2026`).

## Verificación (21-oct-2026, BD `velora_migrated_v25`)

| Empresa | Pedidos | Clientes compradores | Vie–dom vs lun–jue | Top 20 % productos |
|---|---|---|---|---|
| Urbano Boutique | 4.704 | 419 | 1,41 | 79,1 % |
| VÉLORA | 2.503 | 190 | 1,29 | 63,9 % |
| Andina Moda | 2.166 | 213 | 1,53 | 72,9 % |
| Urbano Outlet | 1.468 | 145 | 1,33 | 70,8 % |
| Primer Paso | 145 | 52 | 1,28 | 78,4 % |
| **Total** | **10.986** | | | |

Controles: 0 días sin pedidos en los últimos 90 días (empresas activas no FREE), 0 stock negativo,
0 pedidos con `total ≠ Σ ítems − descuento`, 0 filas cruzadas entre empresas. Un pedido de VÉLORA
(`9f3b46ee…`, entregado sin pago, 30-ago-2026) es dato **previo** al generador y no se modificó.
El primer mes de cada tienda es más bajo: la base de clientes se va dando de alta con el tiempo.

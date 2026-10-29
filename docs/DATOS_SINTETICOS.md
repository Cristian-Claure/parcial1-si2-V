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

---

# Historial final para la defensa (Parte B · `scripts/seed-final-history.mjs`)

Mismo principio: **todo por HTTP real** (carrito, pedido, pago, confirmación, entrega/cancelación, POS con sesión de caja, reposición con movimientos `ENTRY`) y la única escritura SQL reescribe **columnas de fecha**. Semilla `20261111`, progreso reanudable en `scripts/.seed-progress/final-20261111.json` (no versionado).

| Tienda | Qué hace el script |
|---|---|
| VÉLORA | Retroceso **2024-11-11 → 2025-05-31** anclado al ritmo real del primer mes (≈ 1 pedido/día), 4 %/mes hacia atrás, Black Friday 2024 y Navidad; 70 clientes históricos nuevos. Junio 2025 original (28 pedidos) se completa con pedidos **nuevos** hasta 51 para que la unión no tenga un bache. **Sin días vacíos desde el 2024-11-11.** No se borra ni modifica ningún pedido existente. |
| Urbano Boutique, Urbano Outlet, Andina Moda | Continúan desde su ritmo real de los últimos 28 días (15–16 meses de historia). |
| Casa Montalvo, Ímpetu Sport | Retroceso **2026-05-10 → 2026-07-22** (≈ 6 meses al 11-nov); el stock inicial se re-fecha al día anterior al nuevo primer pedido. |
| Solana | Sus 451 pedidos existentes se **re-fechan** al tramo 12-oct → ayer (desplazamiento por pedido o por sesión de caja aplicado a todas sus fechas: pagos, historial, movimientos, carrito). Cada semana (lunes a domingo) vale un **10 % más** que la anterior; dentro de la semana, la demanda se reparte por fin de semana y promociones (24-oct y 7-nov), y los tickets más altos van más tarde. Luego sigue la misma curva, con más recompra (clientes con compras previas ×3) y ticket creciente. Empresa, sucursales, catálogo, stock, propietaria, encargados y suscripción quedan dados de alta el 12-oct. |
| Primer Paso (FREE) | Continúa; excluida de la regla de continuidad. |

- **Día en curso**: solo se ejecutan los pedidos cuya hora ya pasó; el resto queda pendiente para la siguiente corrida con `--resume`. Nunca hay pedidos en el futuro.
- **Huecos**: ≥ 1 pedido diario en los últimos 90 días (VÉLORA desde el 2024-11-11).
- **Altas coherentes**: empresa, sucursales, almacenes, cajas, categorías, productos, variantes, stock y cuentas ≤ primer pedido.
- **Tramo final** (lanzar el 9 o 10 de noviembre): `node scripts/seed-final-history.mjs --until 2026-11-11 --resume`.
- `--dry-run` simula sin escribir; `--only <slug>` limita a una tienda; `--verify` imprime las comprobaciones.

## Verificación (29-oct-2026, `--verify`)

| Comprobación | Resultado |
|---|---|
| Días vacíos (últimos 90 días; VÉLORA desde 2024-11-11; FREE excluida) | **0** |
| Stock negativo o comprometido > físico | **0** |
| `total ≠ Σ ítems − descuento` | **0** |
| Pedido de una empresa con producto de otra | **0** |
| Empresa creada después de su primer pedido / pedidos en el futuro | **0 / 0** |
| Pagos incoherentes con el estado | **1** — pedido original de VÉLORA del 30-ago-2026 (entregado sin pago), anterior a esta fase; no se modificó por la regla de no tocar pedidos existentes. |

| Tienda | Pedidos | Desde | Viernes–domingo vs lunes–jueves | Top 20 % de productos |
|---|---|---|---|---|
| Urbano Boutique | 4.787 | 2025-07-01 | 1,42 | 78 % |
| VÉLORA | 2.807 | 2024-11-11 | 1,29 | 60 % |
| Andina Moda | 2.205 | 2025-07-03 | 1,53 | 72 % |
| Urbano Outlet | 1.496 | 2025-07-01 | 1,32 | 70 % |
| Ímpetu Sport | 835 | 2026-05-10 | 1,40 | 69 % |
| Casa Montalvo | 736 | 2026-05-10 | 1,39 | 74 % |
| Solana | 451 (+ hoy) | 2026-10-12 | 1,21 | 75 % |
| Primer Paso | 176 | 2026-09-11 | 1,30 | 74 % |

**Solana**: semanas 180 → 197 pedidos (+9,4 %), ticket medio 406 → 514 → 680 Bs, recompra 47 % (36 de 76 clientes con 2 o más compras), 27,8 pedidos/día en los últimos 14 días frente a 7,4 de Ímpetu y 6,1 de Casa Montalvo.

**VÉLORA por mes**: nov-24 19 · dic 48 · ene-25 44 … may 46 · jun 51 · jul 68 · … · ago-26 255. **Limitación honesta**: de enero a mayo de 2025 la curva es casi plana (~1,4 pedidos/día), porque el mínimo de un pedido diario domina sobre el 4 %/mes de una base tan baja.

Segmentos de clientes (todas las tiendas): 588 con 1 compra, 231 con 2–3, 305 con 4–9 y 265 con 10 o más.

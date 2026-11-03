# Imágenes de producto y Probador

> **Aviso:** las imágenes de producto de las tiendas de muestra son **ilustrativas, generadas con IA**
> (Replicate · `black-forest-labs/flux-1.1-pro`). Las fotos de VÉLORA no se tocan.

## Auditoría (2026-11-02, BD `velora-local-v25`)

| Tienda | Activos | Imagen principal antes | Probador antes |
|---|---|---|---|
| VÉLORA | 51 | 51 fotos reales (PNG 1–2 MB); *Set Capri* sin imagen | 5 (Abrigo Camelia, Blusa Abril, Falda Magnolia, Pantalón Roma, Vestido Aurora) |
| Casa Montalvo · Ímpetu Sport · Solana | 26 · 26 · 27 | ilustración vectorial plana (`seed-new-stores.mjs`, 1122×1402, ~60 KB) | 0 |
| Andina Moda · Primer Paso · Urbano Boutique · Urbano Outlet | 50 · 18 · 60 · 40 | ninguna (placeholder de la UI) | 0 |

Categorías: abrigos, blusas/camisas/tops, tejidos, pantalones, shorts/faldas, vestidos, conjuntos,
trajes de baño, kimonos/pareos, bolsos, lentes, sombreros, calzado y accesorios. Colores: 27 nombres
(Negro, Camel, Marfil, Terracota, Gris carbón, Azul marino…), mapeados a inglés en el script.

**Cómo funciona el Probador.** Un producto aparece en el Probador web (`TryOnPage.tsx`) y móvil
(`app/(customer)/try-on.tsx`) cuando la API de catálogo devuelve `tryOnReady = true`:
`tryOnEnabled` + `tryOnCategory` (`TOP | BOTTOM | DRESS | OUTERWEAR`; también existen `SHOES` y
`ACCESSORY`, que no usamos) + al menos una imagen `TRY_ON_GARMENT` con `storageKey`. Al crear una prueba,
la web envía la variante elegida (por defecto la primera activa) y el backend busca la prenda **de esa
variante** (`try-on.repository.ts` → `garments`). VÉLORA la tiene en una sola variante por producto. Se
habilita con `PUT /api/catalog/manage/products/:id` y
`POST /api/catalog/manage/products/:id/assets` (multipart `file`, `purpose=TRY_ON_GARMENT`, `variantId`).
Hay una prenda por variante (si se repite, responde 409). El modelo de prueba virtual de Replicate recibe la
prenda como `garment_images`. No hay límite de plan para imágenes ni para habilitar productos; solo existe
la cuota mensual de pruebas por cliente (`PLAN_LIMIT_TRY_ON`).

## Plan

- **Una imagen por producto** en su color principal (el que tiene más variantes activas): 247 de las
  tiendas de muestra + *Set Capri*. Las fotos de VÉLORA se conservan.
- **Galería existente** (Casa Montalvo, Ímpetu, Solana): se sobrescribe el archivo de su clave en
  `apps/back/storage/assets` (misma clave `.png`). No existe un endpoint de borrado. **Productos sin imagen:**
  se suben por `POST …/assets` (`purpose=GALLERY`, `primary=true`).
- **Probador:** objetivo 5 productos por tienda, rotando categorías compatibles (partes superiores, abrigos,
  pantalones/shorts/faldas, vestidos; se excluyen calzado, accesorios, bolsos, lentes, sombreros, trajes de
  baño, kimonos/pareos y conjuntos). Se usa el mismo PNG como `TRY_ON_GARMENT` en **cada variante activa
  del color generado**, para que funcione cualquier talla de ese color.
- **Estilo:** solo la prenda, centrada, fondo blanco, 4:5 (como `apps/front/src/assets/products`).
  FLUX no tiene prompt negativo: nombrar "maniquí", "percha" o "persona", aunque sea con "no", los hace
  aparecer (así pasó en el piloto v1). El prompt usa solo términos positivos: *invisible ghost-effect…
  floating by itself… hollow empty neckline*.

## Estado real (2026-11-03)

Presupuesto: US$ 0,56 de piloto + **US$ 1,48 de tope duro** (crédito de Replicate ~US$ 2,48; se reserva
US$ 1,00). Se generaron 37 imágenes con el tope; en total se aprobaron y subieron **28**, es decir,
**4 prendas por tienda**, todas en galería y en el Probador:

| Tienda | Galería | Probador |
|---|---|---|
| Andina Moda | 4 subidas (antes sin imagen) | 4 (blusa, cargo, 2 vestidos) |
| Casa Montalvo | 4 ilustraciones reemplazadas | 4 (2 abrigos, camisa, saco) |
| Primer Paso | 4 subidas | 4 (abrigo, blusa, 2 vestidos) |
| Solana | 4 ilustraciones reemplazadas | 4 (blusa, falda, 2 vestidos) |
| Urbano Boutique | 4 subidas | 4 (2 blusas, chaqueta, vestido) |
| Urbano Outlet | 4 subidas | 4 (abrigo, blusa, 2 vestidos) |
| Ímpetu Sport | 4 ilustraciones reemplazadas | 4 (buzo, camiseta, cortavientos, hoodie) |
| VÉLORA | sin cambios (fotos reales) | 5 (sin cambios) |

**Se descartaron 13 imágenes:** fondo gris en prendas blancas o crema (4), pantalones generados como conjunto o
mono (5), prenda cortada o fondo oscuro (3) y color equivocado (1). **Tras la IA quedaron 220 sin imagen de IA:**
el resto del catálogo de las 7 tiendas, por presupuesto, más *Set Capri* de VÉLORA (descartado por fondo gris).
De ellos, los 153 que no tenían ninguna imagen recibieron ilustraciones planas (ver más abajo); los demás
conservan su ilustración de la Fase 4B. El detalle está en `manifest.json` → `pending`.
En los productos sobrescritos, el `altText` antiguo ("… (ilustración)") se conserva porque no hay endpoint
para editarlo.

**Lecciones:** las prendas claras salen sobre fondo gris (colores claros al final de la cola); a los
pantalones les falta un prompt propio para que no generen un conjunto (pendiente); los colores vivos
(azul eléctrico) a veces tiñen el fondo.

## Ilustraciones para lo que no tenía imagen (Fase 5, 3-nov-2026, sin IA)

`scripts/illustrate-missing-products.mjs` creó **153 ilustraciones planas** (SVG → PNG 1122×1402 con sharp, sin
texto ni logos) para los productos activos sin imagen principal: Andina Moda 46, Primer Paso 14, Urbano
Boutique 56, Urbano Outlet 36 y *Set Capri* de VÉLORA 1. Se subieron por `POST …/assets` (`GALLERY`, principal,
"<nombre> (ilustración)") con la cuenta de cada tienda. No se tocaron las fotos de VÉLORA, las 28 imágenes de IA
ni las ilustraciones de Casa Montalvo, Ímpetu y Solana.

- **Plantillas** (`scripts/lib/garment-art.mjs`): a las 24 de la Fase 4B se suman suéter, cárdigan, chaleco,
  poncho, parka, trench, chaqueta acolchada, jean, cargo, palazzo, lentes, bandolera, clutch, mochila y
  conjunto, más las infantiles de Brote (polo, pijama, body, gorro y medias). `artFor()` elige la plantilla
  por palabras del nombre y luego de la categoría; si no encuentra ninguna, usa `cardSvg()` (tarjeta
  tipográfica). En esta corrida, los 153 productos tuvieron plantilla.
- **Color**: el color principal de cada producto (las variantes sembradas sin `colorHex` usan un mapa de
  nombre a hex). El fondo es el tono `paper` de la marca de cada tienda.
- **Idempotente**: un producto que ya tiene imagen GALLERY no se vuelve a subir. `--resume` salta lo que el
  manifest marca como subido; `--dry-run --sample` solo genera hojas de control. Los PNG están en
  `Documents\imagenes-trama\ilustraciones\<tienda>\` y el estado, en `manifest.json` → `illustrations`.
- **Resultado:** ningún producto activo de las 9 tiendas queda sin imagen principal.

## Regenerar

```powershell
node scripts/generate-product-images.mjs plan                       # cuenta y costo (no gasta)
node scripts/generate-product-images.mjs generate --only velora/set-capri --force
node scripts/generate-product-images.mjs sheet --store solana       # hojas de 12 miniaturas
node scripts/generate-product-images.mjs reject solana/blusa-lirio --reason "texto en la prenda"
node scripts/generate-product-images.mjs regenerate                 # rechazadas, máx. 2 reintentos
node scripts/generate-product-images.mjs upload --store solana      # galería + Probador (API admin)
node scripts/generate-product-images.mjs verify
```

El script lee `REPLICATE_API_TOKEN` y las cuentas propietarias del `.env`, sin imprimirlos. Lleva el costo
en el manifest con un tope (`--budget`, US$ 12 por defecto) y respeta el límite de Replicate (6
predicciones/min con crédito < US$ 5). Al procesar cada imagen: si el fondo es casi blanco (≥ 232), lo
lleva a blanco; después completa el 4:5 exacto con margen blanco y rechaza la imagen si las esquinas no
quedan blancas. Originales, PNG finales y `manifest.json` (prompt, modelo, semilla, costo, estado y clave
de storage) quedan en `%USERPROFILE%\Documents\imagenes-trama\<tienda>\<sku>-<color>-front.png`, **fuera
de git**.

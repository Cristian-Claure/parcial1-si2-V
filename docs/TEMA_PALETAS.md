# Paletas de las tiendas de muestra

Las paletas se cambiaron por el endpoint de marca (`PATCH /api/admin/companies/:id/branding`) con la cuenta de cada dueño, sin SQL y respetando el nivel de marca del plan. Los tokens salen de `deriveTheme` (`@velora/contracts/theme.ts`), la misma función que aplica la web. Para verificarlos: `node scripts/verify-theme.mjs`, con `VELORA_DEMO_API_BASE` apuntando al backend.

## Cambios

| Tienda (plan) | Antes (acento) | Ahora: fondo · texto · primario · acento | Identidad |
|---|---|---|---|
| VÉLORA, Casa Montalvo, Ímpetu Sport, Solana | — | Sin cambios | Se conservan. |
| Urbano Boutique (MAX) | Azul `#1F3A5F` sobre arena | `#F2F5F3` · `#0F1611` · `#183A1E` · `#0B7A5C` | Negro urbano, bosque y esmeralda. |
| Urbano Outlet (MAX) | Terracota `#A4452C` sobre arena | `#F4F5F2` · `#16180F` · `#2E3612` · `#1D5FA3` | Oliva oscuro y azul acero. |
| Andina Moda (PLUS) | Granate `#7A2E2A` sobre arena | `#F8F2F6` · `#2A1426` · `#3E1838` · `#9A1F86` | Ciruela y fucsia. |
| Primer Paso (FREE) | Verde `#2F6B4F` (fondo arena heredado) | Solo acento `#7238CF`; el resto se deriva | Violeta. |

### Ajustes respecto de las sugerencias (y por qué)

La regla de diversidad pide que ningún par de tiendas comparta matiz de acento ni de barra lateral (≥ 40°). Las sugerencias chocaban con las tiendas conservadas, así que se ajustaron:

- **Urbano Outlet**: el ámbar `#B45309` (26°) quedaba a 11° de VÉLORA y a 9° de Ímpetu, y la barra grafito (216°) a 4° de Casa Montalvo. Pasó a acento azul acero (210°) con barra oliva (73°).
- **Andina Moda**: la frambuesa `#A3345F` (337°) quedaba a 17° de Casa Montalvo. Pasó a fucsia ciruela (310°), conservando la barra ciruela.
- **Primer Paso**: con un azul `#2563EB` como único color, la barra derivada (221°) quedaba a 1° de Ímpetu y a 9° de Casa Montalvo. Pasó a violeta (263°).
- **Urbano Boutique**: la barra `#0E2B25` (168°) quedaba a 8° de Solana. Pasó a un verde bosque (131°) con el mismo esmeralda.

**Límite:** las cuatro tiendas conservadas ya tenían acentos cercanos entre sí (Solana 9°, Ímpetu 17°, VÉLORA 37° y Casa Montalvo 354°), y Casa e Ímpetu comparten una barra azul marino. Con ellas intactas, la regla no se puede cumplir entre esos pares. `verify-theme.mjs` los informa como aviso; cualquier par que incluya una tienda modificada debe cumplir los 40°.

## Tokens derivados

| Tienda | Nivel | Fondo | Texto | Primario | Acento | Barra (bg → bg-2) | Activo / indicador | accent-deep | ink-soft | Gráficos |
|---|---|---|---|---|---|---|---|---|---|---|
| VÉLORA | FULL | #FAF6F0 | #17130F | #17130F | #8B6A34 (37°) | #17130F → #231D17 (30°) | #372B19 / #8B6A34 | #6D5329 | #726E69 | #8B6A34 #899537 #7E392F #3C8690 #352D6C #5D4732 |
| Casa Montalvo | FULL | #F4F1EA | #1C1F26 | #23303F | #8C2F39 (354°) | #23303F → #2A3A4C (212°) | #40303D / #C5525E | #6D252D | #696B6C | #8C2F39 #A06036 #822C60 #38945C #2A546F #32465D |
| Ímpetu Sport | FULL | #F2F4F7 | #0B1220 | #0B1220 | #C2410C (17°) | #0B1220 → #101B2F (220°) | #3E1F1A / #C2410C | #9C340A | #676C76 | #C2410C #A68A1B #951832 #219B81 #1B307E #253C6A |
| Solana | FULL_PALETTE | #FFF8EF | #24313A | #115E59 | #B8432F (9°) | #115E59 → #146F69 (176°) | #40564D / #DF9082 | #983727 | #6B7275 | #B8432F #AB7E2C #8A2348 #309C76 #244175 #167972 |
| Urbano Boutique | FULL | #F2F5F3 | #0F1611 | #183A1E | #0B7A5C (164°) | #183A1E → #1E4825 (131°) | #144C2F / #0D8D6A | #085540 | #6A6F6B | #0B7A5C #1E95B8 #189535 #A8248A #7E321B #2A6534 |
| Urbano Outlet | FULL | #F4F5F2 | #16180F | #2E3612 | #1D5FA3 (210°) | #2E3612 → #3B4517 (73°) | #29413B / #267DD7 | #174B80 | #6F706A | #1D5FA3 #2120B6 #1A9293 #A62726 #7C7D1C #5B6B24 |
| Andina Moda | FULL_PALETTE | #F8F2F6 | #2A1426 | #3E1838 | #9A1F86 (310°) | #3E1838 → #4D1E45 (309°) | #581A4E / #C428AB | #781868 | #746471 | #9A1F86 #B22454 #691D90 #509F28 #1F7A5B #67285D |
| Primer Paso | BASIC | #F7F5F9 | #191127 | #2C1452 | #7238CF (263°) | #2C1452 → #351862 (263°) | #401E75 / #8351D5 | #5F2BB3 | #726C7B | #7238CF #9D2AAD #222E8C #9A8D2D #2C7722 #3E1C73 |

| Tienda | texto/fondo | texto suave/fondo | blanco/accent-deep | botón/acento | texto/primario | barra texto | barra activo | barra secundario | indicador | gráfico mín. |
|---|---|---|---|---|---|---|---|---|---|---|
| VÉLORA | 17.16 | 4.7 | 7.19 | 4.99 | 18.48 | 16.99 | 12.69 | 8.6 | 3.7 | 3.04 |
| Casa Montalvo | 14.62 | 4.75 | 10.75 | 8.14 | 13.41 | 12.26 | 11.24 | 5.68 | 3.03 | 3.35 |
| Ímpetu Sport | 16.99 | 4.78 | 7.22 | 5.18 | 18.72 | 17 | 13.47 | 8.16 | 3.62 | 3.04 |
| Solana | 12.65 | 4.65 | 7.21 | 5.41 | 7.58 | 7.06 | 7.36 | 5.12 | 3.05 | 3.24 |
| Urbano Boutique | 16.73 | 4.67 | 8.81 | 5.31 | 12.63 | 11.73 | 9.26 | 5.66 | 3.03 | 3.16 |
| Urbano Outlet | 16.38 | 4.57 | 8.92 | 6.53 | 12.71 | 11.9 | 10.28 | 5.8 | 3.02 | 3.44 |
| Andina Moda | 15.51 | 5 | 9.86 | 7.21 | 15.08 | 13.67 | 11.38 | 6.2 | 3.04 | 3 |
| Primer Paso | 16.84 | 4.67 | 8.46 | 6.6 | 15.8 | 14.22 | 11.38 | 6.47 | 3.09 | 3.12 |

Umbrales: texto ≥ 4,5:1 (AA). Indicador de la barra y series de gráficos ≥ 3:1 (componentes no textuales, WCAG 1.4.11). En «botón/acento», el texto del botón es blanco o el `ink`, el que contraste más.

## Reglas de derivación (resumen)

`paper-raised` = fondo + 60 % blanco · `hairline` = 12 % texto sobre fondo · `ink-soft` = 60 % texto, ajustado hasta AA · `accent-deep` = acento −8 % L hasta AA contra blanco · `accent-soft` = 14 % acento · barra = primario si L ≤ 25 %; si no, L 18 % con el mismo matiz (saturación 22–55 %), `bg-2` +4 %, hover +6 % · activo = 28 % de acento · indicador = acento aclarado hasta 3:1 · sombras desde el `ink` (`--shadow-rgb`) · gráficos: acento, ±30°, ±150° y el matiz del primario, oscurecidos hasta 3:1 · FREE: fondo L 97 %, texto L 11 % y primario L 20 % con el matiz del acento.

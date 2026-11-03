// Ilustraciones vectoriales planas de prendas (SVG parametrizado por color → PNG con sharp), logos
// monograma y banners de marca para las tiendas sembradas. Sin texto, sin fotos y sin marcas de
// terceros. Lienzo 400×500 (proporción 4:5), exportado a 1122×1402.

const W = 400;
const H = 500;

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
}
function rgbToHex(rgb) {
  return `#${rgb.map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`;
}
/** Mezcla con negro (amount > 0) o con blanco (amount < 0). */
export function shade(hex, amount) {
  const target = amount > 0 ? 0 : 255;
  const weight = Math.abs(amount);
  return rgbToHex(hexToRgb(hex).map((value) => value + (target - value) * weight));
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((value) => value / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ---------------------------------------------------------------- siluetas (viewBox 400×500)

const SHAPES = {
  tshirt: (c) => `<path d="M120 100 L165 78 Q200 104 235 78 L280 100 L345 160 L308 196 L282 176 L282 430 L118 430 L118 176 L92 196 L55 160 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M165 78 Q200 104 235 78" fill="none" stroke="${c.dark}" stroke-width="7"/>
    <path d="M128 250 L272 250" stroke="${c.light}" stroke-width="10" opacity=".45"/>`,
  shirt: (c) => `<path d="M118 98 L162 76 L238 76 L282 98 L322 128 L346 340 L310 346 L286 182 L286 432 L114 432 L114 182 L90 346 L54 340 L78 128 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M162 76 L200 118 L176 136 L150 92 Z M238 76 L200 118 L224 136 L250 92 Z" fill="${c.light}" stroke="${c.line}" stroke-width="2.5"/>
    <path d="M200 118 L200 432" stroke="${c.dark}" stroke-width="3"/>
    ${[170, 220, 270, 320, 370].map((y) => `<circle cx="210" cy="${y}" r="4.5" fill="${c.dark}"/>`).join("")}
    <path d="M226 190 h34 v30 h-34 z" fill="none" stroke="${c.dark}" stroke-width="2.5"/>`,
  blazer: (c) => `<path d="M114 98 L160 74 L240 74 L286 98 L326 128 L350 352 L312 358 L290 186 L292 440 L108 440 L110 186 L88 358 L50 352 L74 128 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M160 74 L200 250 L240 74 L222 74 L200 170 L178 74 Z" fill="${c.shirt}"/>
    <path d="M160 74 L138 120 L170 150 L148 168 L200 250 Z M240 74 L262 120 L230 150 L252 168 L200 250 Z" fill="${c.dark}" stroke="${c.line}" stroke-width="2"/>
    <path d="M200 250 L200 440" stroke="${c.line}" stroke-width="2.5"/>
    <circle cx="200" cy="292" r="6" fill="${c.line}"/><circle cx="200" cy="336" r="6" fill="${c.line}"/>
    <path d="M130 330 h46 M224 330 h46 M232 196 h34" stroke="${c.line}" stroke-width="3"/>`,
  coat: (c) => `<path d="M112 92 L158 70 L242 70 L288 92 L328 124 L352 380 L314 386 L292 184 L304 476 L96 476 L108 184 L86 386 L48 380 L72 124 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M158 70 L134 126 L172 154 L146 176 L200 236 L254 176 L228 154 L266 126 L242 70 L200 150 Z" fill="${c.dark}" stroke="${c.line}" stroke-width="2"/>
    <path d="M200 236 L200 476" stroke="${c.line}" stroke-width="2.5"/>
    ${[276, 330, 384].map((y) => `<circle cx="184" cy="${y}" r="6" fill="${c.line}"/><circle cx="216" cy="${y}" r="6" fill="${c.line}"/>`).join("")}
    <path d="M114 300 L176 300 M224 300 L286 300" stroke="${c.dark}" stroke-width="10" stroke-linecap="round"/>`,
  hoodie: (c) => `<path d="M150 82 Q200 22 250 82 L248 120 Q200 96 152 120 Z" fill="${c.dark}" stroke="${c.line}" stroke-width="3"/>
    <path d="M118 102 L160 80 Q200 112 240 80 L282 102 L322 132 L348 350 L310 356 L286 186 L286 434 L114 434 L114 186 L90 356 L52 350 L78 132 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M150 300 L250 300 L268 380 L132 380 Z" fill="${c.dark}" opacity=".55"/>
    <path d="M186 104 L182 176 M214 104 L218 176" stroke="${c.light}" stroke-width="4" stroke-linecap="round"/>
    <path d="M114 414 L286 414 M88 340 L114 340 M286 340 L312 340" stroke="${c.dark}" stroke-width="10"/>`,
  windbreaker: (c) => `<path d="M150 80 Q200 30 250 80 L246 112 Q200 92 154 112 Z" fill="${c.dark}" stroke="${c.line}" stroke-width="3"/>
    <path d="M118 100 L160 80 L240 80 L282 100 L322 130 L348 350 L310 356 L286 184 L286 434 L114 434 L114 184 L90 356 L52 350 L78 130 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M114 222 L286 222 L286 262 L114 262 Z M78 222 L114 222 L114 262 L84 262 Z M286 222 L322 222 L316 262 L286 262 Z" fill="${c.accent}"/>
    <path d="M200 84 L200 434" stroke="${c.line}" stroke-width="4" stroke-dasharray="6 5"/>
    <path d="M140 330 L176 330 M224 330 L260 330" stroke="${c.dark}" stroke-width="4"/>`,
  trousers: (c) => `<path d="M132 62 L268 62 L284 476 L214 476 L200 176 L186 476 L116 476 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M132 62 L268 62 L270 92 L130 92 Z" fill="${c.dark}"/>
    <path d="M200 92 L200 176 M150 92 Q156 130 140 150 M250 92 Q244 130 260 150" stroke="${c.line}" stroke-width="2.5" fill="none"/>
    <path d="M162 200 L152 470 M238 200 L248 470" stroke="${c.light}" stroke-width="3" opacity=".6"/>`,
  joggers: (c) => `<path d="M132 62 L268 62 L282 440 L216 440 L200 176 L184 440 L118 440 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M132 62 L268 62 L270 98 L130 98 Z" fill="${c.dark}"/>
    <path d="M118 440 L184 440 L182 472 L120 472 Z M216 440 L282 440 L280 472 L218 472 Z" fill="${c.dark}"/>
    <path d="M190 98 Q186 140 176 156 M210 98 Q214 140 224 156" stroke="${c.light}" stroke-width="3" fill="none"/>
    <path d="M128 160 L136 420 M272 160 L264 420" stroke="${c.accent}" stroke-width="7"/>`,
  shorts: (c) => `<path d="M128 150 L272 150 L292 352 L214 352 L200 252 L186 352 L108 352 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M128 150 L272 150 L274 182 L126 182 Z" fill="${c.dark}"/>
    <path d="M190 182 Q186 210 178 224 M210 182 Q214 210 222 224" stroke="${c.light}" stroke-width="3" fill="none"/>
    <path d="M112 330 L186 330 M214 330 L288 330" stroke="${c.accent}" stroke-width="6"/>`,
  skirt: (c) => `<path d="M150 120 L250 120 L312 420 Q200 446 88 420 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M150 120 L250 120 L252 150 L148 150 Z" fill="${c.dark}"/>
    <path d="M176 150 L150 424 M200 150 L200 434 M224 150 L250 424" stroke="${c.light}" stroke-width="3" opacity=".7"/>`,
  dress: (c) => `<path d="M168 62 L180 62 L186 92 M232 62 L220 62 L214 92" fill="none" stroke="${c.dark}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M160 96 Q200 120 240 96 L252 208 Q200 226 148 208 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M148 208 Q200 226 252 208 L322 466 Q200 492 78 466 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M148 208 Q200 226 252 208" stroke="${c.dark}" stroke-width="9" fill="none"/>
    <path d="M176 226 L136 470 M224 226 L264 470" stroke="${c.light}" stroke-width="3" opacity=".65"/>`,
  top: (c) => `<path d="M140 94 L174 78 Q200 112 226 78 L260 94 L300 134 L276 160 L258 146 L268 380 Q200 400 132 380 L142 146 L124 160 L100 134 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M174 78 Q200 112 226 78" fill="none" stroke="${c.dark}" stroke-width="6"/>
    <path d="M150 220 Q200 240 250 220 M146 290 Q200 310 254 290" stroke="${c.light}" stroke-width="3" fill="none" opacity=".7"/>`,
  kimono: (c) => `<path d="M118 82 L282 82 L372 170 L330 268 L290 226 L290 462 L110 462 L110 226 L70 268 L28 170 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M176 82 L200 300 L224 82" fill="none" stroke="${c.dark}" stroke-width="12"/>
    <path d="M110 300 L290 300" stroke="${c.accent}" stroke-width="14"/>
    ${[130, 190, 250].map((y) => `<path d="M60 ${y + 20} q30 -20 60 0" stroke="${c.light}" stroke-width="3" fill="none" opacity=".7"/><path d="M280 ${y + 20} q30 -20 60 0" stroke="${c.light}" stroke-width="3" fill="none" opacity=".7"/>`).join("")}`,
  swimsuit: (c) => `<path d="M166 60 L178 60 L190 120 M234 60 L222 60 L210 120" fill="none" stroke="${c.dark}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M152 118 Q200 156 248 118 L254 250 Q258 316 292 360 L238 372 Q216 384 200 404 Q184 384 162 372 L108 360 Q142 316 146 250 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M148 220 Q200 252 252 220" stroke="${c.accent}" stroke-width="10" fill="none"/>
    <path d="M162 372 Q200 350 238 372" stroke="${c.dark}" stroke-width="3" fill="none" opacity=".6"/>`,
  tie: (c) => `<path d="M182 64 L218 64 L226 98 L212 120 L240 386 L200 440 L160 386 L188 120 L174 98 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M174 98 L226 98 L212 120 L188 120 Z" fill="${c.dark}"/>
    ${[170, 220, 270, 320, 370].map((y) => `<path d="M${180 - (y - 170) / 12} ${y} L${220 + (y - 170) / 12} ${y - 28}" stroke="${c.light}" stroke-width="5" opacity=".7"/>`).join("")}`,
  belt: (c) => `<path d="M60 230 L340 230 Q356 230 356 246 L356 254 Q356 270 340 270 L60 270 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3"/>
    <rect x="230" y="214" width="56" height="72" rx="10" fill="none" stroke="${c.metal}" stroke-width="10"/>
    <path d="M258 250 L300 250" stroke="${c.metal}" stroke-width="8"/>
    ${[90, 130, 170].map((x) => `<circle cx="${x}" cy="250" r="5" fill="${c.dark}"/>`).join("")}`,
  oxford: (c) => `<path d="M60 336 Q60 270 140 258 L214 246 Q262 244 292 284 L342 296 Q366 306 360 340 L62 344 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M56 342 L364 340 L362 362 L58 364 Z" fill="${c.dark}"/>
    <path d="M168 258 Q200 300 250 268" stroke="${c.line}" stroke-width="3" fill="none"/>
    ${[0, 1, 2, 3].map((index) => `<path d="M${186 + index * 14} ${262 + index * 4} l12 10" stroke="${c.light}" stroke-width="3"/>`).join("")}
    <path d="M292 284 Q300 312 340 316" stroke="${c.light}" stroke-width="3" fill="none" opacity=".7"/>`,
  sneaker: (c) => `<path d="M58 330 Q58 262 132 252 L196 236 Q244 230 276 268 L338 288 Q366 300 362 330 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M52 330 L368 330 Q370 362 340 368 L80 368 Q50 364 52 330 Z" fill="${c.sole}" stroke="${c.line}" stroke-width="3"/>
    <path d="M110 318 Q180 270 300 300" stroke="${c.accent}" stroke-width="12" fill="none" stroke-linecap="round"/>
    ${[0, 1, 2, 3].map((index) => `<path d="M${168 + index * 16} ${248 + index * 2} l12 12" stroke="${c.light}" stroke-width="4"/>`).join("")}`,
  sandal: (c) => `<ellipse cx="200" cy="330" rx="150" ry="46" fill="${c.sole}" stroke="${c.line}" stroke-width="3"/>
    <path d="M110 320 Q150 250 196 250 Q240 250 270 320" stroke="${c.base}" stroke-width="26" fill="none" stroke-linecap="round"/>
    <path d="M220 320 Q250 276 300 300" stroke="${c.base}" stroke-width="20" fill="none" stroke-linecap="round"/>
    <circle cx="196" cy="252" r="10" fill="${c.metal}"/>`,
  hat: (c) => `<ellipse cx="200" cy="300" rx="172" ry="56" fill="${c.base}" stroke="${c.line}" stroke-width="3"/>
    <path d="M118 296 Q118 168 200 164 Q282 168 282 296 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3"/>
    <path d="M120 266 Q200 286 280 266 L282 292 Q200 312 118 292 Z" fill="${c.accent}"/>
    <path d="M80 300 Q200 330 320 300" stroke="${c.dark}" stroke-width="3" fill="none" opacity=".6"/>`,
  cap: (c) => `<path d="M100 300 Q100 168 210 164 Q306 170 310 290 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3"/>
    <path d="M290 280 Q352 282 370 312 Q330 324 286 314 Z" fill="${c.dark}" stroke="${c.line}" stroke-width="3"/>
    <path d="M205 166 L200 300 M150 180 Q140 240 150 296 M260 182 Q270 240 262 294" stroke="${c.light}" stroke-width="3" fill="none" opacity=".7"/>
    <circle cx="206" cy="166" r="9" fill="${c.dark}"/>
    <path d="M100 290 L292 290" stroke="${c.accent}" stroke-width="10"/>`,
  tote: (c) => `<path d="M150 170 Q150 92 200 92 Q250 92 250 170" stroke="${c.dark}" stroke-width="12" fill="none"/>
    <path d="M108 170 L292 170 L316 436 L84 436 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M100 260 L300 260" stroke="${c.accent}" stroke-width="16"/>
    <path d="M108 170 L292 170 L294 196 L106 196 Z" fill="${c.dark}" opacity=".5"/>`,
  duffel: (c) => `<path d="M140 210 Q140 140 200 140 Q260 140 260 210" stroke="${c.dark}" stroke-width="12" fill="none"/>
    <rect x="60" y="206" width="280" height="170" rx="70" fill="${c.base}" stroke="${c.line}" stroke-width="3"/>
    <path d="M70 250 L330 250" stroke="${c.line}" stroke-width="3" stroke-dasharray="7 6"/>
    <path d="M60 300 L340 300" stroke="${c.accent}" stroke-width="16"/>
    <circle cx="96" cy="292" r="18" fill="${c.dark}"/><circle cx="304" cy="292" r="18" fill="${c.dark}"/>`,

  // ---- tejidos
  sweater: (c) => `<path d="M118 100 L162 80 Q200 100 238 80 L282 100 L322 130 L346 352 L310 358 L288 186 L288 420 L112 420 L112 186 L90 358 L54 352 L78 130 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    ${knit(c, 130, 270, 200, 396)}
    <path d="M162 80 Q200 114 238 80" fill="none" stroke="${c.dark}" stroke-width="10"/>
    <rect x="112" y="398" width="176" height="24" fill="${c.dark}" stroke="${c.line}" stroke-width="2"/>
    <path d="M54 352 L90 358 L92 336 L58 330 Z M346 352 L310 358 L308 336 L342 330 Z" fill="${c.dark}"/>`,
  cardigan: (c) => `<path d="M118 100 L162 80 L238 80 L282 100 L322 130 L346 352 L310 358 L288 186 L288 420 L112 420 L112 186 L90 358 L54 352 L78 130 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    ${knit(c, 126, 274, 210, 396)}
    <path d="M162 80 L200 212 L238 80 Z" fill="${c.shirt}" stroke="${c.line}" stroke-width="2"/>
    <path d="M162 80 L200 212 L200 420 M238 80 L200 212" fill="none" stroke="${c.dark}" stroke-width="8"/>
    ${[246, 290, 334, 378].map((y) => `<circle cx="212" cy="${y}" r="6" fill="${c.dark}" stroke="${c.line}" stroke-width="1.5"/>`).join("")}
    <rect x="112" y="398" width="176" height="24" fill="${c.dark}"/>
    <path d="M54 352 L90 358 L92 336 L58 330 Z M346 352 L310 358 L308 336 L342 330 Z" fill="${c.dark}"/>`,
  vest: (c) => `<path d="M140 84 L172 76 L200 180 L228 76 L260 84 Q258 146 290 176 L296 424 L104 424 L110 176 Q142 146 140 84 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    ${knit(c, 124, 276, 220, 400)}
    <path d="M172 76 L200 180 L228 76" fill="none" stroke="${c.dark}" stroke-width="9"/>
    <path d="M140 84 Q142 146 110 176 M260 84 Q258 146 290 176" fill="none" stroke="${c.dark}" stroke-width="8"/>
    <path d="M200 180 L200 424" stroke="${c.dark}" stroke-width="3"/>
    ${[228, 278, 328].map((y) => `<circle cx="210" cy="${y}" r="5.5" fill="${c.dark}"/>`).join("")}
    <rect x="104" y="402" width="192" height="22" fill="${c.dark}"/>`,
  poncho: (c) => `<path d="M148 92 L252 92 L362 362 Q200 404 38 362 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <ellipse cx="200" cy="96" rx="44" ry="15" fill="${c.dark}" stroke="${c.line}" stroke-width="2"/>
    <path d="M86 262 Q200 290 314 262" stroke="${c.accent}" stroke-width="16" fill="none"/>
    <path d="M70 302 l18 -16 l18 16 l18 -16 l18 16 l18 -16 l18 16 l18 -16 l18 16 l18 -16 l18 16 l18 -16 l18 16 l18 -16 l18 16" transform="translate(0 2)" stroke="${c.dark}" stroke-width="5" fill="none" stroke-linejoin="round"/>
    <path d="M128 190 Q200 210 272 190" stroke="${c.light}" stroke-width="6" fill="none" opacity=".7"/>
    ${Array.from({ length: 27 }, (_, index) => { const x = 50 + index * 11.5; const y = 362 + 26 * Math.sin((index / 26) * Math.PI) * 0.62; return `<path d="M${x.toFixed(1)} ${y.toFixed(1)} l0 22" stroke="${c.dark}" stroke-width="3" stroke-linecap="round"/>`; }).join("")}`,

  // ---- abrigos
  parka: (c) => `<path d="M144 92 Q200 6 256 92 L250 124 Q200 92 150 124 Z" fill="${c.dark}" stroke="${c.line}" stroke-width="3"/>
    <path d="M150 92 Q200 38 250 92" fill="none" stroke="${c.light}" stroke-width="12" stroke-linecap="round" opacity=".85"/>
    <path d="M114 104 L158 86 L242 86 L286 104 L326 132 L350 376 L312 382 L292 190 L300 470 L100 470 L108 190 L88 382 L50 376 L74 132 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M200 96 L200 470" stroke="${c.line}" stroke-width="4" stroke-dasharray="6 5"/>
    <path d="M124 300 h56 v58 h-56 z M220 300 h56 v58 h-56 z" fill="${c.dark}" opacity=".55" stroke="${c.line}" stroke-width="2"/>
    <path d="M124 300 h56 v14 h-56 z M220 300 h56 v14 h-56 z" fill="${c.dark}"/>
    <path d="M108 230 Q200 246 292 230" stroke="${c.dark}" stroke-width="5" fill="none" opacity=".6"/>`,
  trench: (c) => `<path d="M112 92 L158 70 L242 70 L288 92 L328 124 L352 380 L314 386 L292 184 L308 476 L92 476 L108 184 L86 386 L48 380 L72 124 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M158 70 L130 128 L174 152 L150 176 L200 230 L250 176 L226 152 L270 128 L242 70 L200 146 Z" fill="${c.dark}" stroke="${c.line}" stroke-width="2"/>
    <path d="M200 230 L214 476" stroke="${c.line}" stroke-width="2.5"/>
    ${[250, 296].map((y) => `<circle cx="176" cy="${y}" r="6" fill="${c.line}"/><circle cx="232" cy="${y}" r="6" fill="${c.line}"/>`).join("")}
    <path d="M104 326 L296 326" stroke="${c.dark}" stroke-width="16"/>
    <rect x="186" y="314" width="30" height="24" rx="4" fill="none" stroke="${c.metal}" stroke-width="5"/>
    <path d="M150 340 Q140 380 126 404 M250 340 Q260 380 274 404" stroke="${c.dark}" stroke-width="7" stroke-linecap="round" fill="none"/>
    <path d="M110 110 L150 132 M290 110 L250 132" stroke="${c.light}" stroke-width="4" opacity=".7"/>`,
  puffer: (c) => `<path d="M160 70 L240 70 L244 104 L156 104 Z" fill="${c.dark}" stroke="${c.line}" stroke-width="3"/>
    <path d="M116 100 L158 86 L242 86 L284 100 L326 134 L350 360 Q332 372 312 366 L290 190 L292 436 L108 436 L110 190 L88 366 Q68 372 50 360 L74 134 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    ${[150, 200, 250, 300, 350, 400].map((y) => `<path d="M110 ${y} Q200 ${y + 14} 290 ${y}" stroke="${c.dark}" stroke-width="4" fill="none"/>`).join("")}
    ${[200, 260, 320].map((y) => `<path d="M70 ${y - 30} Q80 ${y - 24} 90 ${y - 30} M310 ${y - 30} Q320 ${y - 24} 330 ${y - 30}" stroke="${c.dark}" stroke-width="4" fill="none"/>`).join("")}
    <path d="M200 70 L200 436" stroke="${c.line}" stroke-width="4"/>
    <rect x="194" y="104" width="12" height="20" rx="3" fill="${c.metal}"/>`,

  // ---- pantalones
  jeans: (c) => `<path d="M132 62 L268 62 L284 476 L214 476 L200 176 L186 476 L116 476 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M132 62 L268 62 L270 90 L130 90 Z" fill="${c.dark}"/>
    <path d="M136 90 Q160 130 196 128 M264 90 Q240 130 204 128" stroke="${c.stitch}" stroke-width="2.5" fill="none" stroke-dasharray="5 4"/>
    <path d="M200 90 L200 176 M186 96 Q190 150 200 176" stroke="${c.stitch}" stroke-width="2.5" fill="none" stroke-dasharray="5 4"/>
    <path d="M124 300 L190 300 M210 300 L276 300" stroke="${c.light}" stroke-width="3" opacity=".5"/>
    <circle cx="140" cy="98" r="3.5" fill="${c.metal}"/><circle cx="260" cy="98" r="3.5" fill="${c.metal}"/><circle cx="200" cy="76" r="5" fill="${c.metal}"/>
    <path d="M118 456 L186 456 M214 456 L282 456" stroke="${c.stitch}" stroke-width="2.5" stroke-dasharray="5 4"/>`,
  cargo: (c) => `<path d="M132 62 L268 62 L286 476 L214 476 L200 176 L186 476 L114 476 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M132 62 L268 62 L270 94 L130 94 Z" fill="${c.dark}"/>
    <path d="M200 94 L200 176" stroke="${c.line}" stroke-width="2.5"/>
    <path d="M110 256 h52 v70 h-52 z M238 256 h52 v70 h-52 z" fill="${c.base}" stroke="${c.line}" stroke-width="2.5"/>
    <path d="M110 256 h52 v18 h-52 z M238 256 h52 v18 h-52 z" fill="${c.dark}"/>
    <path d="M118 446 L184 446 L184 470 L118 470 Z M216 446 L282 446 L282 470 L216 470 Z" fill="${c.dark}" opacity=".7"/>`,
  palazzo: (c) => `<path d="M142 62 L258 62 L326 476 L210 476 L200 196 L190 476 L74 476 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M142 62 L258 62 L260 98 L140 98 Z" fill="${c.dark}"/>
    <path d="M160 98 L120 470 M178 98 L160 470 M222 98 L240 470 M240 98 L280 470" stroke="${c.light}" stroke-width="3" opacity=".6"/>
    <path d="M200 98 L200 196" stroke="${c.line}" stroke-width="2.5"/>`,

  // ---- accesorios
  sunglasses: (c) => `<path d="M58 218 Q58 198 80 198 L168 198 Q186 198 184 218 L178 266 Q172 304 136 304 L104 304 Q68 304 62 268 Z" fill="${c.lens}" stroke="${c.base}" stroke-width="11" stroke-linejoin="round"/>
    <path d="M342 218 Q342 198 320 198 L232 198 Q214 198 216 218 L222 266 Q228 304 264 304 L296 304 Q332 304 338 268 Z" fill="${c.lens}" stroke="${c.base}" stroke-width="11" stroke-linejoin="round"/>
    <path d="M184 220 Q200 204 216 220" stroke="${c.base}" stroke-width="10" fill="none" stroke-linecap="round"/>
    <path d="M58 212 L22 204 M342 212 L378 204" stroke="${c.base}" stroke-width="9" stroke-linecap="round"/>
    <path d="M86 222 L120 222 M246 222 L280 222" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" opacity=".35"/>
    <ellipse cx="200" cy="356" rx="150" ry="10" fill="${c.dark}" opacity=".12"/>`,
  crossbody: (c) => `<path d="M114 236 Q200 30 286 236" stroke="${c.dark}" stroke-width="9" fill="none"/>
    <rect x="104" y="222" width="192" height="158" rx="24" fill="${c.base}" stroke="${c.line}" stroke-width="3"/>
    <path d="M104 246 Q104 222 128 222 L272 222 Q296 222 296 246 L296 304 Q200 336 104 304 Z" fill="${c.dark}" stroke="${c.line}" stroke-width="2.5"/>
    <circle cx="200" cy="314" r="11" fill="${c.metal}" stroke="${c.line}" stroke-width="2"/>
    <path d="M118 366 L282 366" stroke="${c.light}" stroke-width="2.5" stroke-dasharray="5 4" opacity=".7"/>`,
  clutch: (c) => `<rect x="64" y="196" width="272" height="156" rx="16" fill="${c.base}" stroke="${c.line}" stroke-width="3"/>
    <path d="M64 212 Q64 196 80 196 L320 196 Q336 196 336 212 L200 300 Z" fill="${c.dark}" stroke="${c.line}" stroke-width="2.5" stroke-linejoin="round"/>
    <rect x="186" y="286" width="28" height="22" rx="5" fill="${c.metal}" stroke="${c.line}" stroke-width="2"/>
    <ellipse cx="200" cy="380" rx="140" ry="9" fill="${c.dark}" opacity=".12"/>`,
  backpack: (c) => `<path d="M168 120 Q168 86 200 86 Q232 86 232 120" stroke="${c.dark}" stroke-width="12" fill="none"/>
    <rect x="114" y="116" width="172" height="324" rx="54" fill="${c.base}" stroke="${c.line}" stroke-width="3"/>
    <path d="M114 196 Q200 160 286 196" stroke="${c.dark}" stroke-width="4" fill="none"/>
    <rect x="140" y="292" width="120" height="110" rx="22" fill="${c.dark}" stroke="${c.line}" stroke-width="2.5"/>
    <path d="M152 314 L248 314" stroke="${c.metal}" stroke-width="5" stroke-linecap="round"/>
    <path d="M122 220 L110 420 M278 220 L290 420" stroke="${c.dark}" stroke-width="10" stroke-linecap="round"/>`,
  set: (c) => `<g transform="translate(92 196) scale(.54)">${SHAPES.trousers(c)}</g>
    <g transform="translate(40 -8) scale(.8)">${SHAPES.top(c)}</g>`,

  // ---- infantil
  polo: (c) => `${SHAPES.tshirt(c)}
    <path d="M165 78 L180 112 L200 94 L220 112 L235 78" fill="${c.light}" stroke="${c.line}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M200 96 L200 156" stroke="${c.dark}" stroke-width="3"/>
    <circle cx="200" cy="122" r="4" fill="${c.dark}"/><circle cx="200" cy="146" r="4" fill="${c.dark}"/>`,
  pajama: (c) => `<g transform="translate(70 -8) scale(.65)">${SHAPES.sweater(c)}${dots(c, [[150, 190], [210, 230], [250, 170], [170, 290], [240, 320], [140, 370], [200, 360]])}</g>
    <g transform="translate(102 214) scale(.52)">${SHAPES.joggers(c)}${dots(c, [[150, 120], [240, 140], [160, 260], [240, 300], [150, 380], [250, 400]])}</g>`,
  bodysuit: (c) => `<path d="M130 96 L170 80 Q200 104 230 80 L270 96 L322 152 L292 184 L268 166 L270 330 Q272 382 236 404 L222 442 L178 442 L164 404 Q128 382 130 330 L132 166 L108 184 L78 152 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M170 80 Q200 120 230 80" fill="none" stroke="${c.dark}" stroke-width="7"/>
    <path d="M178 442 L222 442 L222 428 L178 428 Z" fill="${c.dark}"/>
    ${[186, 200, 214].map((x) => `<circle cx="${x}" cy="435" r="3.5" fill="${c.light}"/>`).join("")}
    <circle cx="200" cy="250" r="30" fill="${c.light}" opacity=".75"/>
    <path d="M200 270 Q184 246 200 226 Q216 246 200 270 Z" fill="${c.accent}"/>`,
  beanie: (c) => `<circle cx="200" cy="150" r="32" fill="${c.light}" stroke="${c.line}" stroke-width="3"/>
    <path d="M112 330 Q112 176 200 172 Q288 176 288 330 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3"/>
    ${[140, 170, 200, 230, 260].map((x) => `<path d="M${x} ${x === 200 ? 178 : 196} L${x} 320" stroke="${c.light}" stroke-width="5" opacity=".5"/>`).join("")}
    <rect x="100" y="306" width="200" height="62" rx="14" fill="${c.dark}" stroke="${c.line}" stroke-width="3"/>
    ${[124, 148, 172, 196, 220, 244, 268].map((x) => `<path d="M${x} 316 L${x} 358" stroke="${c.base}" stroke-width="5" opacity=".55"/>`).join("")}`,
  socks: (c) => `<g transform="translate(-58 12)" opacity=".95">${sock({ ...c, base: c.dark, dark: c.line })}</g>
    <g transform="translate(34 -6)">${sock(c)}</g>`,
};

/** Textura de punto: columnas finas de puntadas. */
function knit(c, x0, x1, y0, y1) {
  const lines = [];
  for (let x = x0; x <= x1; x += 18) lines.push(`<path d="M${x} ${y0} L${x} ${y1}" stroke="${c.light}" stroke-width="3" stroke-dasharray="7 5" opacity=".5"/>`);
  return lines.join("");
}
function dots(c, points) {
  return points.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="${c.light}" opacity=".9"/>`).join("");
}
function sock(c) {
  return `<path d="M150 110 L214 110 L214 318 Q214 350 244 362 L300 382 Q328 394 318 426 Q308 452 276 446 L184 426 Q150 416 150 374 Z" fill="${c.base}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <rect x="146" y="104" width="72" height="34" rx="6" fill="${c.dark}"/>
    ${[160, 176, 192, 206].map((x) => `<path d="M${x} 108 L${x} 134" stroke="${c.base}" stroke-width="4" opacity=".6"/>`).join("")}
    <path d="M150 374 Q150 416 184 426 L198 398 Q172 390 170 360 Z" fill="${c.dark}" opacity=".75"/>
    <path d="M300 382 Q328 394 318 426 Q308 452 276 446 L286 412 Z" fill="${c.dark}" opacity=".75"/>
    <path d="M160 200 L204 200 M160 236 L204 236" stroke="${c.accent}" stroke-width="9"/>`;
}

/**
 * Plantilla por palabras del nombre y de la categoría (primero el nombre). null = sin plantilla:
 * se usa la tarjeta tipográfica (`cardSvg`).
 */
const ART_BY_WORD = [
  [/^(body|bodys?)\b/, "bodysuit"], [/pijama/, "pajama"], [/^gorro|beanie/, "beanie"], [/^media|calcet/, "socks"], [/^polo\b/, "polo"],
  [/^(camiseta|polera|remera)/, "tshirt"], [/^(buzo|hoodie|poler[oó]n)/, "hoodie"], [/^(jogger|buzo pantal)/, "joggers"],
  [/^(short|bermuda)/, "shorts"], [/^cortaviento/, "windbreaker"], [/^(chaqueta|campera)/, "puffer"], [/^parka/, "parka"],
  [/^(trench|gabardina)/, "trench"], [/^abrigo/, "coat"], [/^(blazer|saco)/, "blazer"], [/^(chompa|su[eé]ter|jersey)/, "sweater"],
  [/^c[aá]rdigan/, "cardigan"], [/^chaleco/, "vest"], [/^poncho/, "poncho"], [/^jean/, "jeans"], [/^cargo/, "cargo"], [/^palazzo/, "palazzo"],
  [/^(pantal[oó]n|chino)/, "trousers"], [/^falda/, "skirt"], [/^vestido/, "dress"], [/^set\b|^conjunto/, "set"],
  [/^blusa (cl[aá]sica|seda|camisera)/, "shirt"], [/^blusa/, "top"], [/^camisa/, "shirt"], [/^top\b/, "top"],
  [/^lentes|^gafas/, "sunglasses"], [/^bandolera/, "crossbody"], [/^clutch|^sobre/, "clutch"], [/^mochila/, "backpack"],
  [/^(bolso|cartera|tote)/, "tote"], [/^sandalia/, "sandal"], [/^(zapatilla|tenis)/, "sneaker"], [/^(oxford|derby|moc[aá]s[ií]n)/, "oxford"],
  [/^sombrero/, "hat"], [/^gorra/, "cap"], [/^corbata/, "tie"], [/^cintur[oó]n/, "belt"],
];
const ART_BY_CATEGORY = [
  [/pijama|body/, "pajama"], [/camiseta|polo/, "tshirt"], [/buzo|hoodie/, "hoodie"], [/jogger|pantal/, "trousers"], [/short|bermuda/, "shorts"],
  [/cortaviento|abrigo/, "coat"], [/tejido/, "sweater"], [/blusa|camisa/, "shirt"], [/vestido|fiesta/, "dress"], [/falda/, "skirt"],
  [/lente/, "sunglasses"], [/bolso|cartera/, "tote"], [/sandalia/, "sandal"], [/calzado/, "oxford"], [/conjunto/, "set"],
];
export function artFor(name, categoryName = "") {
  const n = name.toLowerCase().trim();
  const c = categoryName.toLowerCase();
  return ART_BY_WORD.find(([pattern]) => pattern.test(n))?.[1] ?? ART_BY_CATEGORY.find(([pattern]) => pattern.test(c))?.[1] ?? null;
}

/** Tarjeta tipográfica de respaldo (sin plantilla): inicial del producto sobre el color de la prenda. */
export function cardSvg(name, color, brand) {
  const initial = (name.trim()[0] ?? "·").toUpperCase().replace(/[<&>]/g, "");
  const light = luminance(color) > 0.6;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1122" height="1402" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${brand.paper}"/>
  <rect x="70" y="80" width="260" height="340" rx="18" fill="${color}"/>
  <rect x="86" y="96" width="228" height="308" rx="12" fill="none" stroke="${light ? brand.ink : brand.paper}" stroke-opacity=".35" stroke-width="2"/>
  <text x="200" y="290" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="150" fill="${light ? brand.ink : brand.paper}" fill-opacity=".85">${initial}</text>
  <rect x="170" y="330" width="60" height="4" rx="2" fill="${brand.accent}"/>
  <ellipse cx="${W / 2}" cy="450" rx="128" ry="10" fill="${brand.ink}" opacity=".08"/>
</svg>`;
}

export const GARMENT_TYPES = Object.keys(SHAPES);

/** Ilustración de una prenda: color de la prenda sobre el tono de fondo de la marca. */
export function garmentSvg(type, color, brand) {
  const draw = SHAPES[type];
  if (!draw) throw new Error(`Prenda desconocida: ${type}`);
  const light = luminance(color) > 0.78;
  const palette = {
    base: color,
    dark: shade(color, light ? 0.18 : 0.28),
    light: shade(color, light ? 0.05 : -0.35),
    line: light ? shade(color, 0.42) : shade(color, 0.45),
    shirt: brand.paper,
    accent: brand.accent,
    sole: luminance(color) > 0.5 ? brand.ink : "#F4F2EC",
    metal: "#C9A65A",
    stitch: "#D9A441",
    lens: shade(color, 0.62),
  };
  const backdrop = shade(brand.paper, 0.05);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1122" height="1402" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${brand.paper}"/>
  <circle cx="${W / 2}" cy="${H / 2 + 6}" r="176" fill="${backdrop}"/>
  <circle cx="330" cy="70" r="46" fill="${brand.accent}" opacity=".12"/>
  <rect x="40" y="420" width="56" height="8" rx="4" fill="${brand.primary}" opacity=".18"/>
  <ellipse cx="${W / 2}" cy="476" rx="128" ry="10" fill="${brand.ink}" opacity=".08"/>
  <g>${draw(palette)}</g>
</svg>`;
}

// ---------------------------------------------------------------- logos y banners

const LOGOS = {
  // Rombo con una M de trazos rectos.
  montalvo: (b) => `<rect width="256" height="256" rx="46" fill="${b.primary}"/>
    <path d="M128 30 L226 128 L128 226 L30 128 Z" fill="none" stroke="${b.paper}" stroke-width="10"/>
    <path d="M84 166 L84 96 L128 140 L172 96 L172 166" fill="none" stroke="${b.accent}" stroke-width="14" stroke-linejoin="miter" stroke-linecap="square"/>`,
  // Chevrones ascendentes dentro de un círculo.
  impetu: (b) => `<rect width="256" height="256" rx="46" fill="${b.primary}"/>
    <circle cx="128" cy="128" r="94" fill="none" stroke="${b.paper}" stroke-width="10"/>
    <path d="M78 176 L128 126 L178 176" fill="none" stroke="${b.accent}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M78 130 L128 80 L178 130" fill="none" stroke="${b.paper}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`,
  // Sol con ondas.
  solana: (b) => `<rect width="256" height="256" rx="46" fill="${b.paper}"/>
    <circle cx="128" cy="108" r="46" fill="${b.accent}"/>
    ${Array.from({ length: 10 }, (_, index) => { const angle = (Math.PI * 2 * index) / 10; return `<path d="M${128 + Math.cos(angle) * 60} ${108 + Math.sin(angle) * 60} L${128 + Math.cos(angle) * 76} ${108 + Math.sin(angle) * 76}" stroke="${b.accent}" stroke-width="9" stroke-linecap="round"/>`; }).join("")}
    <path d="M44 176 q21 -16 42 0 t42 0 t42 0 t42 0" fill="none" stroke="${b.primary}" stroke-width="10" stroke-linecap="round"/>
    <path d="M44 206 q21 -16 42 0 t42 0 t42 0 t42 0" fill="none" stroke="${b.primary}" stroke-width="10" stroke-linecap="round" opacity=".7"/>`,
  // Brote geométrico: tallo, dos hojas en arco y una semilla.
  brote: (b) => `<rect width="256" height="256" rx="46" fill="${b.primary}"/>
    <circle cx="128" cy="128" r="96" fill="none" stroke="${b.paper}" stroke-width="6" opacity=".35"/>
    <path d="M128 196 L128 118" stroke="${b.paper}" stroke-width="12" stroke-linecap="round"/>
    <path d="M128 132 Q84 132 66 84 Q114 80 128 132 Z" fill="${b.accent}"/>
    <path d="M128 118 Q166 112 188 64 Q140 64 128 118 Z" fill="${b.paper}"/>
    <ellipse cx="128" cy="204" rx="34" ry="10" fill="${b.accent}"/>`,
};

export function logoSvg(kind, brand) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 256 256">${LOGOS[kind](brand)}</svg>`;
}

/** Banner 1600×600: degradado de la paleta y motivo geométrico propio de cada marca (sin texto). */
export function bannerSvg(kind, brand) {
  const motif = {
    montalvo: Array.from({ length: 5 }, (_, index) => `<path d="M${900 + index * 140} 300 l90 -90 l90 90 l-90 90 z" fill="none" stroke="${index === 2 ? brand.accent : brand.paper}" stroke-width="4" opacity="${0.22 + index * 0.1}"/>`).join(""),
    impetu: Array.from({ length: 7 }, (_, index) => `<path d="M${960 + index * 85} 440 l70 -70 l70 70" fill="none" stroke="${index % 2 ? brand.accent : brand.paper}" stroke-width="16" stroke-linecap="round" opacity="${0.25 + index * 0.08}"/>`).join(""),
    solana: `<circle cx="1260" cy="230" r="120" fill="${brand.accent}" opacity=".85"/>`
      + Array.from({ length: 5 }, (_, index) => `<path d="M880 ${400 + index * 34} q60 -30 120 0 t120 0 t120 0 t120 0 t120 0 t120 0" fill="none" stroke="${brand.paper}" stroke-width="8" opacity="${0.5 - index * 0.07}"/>`).join(""),
    // Hojas geométricas que crecen de izquierda a derecha.
    brote: Array.from({ length: 6 }, (_, index) => {
      const x = 860 + index * 120; const y = 470 - index * 40; const s = 0.7 + index * 0.12;
      return `<g transform="translate(${x} ${y}) scale(${s.toFixed(2)})"><path d="M0 0 L0 -90" stroke="${brand.paper}" stroke-width="8" stroke-linecap="round" opacity=".7"/>
        <path d="M0 -60 Q-50 -60 -70 -114 Q-16 -118 0 -60 Z" fill="${index % 2 ? brand.paper : brand.accent}" opacity="${0.55 + index * 0.07}"/>
        <path d="M0 -84 Q44 -90 66 -146 Q12 -146 0 -84 Z" fill="${index % 2 ? brand.accent : brand.paper}" opacity="${0.5 + index * 0.07}"/></g>`;
    }).join(""),
  }[kind];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="600" viewBox="0 0 1600 600">
  <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${brand.primary}"/><stop offset="1" stop-color="${kind === "brote" ? shade(brand.primary, -0.28) : shade(brand.accent, 0.15)}"/></linearGradient></defs>
  <rect width="1600" height="600" fill="url(#g)"/>
  <rect x="0" y="0" width="1600" height="600" fill="${brand.ink}" opacity=".12"/>
  ${motif}
</svg>`;
}

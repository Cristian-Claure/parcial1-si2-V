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
};

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
  }[kind];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="600" viewBox="0 0 1600 600">
  <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${brand.primary}"/><stop offset="1" stop-color="${shade(brand.accent, 0.15)}"/></linearGradient></defs>
  <rect width="1600" height="600" fill="url(#g)"/>
  <rect x="0" y="0" width="1600" height="600" fill="${brand.ink}" opacity=".12"/>
  ${motif}
</svg>`;
}

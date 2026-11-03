#!/usr/bin/env node
/**
 * Imágenes de producto realistas (solo la prenda) con Replicate + carga al catálogo y al Probador.
 *
 *   node scripts/generate-product-images.mjs plan                      # cuenta y costo estimado (no gasta)
 *   node scripts/generate-product-images.mjs generate --pilot          # 1 imagen por tienda
 *   node scripts/generate-product-images.mjs generate --all            # todo lo pendiente
 *   node scripts/generate-product-images.mjs generate --only <tienda>/<slug>[,...] --force
 *   node scripts/generate-product-images.mjs reject <tienda>/<slug>[,...] --reason "texto"
 *   node scripts/generate-product-images.mjs regenerate                # rehace las rechazadas (máx. 2 reintentos)
 *   node scripts/generate-product-images.mjs sheet [--pilot] [--store s] [--out archivo.png]
 *   node scripts/generate-product-images.mjs upload [--store s]        # galería + Probador (API admin real)
 *   node scripts/generate-product-images.mjs verify
 *
 * Lee REPLICATE_API_TOKEN y las cuentas propietarias del .env (nunca las imprime). Las imágenes y el
 * manifest viven fuera del repo: %USERPROFILE%\Documents\imagenes-trama (o VELORA_PRODUCT_IMAGES_DIR).
 * Backend: VELORA_IMAGES_BACKEND_URL (por defecto http://127.0.0.1:18080).
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt } from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sharp = createRequire(join(ROOT, "apps/front/package.json"))("sharp");

// ---------- configuración ----------
const env = { ...loadDotEnv(join(ROOT, ".env")), ...process.env };
const BACKEND = (env.VELORA_IMAGES_BACKEND_URL || "http://127.0.0.1:18080").replace(/\/$/, "");
const OUT_DIR = env.VELORA_PRODUCT_IMAGES_DIR || join(homedir(), "Documents", "imagenes-trama");
const STORAGE_DIR = join(ROOT, "apps/back/storage/assets");
const MANIFEST = join(OUT_DIR, "manifest.json");
const MODEL = env.VELORA_IMAGES_MODEL || "black-forest-labs/flux-1.1-pro";
const PRICE_USD = Number(env.VELORA_IMAGES_PRICE_USD || 0.04); // precio publicado de flux-1.1-pro por imagen
const MAX_ATTEMPTS = Number(env.VELORA_IMAGES_MAX_ATTEMPTS || 2); // 1 intento + 1 reintento por calidad
const CONCURRENCY = 3;
const TRY_ON_PER_STORE = Number(env.VELORA_IMAGES_TRY_ON_PER_STORE || 5);
const LIGHT_COLORS = new Set(["Blanco", "Marfil", "Crema", "Champagne", "Gris perla", "Lino", "Arena"]); // fondo gris frecuente: van al final
const PRESERVE_GALLERY = new Set(["velora"]); // fotos reales: no se reemplazan

const STORE_STYLE = {
  velora: "refined contemporary womenswear, elegant minimal luxury catalog",
  "andina-moda": "contemporary Andean-inspired fashion, natural fibers, subtle artisanal details",
  "primer-paso": "affordable everyday essentials, clean simple design",
  "urbano-boutique": "modern urban boutique fashion, polished city style",
  "urbano-outlet": "casual urban fashion, practical everyday city style",
  "casa-montalvo": "classic tailored menswear, premium fabrics, sartorial quality",
  solana: "resort beachwear, light breezy summer fabrics",
  "impetu-sport": "technical athletic sportswear, performance fabrics",
};

const COLORS = {
  Arena: "sand beige", "Azul eléctrico": "electric blue", "Azul mar": "sea blue", "Azul marino": "navy blue",
  "Azul noche": "midnight blue", Blanco: "white", Café: "brown", Camel: "camel", Celeste: "light sky blue",
  Champagne: "champagne", Coral: "coral", Crema: "cream", Grafito: "graphite gray", Gris: "medium gray",
  "Gris carbón": "charcoal gray", "Gris perla": "pearl gray", Lino: "natural linen beige", Marfil: "ivory",
  Mostaza: "mustard yellow", Naranja: "orange", Negro: "black", Terracota: "terracotta", Turquesa: "turquoise",
  "Verde lima": "lime green", "Verde oliva": "olive green", "Verde salvia": "sage green", Vino: "burgundy",
};

// kind: garment (ghost mannequin) | footwear | bag | eyewear | accessory | hat ; tryOn = categoría del probador
const NOUNS = {
  Abrigo: ["coat", "garment", "OUTERWEAR"], Blazer: ["blazer", "garment", "OUTERWEAR"],
  Chaqueta: ["jacket", "garment", "OUTERWEAR"], Gabardina: ["trench coat", "garment", "OUTERWEAR"],
  Parka: ["parka", "garment", "OUTERWEAR"], Trench: ["trench coat", "garment", "OUTERWEAR"],
  Cortavientos: ["lightweight windbreaker jacket", "garment", "OUTERWEAR"],
  Saco: ["tailored suit jacket", "garment", "OUTERWEAR"], Traje: ["two-piece suit, jacket and matching trousers shown together", "garment", null],
  Blusa: ["blouse", "garment", "TOP"], Camisa: ["button-up shirt", "garment", "TOP"], Top: ["top", "garment", "TOP"],
  Camiseta: ["technical athletic t-shirt", "garment", "TOP"], Buzo: ["athletic sweatshirt", "garment", "TOP"],
  Hoodie: ["hoodie", "garment", "TOP"], Chompa: ["knit sweater", "garment", "TOP"], Suéter: ["sweater", "garment", "TOP"],
  "Cárdigan": ["cardigan", "garment", "TOP"], Chaleco: ["knit vest", "garment", "TOP"], Poncho: ["knit poncho", "garment", null],
  "Pantalón": ["trousers", "garment", "BOTTOM"], Cargo: ["cargo pants", "garment", "BOTTOM"], Chino: ["chino pants", "garment", "BOTTOM"],
  Jean: ["jeans", "garment", "BOTTOM"], Jogger: ["jogger pants", "garment", "BOTTOM"], Palazzo: ["palazzo pants", "garment", "BOTTOM"],
  Short: ["shorts", "garment", "BOTTOM"], Falda: ["skirt", "garment", "BOTTOM"],
  Vestido: ["dress", "garment", "DRESS"], Set: ["matching two-piece set, top and bottoms shown together", "garment", null],
  "Bañador": ["one-piece swimsuit", "garment", null], Kimono: ["kimono cover-up", "garment", null], Pareo: ["sarong pareo wrap", "garment", null],
  Bandolera: ["crossbody bag", "bag", null], Bolso: ["handbag", "bag", null], Clutch: ["clutch bag", "bag", null], Mochila: ["backpack", "bag", null],
  Lentes: ["pair of sunglasses", "eyewear", null], Sombrero: ["wide-brim sun hat", "hat", null], Gorra: ["baseball cap", "hat", null],
  "Cinturón": ["leather belt, neatly coiled", "accessory", null], Corbata: ["silk necktie", "accessory", null],
  Sandalia: ["pair of sandals", "footwear", null], Derby: ["pair of derby shoes", "footwear", null], Oxford: ["pair of oxford shoes", "footwear", null],
  "Mocasín": ["pair of loafers", "footwear", null], Zapatilla: ["pair of running sneakers", "footwear", null],
};
const STORE_NOUN_OVERRIDES = { "impetu-sport": { Bolso: ["sports gym duffel bag", "bag", null], "Pantalón": ["athletic track pants", "garment", "BOTTOM"], Short: ["athletic running shorts", "garment", "BOTTOM"] }, "casa-montalvo": { Camisa: ["dress shirt", "garment", "TOP"], "Pantalón": ["tailored dress trousers", "garment", "BOTTOM"] } };
const ADJECTIVES = {
  bordada: "embroidered", bordado: "embroidered", lazo: "with a tie-bow neckline", "clásica": "classic", "clásico": "classic",
  "paño": "wool-cloth", cuero: "leather", lana: "wool", lino: "linen", denim: "denim", recto: "straight-leg", recta: "straight",
  ancho: "wide-leg", plisada: "pleated", midi: "midi", maxi: "maxi", cruzado: "double-breasted", cruzada: "wrap",
  seda: "silk", acolchada: "quilted", acolchado: "quilted", "algodón": "cotton", oversize: "oversized", larga: "long",
  corta: "short", rayas: "striped", slim: "slim-fit", tejido: "knitted", tejida: "knitted", camel: "camel", satinado: "satin",
  satinada: "satin", fluida: "flowy", "fluído": "flowy", "básica": "basic", "básico": "basic", cuello: "collared",
};
const FIBERS = { lana: "wool", cachemira: "cashmere", "algodón": "cotton", lino: "linen", seda: "silk", "poliéster": "polyester", cuero: "leather", alpaca: "alpaca", viscosa: "viscose", elastano: "elastane", nylon: "nylon", "poliamida": "nylon", denim: "denim", "lycra": "lycra", gamuza: "suede" };

// FLUX no tiene prompt negativo: nombrar "maniquí", "percha" o "persona" (aunque sea con "no") los hace aparecer.
const CREDENTIALS = {
  velora: ["VELORA_SEED_OWNER_EMAIL", "VELORA_SEED_OWNER_PASSWORD"],
  "urbano-boutique": ["VELORA_DEMO_MAX_EMAIL", "VELORA_DEMO_MAX_PASSWORD"],
  "urbano-outlet": ["VELORA_DEMO_MAX_EMAIL", "VELORA_DEMO_MAX_PASSWORD"],
  "andina-moda": ["VELORA_DEMO_PLUS_EMAIL", "VELORA_DEMO_PLUS_PASSWORD"],
  "primer-paso": ["VELORA_DEMO_FREE_EMAIL", "VELORA_DEMO_FREE_PASSWORD"],
  "casa-montalvo": ["rodrigo.salvatierra@trama.seed.local", "VELORA_TRAMA_OWNER_PASSWORD"],
  "impetu-sport": ["rodrigo.salvatierra@trama.seed.local", "VELORA_TRAMA_OWNER_PASSWORD"],
  solana: ["daniela.ferrufino@trama.seed.local", "VELORA_TRAMA_OWNER_PASSWORD"],
};

// ---------- utilidades ----------
function loadDotEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}
const keyOf = (img) => img.storageKey ?? String(img.imageUrl ?? "").split("/").pop();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const list = (v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);

function readManifest() {
  if (!existsSync(MANIFEST)) return { model: MODEL, priceUsd: PRICE_USD, budgetUsd: 12, spentUsd: 0, items: {} };
  return JSON.parse(readFileSync(MANIFEST, "utf8").replace(/^\s+/, "").replace(/^[^{]*/, ""));
}
function saveManifest(m) { mkdirSync(OUT_DIR, { recursive: true }); writeFileSync(MANIFEST, JSON.stringify(m, null, 2)); }

async function http(path, init = {}, token) {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const res = await fetch(`${BACKEND}${path}`, { ...init, headers });
  const text = await res.text();
  let body; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) { const e = new Error(`${init.method || "GET"} ${path} -> ${res.status} ${typeof body === "object" ? body?.message ?? "" : ""}`); e.status = res.status; throw e; }
  return body;
}

async function companyIds() {
  const pg = createRequire(join(ROOT, "packages/database/package.json"))("pg");
  const c = new pg.Client({ host: "127.0.0.1", port: Number(env.VELORA_DB_PORT), database: env.VELORA_DB_NAME, user: env.VELORA_DB_USER, password: env.VELORA_DB_PASSWORD });
  await c.connect();
  try { return Object.fromEntries((await c.query("select slug, id from companies")).rows.map((r) => [r.slug, r.id])); } finally { await c.end(); }
}

/** Catálogo público de las tiendas del directorio. */
async function loadCatalog() {
  const dir = await http("/api/companies/directory");
  const ids = await companyIds();
  const stores = [];
  for (const s of dir) {
    const products = await http(`/api/catalog/products?companyId=${ids[s.slug]}`);
    stores.push({ slug: s.slug, name: s.name, companyId: ids[s.slug], products });
  }
  return stores;
}

function describe(store, p) {
  const words = p.name.split(/\s+/);
  const [noun, kind, tryOn] = STORE_NOUN_OVERRIDES[store]?.[words[0]] ?? NOUNS[words[0]] ?? [p.categoryName.toLowerCase(), "garment", null];
  const active = p.variants.filter((v) => v.active);
  const counts = new Map();
  for (const v of active) counts.set(v.color, (counts.get(v.color) ?? 0) + 1);
  const color = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? active[0]?.color ?? "Negro";
  const colorEn = COLORS[color] ?? color.toLowerCase();
  const v0 = active.find((v) => v.color === color) ?? active[0];
  const sku = v0 ? v0.sku.split("-").filter((part) => part !== v0.size).join("-") : p.slug;
  const adjectives = words.slice(1).map((w) => ADJECTIVES[w.toLowerCase()]).filter(Boolean);
  const fibers = [...new Set(Object.entries(FIBERS).filter(([es]) => (p.composition ?? "").toLowerCase().includes(es)).map(([, en]) => en))];
  return { noun, kind, tryOn, color, colorEn, sku, adjectives, fibers, variantIds: active.filter((v) => v.color === color).map((v) => v.id) };
}

function buildPrompt(store, info) {
  const what = [info.colorEn, ...info.adjectives, info.noun].join(" ");
  const fabric = info.fibers.length ? ` made of ${info.fibers.join(" and ")}` : "";
  const style = STORE_STYLE[store] ?? "contemporary fashion";
  const whiteNote = /white|ivory|cream|champagne|pearl/.test(info.colorEn) ? " A faint soft contact shadow separates the light-colored item from the white background." : "";
  const tail = `Isolated on a pure white #FFFFFF seamless background, bright high-key studio lighting, realistic fabric texture and stitching, plain unbranded design, high-end e-commerce catalog photography, sharp focus.${whiteNote}`;
  if (info.kind === "garment") {
    return `Invisible ghost-effect apparel product photo: a single ${what}${fabric}, ${style}, floating by itself as if worn by an invisible body, hollow empty neckline and open empty sleeves, natural 3D volume. Front view, only the garment in frame, centered, the whole garment fully visible with a generous white margin on all sides. ${tail}`;
  }
  return `Studio packshot product photo of a single ${what}${fabric}, ${style}. Front three-quarter view, one item only, resting on nothing, centered, fully visible with a generous white margin on all sides. ${tail}`;
}

/** Productos a generar: todo el catálogo listado salvo las fotos reales de VÉLORA. */
function selectItems(stores) {
  const items = [];
  for (const s of stores) {
    for (const p of s.products) {
      if (p.status !== "ACTIVE") continue;
      const gallery = (p.images ?? []).filter((i) => i.purpose === "GALLERY");
      if (PRESERVE_GALLERY.has(s.slug) && gallery.length > 0) continue;
      const info = describe(s.slug, p);
      items.push({ key: `${s.slug}/${p.slug}`, store: s.slug, companyId: s.companyId, product: p, info });
    }
  }
  return items;
}

// ---------- Replicate ----------
const MIN_INTERVAL_MS = Number(env.VELORA_IMAGES_MIN_INTERVAL_MS || 10500);
let nextSlot = 0;
async function creationSlot() { const now = Date.now(); const at = Math.max(now, nextSlot); nextSlot = at + MIN_INTERVAL_MS; if (at > now) await sleep(at - now); }
async function replicate(path, init = {}) {
  const token = env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("Falta REPLICATE_API_TOKEN en .env");
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(path.startsWith("http") ? path : `https://api.replicate.com/v1${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      let wait = 2000 * 2 ** attempt;
      try { const after = Number((await res.clone().json()).retry_after); if (after > 0) wait = Math.max(wait, after * 1000 + 500); } catch { /* sin retry_after */ }
      await sleep(wait); continue;
    }
    const text = (await res.text()).slice(0, 200);
    if (res.status === 402 || /insufficient|credit balance|billing/i.test(text)) throw Object.assign(new Error(`Replicate sin crédito (${res.status})`), { budget: true });
    throw new Error(`Replicate ${res.status}: ${text}`);
  }
}

async function generateOne(manifest, item, reason) {
  const cap = manifest.phase ? manifest.phase.startSpentUsd + manifest.phase.capUsd : manifest.budgetUsd;
  if (manifest.spentUsd + PRICE_USD > cap + 1e-9) throw Object.assign(new Error("Tope de presupuesto alcanzado"), { budget: true });
  manifest.spentUsd = +(manifest.spentUsd + PRICE_USD).toFixed(4); // se reserva antes de crear la predicción
  const seed = randomInt(1, 2 ** 31 - 1);
  const prompt = buildPrompt(item.store, item.info);
  const entry = manifest.items[item.key] ?? (manifest.items[item.key] = { attempts: [] });
  const attempt = { seed, prompt, model: MODEL, costUsd: PRICE_USD, at: new Date().toISOString(), reason: reason ?? null };
  entry.attempts.push(attempt);
  saveManifest(manifest);
  let pred;
  try {
    await creationSlot();
    pred = await replicate(`/models/${MODEL}/predictions`, { method: "POST", headers: { Prefer: "wait=60" }, body: JSON.stringify({ input: { prompt, seed, aspect_ratio: "4:5", output_format: "png", safety_tolerance: 2, prompt_upsampling: false } }) });
  } catch (error) {
    manifest.spentUsd = +(manifest.spentUsd - PRICE_USD).toFixed(4); attempt.costUsd = 0; attempt.status = "not-created";
    entry.status = entry.status ?? "failed"; saveManifest(manifest); throw error;
  }
  for (let i = 0; !["succeeded", "failed", "canceled"].includes(pred.status) && i < 90; i++) { await sleep(2000); pred = await replicate(pred.urls.get); }
  attempt.predictionId = pred.id;
  if (pred.status !== "succeeded") { attempt.status = pred.status; entry.status = "failed"; saveManifest(manifest); throw new Error(`Predicción ${pred.status}: ${pred.error ?? ""}`); }
  const { file, original, checks } = await saveOutput(item, pred);
  Object.assign(attempt, { status: "succeeded", checks });
  Object.assign(entry, {
    store: item.store, productId: item.product.id, name: item.product.name, category: item.product.categoryName,
    color: item.info.color, sku: item.info.sku, file, original, prompt, model: MODEL, seed, predictionId: pred.id, tryOnCategory: item.info.tryOn,
    status: checks.ok ? "generated" : "rejected", rejectReason: checks.ok ? null : checks.reason,
  });
  saveManifest(manifest);
  return entry;
}

/** Media por canal de las 4 esquinas (parches del 4 %). */
async function cornerStats(img) {
  const { data, info } = await img.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const patch = Math.max(8, Math.round(Math.min(width, height) * 0.04));
  const corners = [[0, 0], [width - patch, 0], [0, height - patch], [width - patch, height - patch]].map(([x0, y0]) => {
    const sum = [0, 0, 0]; let n = 0;
    for (let y = y0; y < y0 + patch; y++) for (let x = x0; x < x0 + patch; x++) { const i = (y * width + x) * channels; sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2]; n++; }
    return sum.map((s) => s / n);
  });
  const minPerChannel = [0, 1, 2].map((ch) => Math.min(...corners.map((c) => c[ch])));
  const worst = Math.min(...minPerChannel);
  const spread = Math.max(...corners.map((c) => Math.max(...c) - Math.min(...c)));
  return { width, height, minPerChannel, worst, spread };
}

/**
 * Original de Replicate -> PNG final: fondo gris muy claro llevado a blanco (punto blanco lineal medido
 * en las esquinas) y 4:5 exacto con margen blanco (flux-1.1-pro entrega ~0,82). Devuelve también el control.
 */
async function processImage(bytes) {
  let img = sharp(await sharp(bytes).flatten({ background: "#ffffff" }).png().toBuffer());
  const before = await cornerStats(img);
  let whitePoint = null;
  // Solo fondos casi blancos (ganancia <= ~10 %): con más corrección se lavan las prendas claras; esas se regeneran.
  if (before.worst >= Number(env.VELORA_IMAGES_WHITEPOINT_MIN || 232) && before.worst < 252 && before.spread <= 14) {
    whitePoint = before.minPerChannel.map((v) => +v.toFixed(1));
    img = sharp(await img.linear(whitePoint.map((v) => 255 / v), [0, 0, 0]).png().toBuffer());
  }
  const after = await cornerStats(img);
  const { width, height } = after;
  const targetH = Math.round(width / 0.8); const targetW = Math.round(height * 0.8);
  const ext = targetH >= height
    ? { top: Math.floor((targetH - height) / 2), bottom: Math.ceil((targetH - height) / 2), left: 0, right: 0 }
    : { top: 0, bottom: 0, left: Math.floor((targetW - width) / 2), right: Math.ceil((targetW - width) / 2) };
  const png = await img.extend({ ...ext, background: "#ffffff" }).png({ compressionLevel: 9 }).toBuffer();
  const meta = await sharp(png).metadata();
  const ratio = meta.width / meta.height;
  const reasons = [];
  if (after.worst < 240 || after.spread > 14) reasons.push(`fondo no blanco (min ${after.worst.toFixed(0)}, dispersión ${after.spread.toFixed(0)})`);
  if (Math.abs(ratio - 0.8) > 0.005) reasons.push(`proporción ${ratio.toFixed(3)}`);
  return { png, checks: { ok: reasons.length === 0, width: meta.width, height: meta.height, cornerMinBefore: Math.round(before.worst), cornerMinAfter: Math.round(after.worst), whitePoint, reason: reasons.join("; ") || null } };
}

/** Descarga el original de una predicción y escribe original + final. */
async function saveOutput(item, pred) {
  const url = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
  const name = `${slugify(item.info.sku)}-${slugify(item.info.color)}-front.png`;
  const file = join(OUT_DIR, item.store, name);
  const original = join(OUT_DIR, item.store, "originales", name);
  mkdirSync(dirname(original), { recursive: true });
  writeFileSync(original, await sharp(bytes).png().toBuffer());
  const { png, checks } = await processImage(bytes);
  writeFileSync(file, png);
  return { file, original, checks };
}
async function runPool(items, fn) {
  const queue = [...items]; const results = []; let stop = false;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length && !stop) {
      const item = queue.shift();
      try { results.push(await fn(item)); } catch (e) { if (e.budget) stop = true; console.log(`  ✗ ${item.key}: ${e.message}`); }
    }
  }));
  return { results, stopped: stop };
}

// ---------- hojas de contacto ----------
async function contactSheet(entries, out) {
  const cols = 4, tw = 280, th = 350, lh = 40, pad = 10;
  const rows = Math.ceil(entries.length / cols);
  const tiles = await Promise.all(entries.map(async (e, i) => {
    const thumb = await sharp(e.file).resize(tw, th, { fit: "contain", background: "#ffffff" }).extend({ top: 1, bottom: 1, left: 1, right: 1, background: "#bbbbbb" }).png().toBuffer();
    const label = `${i + 1}. ${e.store} · ${e.name}`.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const sub = `${e.color} · ${e.category}${e.tryOnCategory ? " · probador " + e.tryOnCategory : ""}`.replace(/&/g, "&amp;");
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tw + 2}" height="${lh}"><text x="4" y="16" font-family="Arial" font-size="13" fill="#111">${label.slice(0, 40)}</text><text x="4" y="33" font-family="Arial" font-size="12" fill="#555">${sub.slice(0, 44)}</text></svg>`);
    return [{ input: thumb, left: pad + (i % cols) * (tw + 2 + pad), top: pad + Math.floor(i / cols) * (th + 2 + lh + pad) }, { input: svg, left: pad + (i % cols) * (tw + 2 + pad), top: pad + Math.floor(i / cols) * (th + 2 + lh + pad) + th + 2 }];
  }));
  mkdirSync(dirname(out), { recursive: true });
  await sharp({ create: { width: pad + cols * (tw + 2 + pad), height: pad + rows * (th + 2 + lh + pad), channels: 3, background: "#e9e9e9" } }).composite(tiles.flat()).png().toFile(out);
  return out;
}

// ---------- carga ----------
function credentials(store) {
  const [emailRef, passVar] = CREDENTIALS[store];
  const email = emailRef.includes("@") ? emailRef : env[emailRef];
  let password = env[passVar];
  if (!password) {
    const docs = readFileSync(join(ROOT, "docs/FASE4B_PLATAFORMA.md"), "utf8");
    password = docs.match(new RegExp("`" + email.replace(/[.]/g, "\\.") + "`\\s*\\|\\s*`([^`]+)`"))?.[1];
  }
  if (!email || !password) throw new Error(`Sin credenciales locales para ${store}`);
  return { email, password };
}
const tokens = new Map();
async function login(store) {
  const { email, password } = credentials(store);
  if (!tokens.has(email)) tokens.set(email, (await http("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) })).accessToken);
  return tokens.get(email);
}

async function postAsset(token, productId, file, fields) {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(file)], { type: "image/png" }), "garment.png");
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) form.append(k, String(v));
  return http(`/api/catalog/manage/products/${productId}/assets`, { method: "POST", body: form }, token);
}

async function upload(manifest, stores) {
  const only = opt("store");
  for (const s of stores) {
    if (only && s.slug !== only) continue;
    const token = await login(s.slug);
    const managed = await http(`/api/catalog/manage/products?companyId=${s.companyId}`, {}, token);
    const byId = new Map(managed.map((p) => [p.id, p]));
    const entries = Object.entries(manifest.items).filter(([, e]) => e.store === s.slug && ["generated", "uploaded"].includes(e.status));
    let overwritten = 0, created = 0;
    for (const [key, e] of entries) {
      const p = byId.get(e.productId); if (!p) continue;
      const gallery = p.images.filter((i) => i.purpose === "GALLERY" && keyOf(i)).map((i) => ({ ...i, storageKey: keyOf(i) }));
      if (PRESERVE_GALLERY.has(s.slug) && gallery.length) continue;
      if (gallery.length) {
        for (const img of gallery) {
          if (!img.storageKey.endsWith(".png")) throw new Error(`${key}: clave no PNG ${img.storageKey}`);
          writeFileSync(join(STORAGE_DIR, img.storageKey), readFileSync(e.file));
        }
        e.storageKeys = gallery.map((i) => i.storageKey); e.galleryAction = "overwrite"; overwritten++;
      } else {
        const img = await postAsset(token, p.id, e.file, { purpose: "GALLERY", primary: "true", sortOrder: 0, altText: `${p.name} en ${e.color.toLowerCase()}` });
        e.storageKeys = [keyOf(img)]; e.galleryAction = "created"; created++;
      }
      e.status = "uploaded"; saveManifest(manifest);
    }
    // Probador: mismo mecanismo que VÉLORA (tryOnEnabled + tryOnCategory y TRY_ON_GARMENT por variante).
    const fresh = await http(`/api/catalog/manage/products?companyId=${s.companyId}`, {}, token);
    let ready = fresh.filter((p) => p.tryOnReady).length;
    const candidates = entries.map(([, e]) => e).filter((e) => e.tryOnCategory && e.status === "uploaded" && !fresh.find((p) => p.id === e.productId)?.tryOnReady);
    const byCat = new Map();
    for (const e of candidates.sort((a, b) => a.name.localeCompare(b.name))) { if (!byCat.has(e.tryOnCategory)) byCat.set(e.tryOnCategory, []); byCat.get(e.tryOnCategory).push(e); }
    const picks = [];
    while (ready + picks.length < TRY_ON_PER_STORE && [...byCat.values()].some((l) => l.length)) for (const l of byCat.values()) if (l.length && ready + picks.length < TRY_ON_PER_STORE) picks.push(l.shift());
    for (const e of picks) {
      const p = fresh.find((x) => x.id === e.productId);
      if (!p.tryOnEnabled || p.tryOnCategory !== e.tryOnCategory) {
        await http(`/api/catalog/manage/products/${p.id}`, { method: "PUT", body: JSON.stringify({ companyId: s.companyId, categoryId: p.categoryId, name: p.name, slug: p.slug, description: p.description, brand: p.brand, composition: p.composition, careInstructions: p.careInstructions, fitNotes: p.fitNotes, status: p.status, tryOnEnabled: true, tryOnCategory: e.tryOnCategory }) }, token);
      }
      const variants = p.variants.filter((v) => v.active && v.color === e.color);
      e.tryOnVariantIds = [];
      for (const v of variants) {
        try { await postAsset(token, p.id, e.file, { purpose: "TRY_ON_GARMENT", variantId: v.id, altText: `${p.name} (probador)` }); e.tryOnVariantIds.push(v.id); }
        catch (err) { if (err.status !== 409) throw err; e.tryOnVariantIds.push(v.id); }
      }
      saveManifest(manifest);
    }
    console.log(`${s.slug}: galería sobrescrita ${overwritten}, creada ${created}; probador +${picks.length} (ya listos ${ready})`);
  }
}

async function verify(stores) {
  let ok = true;
  for (const s of stores) {
    const products = await http(`/api/catalog/products?companyId=${s.companyId}`);
    const ready = products.filter((p) => p.tryOnReady).length;
    const noImg = products.filter((p) => !p.images.some((i) => i.purpose === "GALLERY")).length;
    let bad = 0;
    for (const p of products) {
      const img = p.images.find((i) => i.purpose === "GALLERY" && i.primary) ?? p.images.find((i) => i.purpose === "GALLERY");
      if (!img) continue;
      const res = await fetch(`${BACKEND}/api/catalog/assets/${keyOf(img)}`);
      if (res.status !== 200 || !/^image\/(png|jpeg|webp)$/.test(res.headers.get("content-type") ?? "")) bad++;
      await res.arrayBuffer();
    }
    if (ready < 5 || noImg || bad) ok = false;
    console.log(`${s.slug}: productos ${products.length}, sin imagen ${noImg}, imágenes con error ${bad}, probador ${ready}`);
  }
  return ok;
}

// ---------- main ----------
const cmd = args[0] ?? "plan";
const manifest = readManifest();
if (opt("budget")) manifest.budgetUsd = Number(opt("budget"));
const stores = await loadCatalog();
const items = selectItems(stores);

if (cmd === "plan") {
  const pending = items.filter((i) => !["generated", "uploaded"].includes(manifest.items[i.key]?.status));
  console.log(`Modelo ${MODEL} · US$ ${PRICE_USD}/imagen · imágenes totales ${items.length} · pendientes ${pending.length}`);
  console.log(`Costo estimado pendiente US$ ${(pending.length * PRICE_USD).toFixed(2)} · gastado US$ ${manifest.spentUsd.toFixed(2)} · tope US$ ${manifest.budgetUsd}`);
  for (const s of stores) console.log(`  ${s.slug}: ${items.filter((i) => i.store === s.slug).length}`);
} else if (cmd === "generate" || cmd === "regenerate") {
  let todo;
  if (cmd === "regenerate") todo = items.filter((i) => manifest.items[i.key]?.status === "rejected" && manifest.items[i.key].attempts.length < MAX_ATTEMPTS && (!opt("only") || list(opt("only")).includes(i.key)));
  else if (opt("only")) todo = items.filter((i) => list(opt("only")).includes(i.key));
  else if (flag("pilot")) todo = stores.map((s) => items.filter((i) => i.store === s.slug).sort((a, b) => (b.info.tryOn ? 1 : 0) - (a.info.tryOn ? 1 : 0))[0]).filter(Boolean);
  else todo = items.filter((i) => flag("force") || !manifest.items[i.key]?.status || manifest.items[i.key].status === "failed");
  if (opt("store")) todo = todo.filter((i) => i.store === opt("store"));
  if (!flag("force") && cmd === "generate") todo = todo.filter((i) => !["generated", "uploaded"].includes(manifest.items[i.key]?.status));
  const estimate = todo.length * PRICE_USD;
  console.log(`A generar: ${todo.length} · estimado US$ ${estimate.toFixed(2)} · gastado US$ ${manifest.spentUsd.toFixed(2)} · tope US$ ${manifest.budgetUsd}`);
  if (manifest.spentUsd + estimate > manifest.budgetUsd + 1e-9) console.log("Aviso: el estimado supera el tope; se detendrá al alcanzarlo.");
  const { results, stopped } = await runPool(todo, async (item) => {
    const prev = manifest.items[item.key];
    const e = await generateOne(manifest, item, cmd === "regenerate" ? prev?.rejectReason : undefined);
    console.log(`  ${e.status === "generated" ? "✓" : "⚠"} ${item.key} (${e.color}) seed=${e.seed}${e.rejectReason ? " · " + e.rejectReason : ""}`);
    return e;
  });
  console.log(`Listo: ${results.length} · gastado US$ ${manifest.spentUsd.toFixed(2)}${manifest.phase ? ` · gasto nuevo US$ ${(manifest.spentUsd - manifest.phase.startSpentUsd).toFixed(2)} de ${manifest.phase.capUsd}` : ""}${stopped ? " · DETENIDO (tope o crédito)" : ""}`);
  if (stopped) { manifest.stoppedAt = new Date().toISOString(); saveManifest(manifest); }
  if (flag("pilot")) console.log(await contactSheet(results, opt("out") ?? join(OUT_DIR, "piloto.png")));
} else if (cmd === "reprocess") {
  for (const item of items) {
    const e = manifest.items[item.key]; const pid = e?.predictionId ?? e?.attempts?.at(-1)?.predictionId;
    if (!pid || e.status === "uploaded" || (opt("only") && !list(opt("only")).includes(item.key))) continue;
    const pred = await replicate(`/predictions/${pid}`);
    if (pred.status !== "succeeded" || !pred.output) { console.log(`  ? ${item.key}: sin salida disponible`); continue; }
    const { file, original, checks } = await saveOutput(item, pred);
    Object.assign(e, { file, original, checks, status: e.status === "rejected" && !e.rejectReason?.startsWith("fondo") && !e.rejectReason?.startsWith("proporción") ? "rejected" : checks.ok ? "generated" : "rejected", rejectReason: checks.ok ? (e.status === "rejected" && !/^(fondo|proporción)/.test(e.rejectReason ?? "") ? e.rejectReason : null) : checks.reason });
    console.log(`  ${checks.ok ? "✓" : "⚠"} ${item.key} punto blanco=${JSON.stringify(checks.whitePoint)} esquinas ${checks.cornerMinBefore}->${checks.cornerMinAfter}`);
  }
  saveManifest(manifest);
} else if (cmd === "candidates") {
  const out = {};
  for (const s of stores) {
    const pool = items.filter((i) => i.store === s.slug && i.info.tryOn && i.info.kind === "garment");
    const byCat = new Map();
    for (const i of pool.sort((a, b) => (LIGHT_COLORS.has(a.info.color) - LIGHT_COLORS.has(b.info.color)) || a.product.name.localeCompare(b.product.name))) { if (!byCat.has(i.info.tryOn)) byCat.set(i.info.tryOn, []); byCat.get(i.info.tryOn).push(i); }
    const order = [];
    while ([...byCat.values()].some((l) => l.length)) for (const l of byCat.values()) if (l.length) order.push(l.shift());
    out[s.slug] = order.map((i) => `${i.key}|${i.info.tryOn}|${i.info.color}|${manifest.items[i.key]?.status ?? "-"}|${manifest.items[i.key]?.attempts?.length ?? 0}`);
  }
  console.log(JSON.stringify(out));
} else if (cmd === "mark-pending") {
  manifest.pending = {};
  for (const i of items) {
    const e = manifest.items[i.key];
    if (e?.status === "uploaded") continue;
    (manifest.pending[i.store] ??= []).push({ key: i.key, name: i.product.name, reason: e?.status === "rejected" ? `descartada: ${e.rejectReason}` : "sin generar (presupuesto)" });
  }
  saveManifest(manifest);
  for (const [s, l] of Object.entries(manifest.pending)) console.log(`${s}: ${l.length} pendientes`);
} else if (cmd === "reject") {
  for (const k of list(args[1])) { const e = manifest.items[k]; if (!e) { console.log(`  ? ${k}`); continue; } e.status = "rejected"; e.rejectReason = opt("reason") ?? "revisión visual"; }
  saveManifest(manifest); console.log("Marcadas como rechazadas.");
} else if (cmd === "sheet") {
  let entries = Object.values(manifest.items).filter((e) => e.file && existsSync(e.file) && ["generated", "uploaded"].includes(e.status));
  if (opt("store")) entries = entries.filter((e) => e.store === opt("store"));
  if (opt("keys")) { const ks = list(opt("keys")); entries = Object.entries(manifest.items).filter(([k]) => ks.includes(k)).map(([, e]) => e); }
  const size = 12; const base = opt("out") ?? join(OUT_DIR, "hojas", "hoja");
  for (let i = 0; i * size < entries.length; i++) console.log(await contactSheet(entries.slice(i * size, (i + 1) * size), `${base}-${String(i + 1).padStart(2, "0")}.png`));
  console.log(`(${entries.length} imágenes)`);
} else if (cmd === "upload") {
  await upload(manifest, stores);
} else if (cmd === "verify") {
  process.exitCode = (await verify(stores)) ? 0 : 1;
} else {
  console.log("Comandos: plan | generate [--pilot|--all|--only k] | regenerate | reject k --reason r | sheet | upload | verify");
}

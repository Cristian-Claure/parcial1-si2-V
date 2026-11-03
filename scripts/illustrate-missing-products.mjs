#!/usr/bin/env node
/**
 * Ilustraciones planas (SVG -> PNG 1122x1402, sharp) para los productos ACTIVOS sin imagen principal de las
 * tiendas del directorio. Reutiliza las plantillas de scripts/lib/garment-art.mjs (Fase 4B): la prenda toma el
 * color principal del producto (el de más variantes activas) y el fondo, el tono de la marca. Si no hay
 * plantilla para el nombre o la categoría, usa la tarjeta tipográfica. Se sube por el endpoint admin real como
 * GALLERY principal ("<nombre> (ilustración)") con la cuenta propietaria de cada tienda.
 *
 *   node scripts/illustrate-missing-products.mjs --dry-run [--store s]   # solo genera PNG y hojas de control
 *   node scripts/illustrate-missing-products.mjs [--store s] [--resume]  # genera y sube
 *   node scripts/illustrate-missing-products.mjs --sheet [--store s]     # hojas de 12 miniaturas
 *
 * Idempotente: un producto que ya tiene imagen GALLERY no se toca (fotos reales, imágenes de IA e
 * ilustraciones previas incluidas). El estado vive en %USERPROFILE%\Documents\imagenes-trama\manifest.json
 * (clave `illustrations`) y los PNG en ...\imagenes-trama\ilustraciones\<tienda>\ (fuera de git).
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { artFor, cardSvg, garmentSvg } from "./lib/garment-art.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sharp = createRequire(join(ROOT, "apps/front/package.json"))("sharp");
const env = { ...loadDotEnv(join(ROOT, ".env")), ...process.env };
const BACKEND = (env.VELORA_IMAGES_BACKEND_URL || "http://127.0.0.1:18080").replace(/\/$/, "");
const OUT_DIR = env.VELORA_PRODUCT_IMAGES_DIR || join(homedir(), "Documents", "imagenes-trama");
const ILLUS_DIR = join(OUT_DIR, "ilustraciones");
const MANIFEST = join(OUT_DIR, "manifest.json");
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

const CREDENTIALS = {
  velora: ["VELORA_SEED_OWNER_EMAIL", "VELORA_SEED_OWNER_PASSWORD"],
  "urbano-boutique": ["VELORA_DEMO_MAX_EMAIL", "VELORA_DEMO_MAX_PASSWORD"],
  "urbano-outlet": ["VELORA_DEMO_MAX_EMAIL", "VELORA_DEMO_MAX_PASSWORD"],
  "andina-moda": ["VELORA_DEMO_PLUS_EMAIL", "VELORA_DEMO_PLUS_PASSWORD"],
  "primer-paso": ["VELORA_DEMO_FREE_EMAIL", "VELORA_DEMO_FREE_PASSWORD"],
  "casa-montalvo": ["rodrigo.salvatierra@trama.seed.local", "VELORA_TRAMA_OWNER_PASSWORD"],
  "impetu-sport": ["rodrigo.salvatierra@trama.seed.local", "VELORA_TRAMA_OWNER_PASSWORD"],
  solana: ["daniela.ferrufino@trama.seed.local", "VELORA_TRAMA_OWNER_PASSWORD"],
  brote: ["mariana.eguez@trama.seed.local", "VELORA_TRAMA_OWNER_PASSWORD"],
};

function loadDotEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    out[line.slice(0, line.indexOf("=")).trim()] = line.slice(line.indexOf("=") + 1).trim();
  }
  return out;
}
const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function readManifest() { return existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8").replace(/^[^{]*/, "")) : { items: {} }; }
function saveManifest(m) { mkdirSync(OUT_DIR, { recursive: true }); writeFileSync(MANIFEST, JSON.stringify(m, null, 2)); }

async function http(path, init = {}, token) {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BACKEND}${path}`, { ...init, headers });
    const text = await res.text();
    if ((res.status === 429 || res.status >= 502) && attempt < 5) { await new Promise((r) => setTimeout(r, 800 * (attempt + 1))); continue; }
    let body; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) throw Object.assign(new Error(`${init.method || "GET"} ${path} -> ${res.status} ${typeof body === "object" ? body?.message ?? "" : ""}`), { status: res.status });
    return body;
  }
}
const tokens = new Map();
async function login(store) {
  const [emailRef, passVar] = CREDENTIALS[store] ?? [];
  const email = emailRef?.includes("@") ? emailRef : env[emailRef];
  const password = env[passVar];
  if (!email || !password) throw new Error(`Sin credenciales locales para ${store}`);
  if (!tokens.has(email)) tokens.set(email, (await http("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) })).accessToken);
  return tokens.get(email);
}

async function companyIds() {
  const pg = createRequire(join(ROOT, "packages/database/package.json"))("pg");
  const c = new pg.Client({ connectionString: env.DATABASE_URL });
  await c.connect();
  try { return Object.fromEntries((await c.query("select slug, id from companies")).rows.map((r) => [r.slug, r.id])); } finally { await c.end(); }
}

/** Hex por nombre de color (las variantes sembradas antes de la Fase 4B no traen colorHex). */
const COLOR_HEX = {
  Arena: "#D8C3A0", "Azul eléctrico": "#2B59C3", "Azul mar": "#2F5D8C", "Azul marino": "#23303F", "Azul noche": "#1F2A44",
  Blanco: "#F4F2EC", Café: "#5A3B28", Camel: "#B0814F", Celeste: "#A9C6E2", Champagne: "#E3D1B0", Coral: "#E8735A",
  Crema: "#EFE6D2", Grafito: "#374151", Gris: "#9CA3AF", "Gris carbón": "#3A3D42", "Gris perla": "#C9CCD1", Lino: "#E6DCC8",
  Marfil: "#F1EBDD", Mostaza: "#D19B2A", Naranja: "#EA580C", Negro: "#1C1C1E", Terracota: "#B5562F", Turquesa: "#2BA3A0",
  "Verde lima": "#84CC16", "Verde oliva": "#5B6236", "Verde salvia": "#9CAF88", Vino: "#6E2233", Azul: "#3B7DD8", Verde: "#3E9B6A",
};

/** Color principal: el de más variantes activas (desempate: el primero). */
function mainColor(product) {
  const active = product.variants.filter((v) => v.active);
  const counts = new Map();
  for (const v of active) counts.set(v.color, (counts.get(v.color) ?? 0) + 1);
  const color = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? active[0]?.color ?? "Gris";
  const variant = active.find((v) => v.color === color) ?? active[0];
  return { color, hex: /^#[0-9a-f]{6}$/i.test(variant?.colorHex ?? "") ? variant.colorHex : COLOR_HEX[color] ?? "#8A8D91", sku: variant ? variant.sku.split("-").filter((p) => p !== variant.size).join("-") : product.slug };
}

async function render(entry, brand) {
  const svg = entry.art ? garmentSvg(entry.art, entry.hex, brand) : cardSvg(entry.name, entry.hex, brand);
  const png = await sharp(Buffer.from(svg)).flatten({ background: brand.paper }).png({ compressionLevel: 9 }).toBuffer();
  mkdirSync(dirname(entry.file), { recursive: true });
  writeFileSync(entry.file, png);
  return png;
}

async function contactSheets(entries, base) {
  const cols = 4, tw = 220, th = 275, lh = 36, pad = 8, size = 12;
  const outs = [];
  for (let s = 0; s * size < entries.length; s++) {
    const part = entries.slice(s * size, (s + 1) * size);
    const comp = [];
    for (const [i, e] of part.entries()) {
      const x = pad + (i % cols) * (tw + pad), y = pad + Math.floor(i / cols) * (th + lh + pad);
      comp.push({ input: await sharp(e.file).resize(tw, th).png().toBuffer(), left: x, top: y });
      const label = `${e.store} · ${e.name}`.replace(/[<&>]/g, "").slice(0, 34);
      const sub = `${e.art ?? "tarjeta"} · ${e.color}`.replace(/[<&>]/g, "").slice(0, 34);
      comp.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="${lh}"><text x="3" y="14" font-family="Arial" font-size="12">${label}</text><text x="3" y="30" font-family="Arial" font-size="11" fill="#555">${sub}</text></svg>`), left: x, top: y + th });
    }
    const out = `${base}-${String(s + 1).padStart(2, "0")}.png`;
    await sharp({ create: { width: pad + cols * (tw + pad), height: pad + Math.ceil(part.length / cols) * (th + lh + pad), channels: 3, background: "#e4e4e4" } }).composite(comp).png().toFile(out);
    outs.push(out);
  }
  return outs;
}

// ---------- main
const manifest = readManifest();
manifest.illustrations ??= {};
const ids = await companyIds();
const directory = await http("/api/companies/directory");
const stores = directory.filter((s) => !opt("store") || s.slug === opt("store"));
const done = { generated: 0, uploaded: 0, skipped: 0 };

for (const s of stores) {
  const brand = { paper: s.palette?.paper ?? "#F7F5F0", ink: s.palette?.ink ?? "#1C1F26", primary: s.palette?.primary ?? "#23303F", accent: s.palette?.accent ?? "#8C2F39" };
  const products = await http(`/api/catalog/products?companyId=${ids[s.slug]}`);
  const missing = products.filter((p) => p.status === "ACTIVE" && !p.images.some((i) => i.purpose === "GALLERY"));
  for (const p of missing) {
    const key = `${s.slug}/${p.slug}`;
    const prev = manifest.illustrations[key];
    if (flag("resume") && prev?.status === "uploaded") { done.skipped++; continue; }
    const { color, hex, sku } = mainColor(p);
    const entry = { store: s.slug, productId: p.id, name: p.name, category: p.categoryName, art: artFor(p.name, p.categoryName), color, hex, sku,
      file: join(ILLUS_DIR, s.slug, `${slugify(sku)}-${slugify(color)}-front.png`), status: "generated", at: new Date().toISOString() };
    const png = await render(entry, brand);
    done.generated++;
    if (!flag("dry-run") && !flag("sheet")) {
      const token = await login(s.slug);
      const form = new FormData();
      form.append("file", new Blob([png], { type: "image/png" }), `${p.slug}.png`);
      for (const [k, v] of Object.entries({ purpose: "GALLERY", primary: "true", sortOrder: "0", altText: `${p.name} (ilustración)` })) form.append(k, v);
      const image = await http(`/api/catalog/manage/products/${p.id}/assets`, { method: "POST", body: form }, token);
      entry.storageKey = image.storageKey ?? String(image.imageUrl ?? "").split("/").pop();
      entry.status = "uploaded";
      done.uploaded++;
    }
    manifest.illustrations[key] = entry;
    saveManifest(manifest);
  }
  console.log(`${s.slug}: ${missing.length} sin imagen`);
}
if (flag("sheet") || flag("dry-run")) {
  const entries = Object.values(manifest.illustrations).filter((e) => (!opt("store") || e.store === opt("store")) && existsSync(e.file));
  const pick = opt("sample") ? [...new Map(entries.map((e) => [`${e.art}|${e.store}`, e])).values()] : entries;
  for (const out of await contactSheets(pick, opt("out") ?? join(ILLUS_DIR, "hoja"))) console.log(out);
}
console.log(`Generadas ${done.generated} · subidas ${done.uploaded} · ya subidas ${done.skipped}`);

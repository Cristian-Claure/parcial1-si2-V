#!/usr/bin/env node
// Generador de historial realista (Fase 3). Reemplaza a seed-historical-orders.mjs.
//
// Todo pasa por el flujo HTTP real (onboarding, catálogo, inventario, registro de clientes,
// carrito, pedido, pago, confirmación, entrega/cancelación, POS con sesión de caja y
// reposición con movimientos ENTRY). La ÚNICA escritura SQL reescribe columnas de FECHA de
// las filas que generó cada pedido (y sus sesiones, movimientos y clientes) para ubicarlas
// en su fecha objetivo; nunca montos, estados ni stock. Patrones: docs/DATOS_SINTETICOS.md.
//
// Uso:
//   node scripts/seed-realistic-history.mjs [--dry-run] [--only <tienda>] [--resume] [--fill-gaps] [--verify]
// Variables (del .env raíz o del entorno; nunca se imprimen):
//   VELORA_SEED_API_BASE (por defecto http://127.0.0.1:8080), DATABASE_URL,
//   VELORA_SEED_OWNER_EMAIL / VELORA_SEED_OWNER_PASSWORD (propietaria de VÉLORA; sin ellas se omite VÉLORA).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const pg = createRequire(join(ROOT, "packages/database/package.json"))("pg");
const sharp = createRequire(join(ROOT, "apps/front/package.json"))("sharp");

// ------------------------------------------------------------------ configuración

const SEED = 20251001;
const START = "2025-07-01";
const END = "2026-10-21";
const TZ_OFFSET_HOURS = 4; // Bolivia UTC-4 → UTC = local + 4 h
const PASSWORD = "SeedCliente2026";
const OWNER_PASSWORD = "SeedPropietario2026";
const DEMO_CARD = { cardNumber: "4242 4242 4242 4242", holderName: "Demo Seed" };
const CONCURRENCY = Number(process.env.VELORA_SEED_CONCURRENCY ?? 6);
const RESTOCK_THRESHOLD = 6;
const RESTOCK_QUANTITY = 30;

/** Inicio de esta corrida: identifica las filas creadas ahora (reposición, stock inicial) para fecharlas. */
const RUN_STARTED_AT = new Date(Date.now() - 60_000).toISOString();

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const RESUME = args.includes("--resume");
const VERIFY = args.includes("--verify");
const FILL_GAPS = args.includes("--fill-gaps");
const ONLY = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
/** Solo para pruebas: detiene la generación en ese día (por defecto, hoy). */
const UNTIL = args.includes("--until") ? args[args.indexOf("--until") + 1] : END;

function loadEnv() {
  const env = { ...process.env };
  const file = join(ROOT, ".env");
  if (existsSync(file)) for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match && env[match[1]] === undefined) env[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  return env;
}
const ENV = loadEnv();
const API = (ENV.VELORA_SEED_API_BASE ?? "http://127.0.0.1:8080").replace(/\/$/, "");

/** Parámetros por tienda (documentados en docs/DATOS_SINTETICOS.md). */
export const TENANTS = [
  {
    key: "urbano", plan: "MAX", owner: { firstName: "Lucía", lastName: "Arce", email: "lucia.arce@urbano.seed.velora.local" },
    companies: [
      { key: "urbano-boutique", name: "Urbano Boutique", slug: "urbano-boutique", tagline: "Moda urbana con carácter", city: "Santa Cruz",
        palette: { accent: "#1F3A5F", primary: "#141821", paper: "#F6F4F1", ink: "#141821" }, logo: { text: "UB", bg: "#1F3A5F", fg: "#F6F4F1" },
        stores: [["EQP", "Equipetrol"], ["CEN", "Centro"], ["BRI", "Las Brisas"], ["NOR", "Norte"]], storeWeights: [1, 0.8, 0.6, 0.5],
        products: 60, customers: 450, perDay: 6, growth: 0.05, ecommerce: 0.6, delivery: 0.55, start: START },
      { key: "urbano-outlet", name: "Urbano Outlet", slug: "urbano-outlet", tagline: "Las mejores marcas a precio outlet", city: "Santa Cruz",
        palette: { accent: "#A4452C", primary: "#1C1A17", paper: "#FBF8F3", ink: "#1C1A17" }, logo: { text: "UO", bg: "#A4452C", fg: "#FBF8F3" },
        stores: [["VEN", "Ventura"], ["P3M", "Plan 3000"]], storeWeights: [1, 0.7],
        products: 40, customers: 170, perDay: 2, growth: 0.04, ecommerce: 0.3, delivery: 0.35, start: START },
    ],
  },
  {
    key: "andina", plan: "PLUS", owner: { firstName: "Mateo", lastName: "Quispe", email: "mateo.quispe@andina.seed.velora.local" },
    companies: [
      { key: "andina-moda", name: "Andina Moda", slug: "andina-moda", tagline: "Tejidos y diseño de altura", city: "La Paz",
        palette: { accent: "#7A2E2A", primary: "#2A1714", paper: "#FAF5EE", ink: "#2A1714" }, logo: { text: "AM", bg: "#7A2E2A", fg: "#FAF5EE" },
        stores: [["SOP", "Sopocachi"], ["CAL", "Calacoto"], ["ALT", "El Alto"]], storeWeights: [1, 0.85, 0.6],
        products: 50, customers: 230, perDay: 3, growth: 0.045, ecommerce: 0.5, delivery: 0.45, start: START },
    ],
  },
  {
    key: "primer-paso", plan: "FREE", owner: { firstName: "Valeria", lastName: "Rojas", email: "valeria.rojas@primerpaso.seed.velora.local" },
    companies: [
      { key: "primer-paso", name: "Primer Paso", slug: "primer-paso", tagline: null, city: "Cochabamba",
        palette: { accent: "#2F6B4F" }, logo: { text: "PP", bg: "#2F6B4F", fg: "#FFFFFF" },
        stores: [["CBB", "Cochabamba Centro"]], storeWeights: [1],
        products: 18, customers: 150, perDay: 3, growth: 0.04, ecommerce: 0.4, delivery: 0.3, start: "2026-09-11" },
    ],
  },
  // Fase 4B · tiendas de la plataforma Trama creadas por scripts/seed-new-stores.mjs: solo historial de 90 días.
  {
    key: "trama-rodrigo", group: "trama", existing: true, ownerEmail: "rodrigo.salvatierra@trama.seed.local", passwordEnv: "VELORA_TRAMA_OWNER_PASSWORD", rewriteInitialStock: true,
    companies: [
      { key: "casa-montalvo", slug: "casa-montalvo", city: "La Paz", customers: 90, perDay: 4.2, growth: 0.03, ecommerce: 0.5, delivery: 0.45, start: "2026-07-23" },
      { key: "impetu-sport", slug: "impetu-sport", city: "La Paz", customers: 85, perDay: 4.6, growth: 0.035, ecommerce: 0.55, delivery: 0.5, start: "2026-07-23" },
    ],
  },
  {
    key: "trama-daniela", group: "trama", existing: true, ownerEmail: "daniela.ferrufino@trama.seed.local", passwordEnv: "VELORA_TRAMA_OWNER_PASSWORD", rewriteInitialStock: true,
    companies: [
      { key: "solana", slug: "solana", city: "Santa Cruz", customers: 90, perDay: 4.4, growth: 0.04, ecommerce: 0.6, delivery: 0.5, start: "2026-07-23" },
    ],
  },
  {
    key: "velora", existing: true,
    companies: [
      { key: "velora", companyId: "10000000-0000-0000-0000-000000000001", customers: 180, perDay: 2.2, growth: 0.03, ecommerce: 0.45, delivery: 0.5, start: START },
    ],
  },
];

/** Categorías extra (las base de moda vienen del onboarding) con rango de precios y estacionalidad. */
const CATEGORY_CATALOG = [
  { name: "Vestidos", slug: "vestidos", price: [220, 480], names: ["Vestido Aurora", "Vestido Lino", "Vestido Brisa", "Vestido Coral", "Vestido Siena", "Vestido Marea"] },
  { name: "Blusas", slug: "blusas", price: [120, 250], names: ["Blusa Seda", "Blusa Lazo", "Blusa Clásica", "Blusa Bordada", "Blusa Satinada"] },
  { name: "Pantalones", slug: "pantalones", price: [180, 350], names: ["Pantalón Sastre", "Jean Recto", "Palazzo", "Cargo Urbano", "Chino Slim"] },
  { name: "Abrigos", slug: "abrigos", price: [380, 850], names: ["Abrigo Paño", "Trench Clásico", "Parka Andes", "Blazer Lana", "Chaqueta Acolchada"] },
  { name: "Tejidos", slug: "tejidos", price: [160, 380], names: ["Chompa Alpaca", "Cárdigan Trenzado", "Poncho Altiplano", "Suéter Cuello Alto", "Chaleco Tejido"] },
  { name: "Sandalias", slug: "sandalias", price: [150, 320], names: ["Sandalia Tiras", "Sandalia Plataforma", "Sandalia Cuero", "Sandalia Trenza"] },
  { name: "Lentes", slug: "lentes", price: [90, 260], names: ["Lentes Aviador", "Lentes Cat Eye", "Lentes Redondos", "Lentes Oversize"] },
  { name: "Bolsos", slug: "bolsos", price: [180, 520], names: ["Bolso Tote", "Bandolera Cuero", "Clutch Noche", "Mochila Urbana"] },
];
const SIZES = ["S", "M", "L", "XL"];
const COLORS = ["Negro", "Crema", "Azul noche", "Terracota", "Verde oliva", "Blanco", "Camel"];

// ------------------------------------------------------------------ PRNG con semilla

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashSeed = (...parts) => createHash("sha256").update(parts.join("|")).digest().readUInt32BE(0);
const rngFor = (...parts) => mulberry32(hashSeed(SEED, ...parts));
function normal(rng) { let u = 0; while (u === 0) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); }
function poisson(rng, lambda) { if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal(rng))); const l = Math.exp(-lambda); let k = 0; let p = 1; do { k += 1; p *= rng(); } while (p > l); return k - 1; }
function pickWeighted(rng, items, weight) { const total = items.reduce((sum, item) => sum + weight(item), 0); let r = rng() * total; for (const item of items) { r -= weight(item); if (r <= 0) return item; } return items[items.length - 1]; }
const between = (rng, [min, max]) => Math.round(min + rng() * (max - min));
/** UUID v4 determinista (para Idempotency-Key y clientOperationId reanudables). */
function stableUuid(...parts) {
  const hex = createHash("sha256").update(parts.join("|")).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// ------------------------------------------------------------------ patrones de demanda

const WEEKDAY = [1.2, 0.8, 0.85, 0.9, 1.0, 1.25, 1.45]; // domingo..sábado (vie-dom altos)
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function specialFactor(day) {
  const [, month, date] = day.split("-").map(Number);
  const md = `${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
  if (md === "03-19") return 1.6;                                 // Día del Padre
  if (["03-16", "03-17", "03-18"].includes(md)) return 1.25;
  if (md === "05-27") return 1.8;                                 // Día de la Madre
  if (["05-24", "05-25", "05-26"].includes(md)) return 1.3;
  if (day === "2025-11-28") return 2.5;                           // Black Friday
  if (day === "2025-11-29" || day === "2025-11-30") return 1.4;
  if (md === "12-24") return 1.8;                                 // Navidad
  if (month === 12 && date >= 15 && date <= 23) return 1.5;
  if (md === "12-25") return 0.5;
  return 1;
}

export function paydayFactor(day) {
  const date = Number(day.slice(8, 10));
  const last = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).getUTCDate();
  if (date >= 14 && date <= 16) return 1.15;       // quincena
  if (date >= last - 1 || date === 1) return 1.2;  // fin e inicio de mes
  return 1;
}

/** Pedidos esperados por día: tendencia mensual compuesta × semana × quincena × fechas especiales × ruido. */
export function expectedOrders(company, day, rng) {
  if (day < company.start) return 0;
  const months = daysBetween(company.start, day) / 30.44;
  const trend = company.perDay * (1 + company.growth) ** months;
  const weekday = WEEKDAY[new Date(`${day}T12:00:00Z`).getUTCDay()];
  const noise = Math.exp(0.15 * normal(rng) - 0.011);
  return trend * weekday * paydayFactor(day) * specialFactor(day) * noise;
}

/** Estacionalidad por categoría (hemisferio sur): abrigos/tejidos jun-ago; vestidos/sandalias/lentes nov-feb. */
export function seasonFactor(categoryName, day) {
  const month = Number(day.slice(5, 7)); const name = categoryName.toLowerCase();
  const winter = month >= 6 && month <= 8; const summer = month >= 11 || month <= 2;
  if (/abrigo|tejido|chompa|chaqueta|parka/.test(name)) return winter ? 2.6 : 0.6;
  if (/vestido|sandalia|lente/.test(name)) return summer ? 2.2 : winter ? 0.5 : 1;
  return 1;
}

/** Hora local (Bolivia) con picos 12-14 y 19-22 en ecommerce y 10-20 en POS. */
export function localHour(rng, channel) {
  if (channel === "POS") return Math.min(20, 10 + Math.floor(rng() * 10.5 + (rng() < 0.35 ? 2 * rng() : 0)));
  const r = rng();
  if (r < 0.38) return 12 + Math.floor(rng() * 3);
  if (r < 0.78) return 19 + Math.floor(rng() * 4);
  return 8 + Math.floor(rng() * 16) % 16;
}

const SEGMENTS = [
  { key: "LOYAL_HIGH", share: 0.12, weight: 7, itemsBoost: 1, pricePreference: 0.75 },
  { key: "OCCASIONAL", share: 0.4, weight: 1.6, itemsBoost: 0, pricePreference: 0.45 },
  { key: "ONE_TIME", share: 0.33, weight: 2.2, itemsBoost: 0, pricePreference: 0.4 },
  { key: "CHURN_RISK", share: 0.15, weight: 3.5, itemsBoost: 0, pricePreference: 0.5 },
];

// ------------------------------------------------------------------ progreso reanudable

const PROGRESS_DIR = join(ROOT, "scripts", ".seed-progress");
const PROGRESS_FILE = join(PROGRESS_DIR, `seed-${SEED}-${ONLY ?? "all"}.json`);
function loadProgress() { return RESUME && existsSync(PROGRESS_FILE) ? JSON.parse(readFileSync(PROGRESS_FILE, "utf8")) : { tenants: {}, lastDay: null }; }
function saveProgress(progress) { mkdirSync(PROGRESS_DIR, { recursive: true }); writeFileSync(PROGRESS_FILE, JSON.stringify(progress)); }

// ------------------------------------------------------------------ HTTP

const tokens = new Map(); // email → { token, password }
async function http(method, path, { token, body, form, headers = {} } = {}, attempt = 0) {
  let response;
  try {
    response = await fetch(`${API}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers }, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch (error) {
    if (attempt < 5) { await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1))); return http(method, path, { token, body, form, headers }, attempt + 1); }
    throw error;
  }
  const text = await response.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if ((response.status === 429 || response.status >= 502) && attempt < 5) { await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1))); return http(method, path, { token, body, form, headers }, attempt + 1); }
  return { status: response.status, data };
}
async function must(method, path, options = {}, ok = (status) => status < 300) {
  const result = await http(method, path, options);
  if (!ok(result.status)) throw new Error(`${method} ${path} → ${result.status} ${typeof result.data === "string" ? result.data.slice(0, 200) : JSON.stringify(result.data).slice(0, 300)}`);
  return result.data;
}
async function login(email, password = tokens.get(email)?.password) {
  const cached = tokens.get(email);
  if (cached?.token) return cached.token;
  const data = await must("POST", "/api/auth/login", { body: { email, password } });
  tokens.set(email, { token: data.accessToken, password });
  return data.accessToken;
}
/** Llamada autenticada que renueva el token si expiró. */
async function as(email, method, path, options = {}, ok) {
  const password = tokens.get(email)?.password;
  const result = await http(method, path, { ...options, token: await login(email, password) });
  if (result.status === 401 && password) { tokens.set(email, { password }); return as(email, method, path, options, ok); }
  if (!(ok ?? ((status) => status < 300))(result.status)) throw new Error(`${method} ${path} → ${result.status} ${JSON.stringify(result.data).slice(0, 300)}`);
  return result.data;
}

async function pool(items, size, worker) {
  let index = 0; const errors = [];
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (index < items.length) { const item = items[index++]; try { await worker(item); } catch (error) { errors.push(error); } }
  }));
  return errors;
}

// ------------------------------------------------------------------ logos (SVG → PNG con sharp)

async function logoPng({ text, bg, fg }, width = 256, height = 256) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" rx="${Math.round(width * 0.18)}" fill="${bg}"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${Math.round(height * 0.42)}" font-weight="700" fill="${fg}" letter-spacing="4">${text}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
async function bannerPng({ bg, fg }, title) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="560"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#111111"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="120" y="320" font-family="Georgia, serif" font-size="96" fill="${fg}" opacity="0.92">${title}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
async function uploadImage(email, path, buffer, name) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "image/png" }), name);
  return as(email, "POST", path, { form });
}

// ------------------------------------------------------------------ preparación de tiendas

async function setupNewTenant(tenant, state) {
  const email = tenant.owner.email;
  tokens.set(email, { password: OWNER_PASSWORD });
  for (const [index, company] of tenant.companies.entries()) {
    state.companies[company.key] ??= {};
    const saved = state.companies[company.key];
    if (!saved.companyId) {
      if (index === 0) {
        const existing = await http("POST", "/api/auth/login", { body: { email, password: OWNER_PASSWORD } });
        if (existing.status === 200) {
          tokens.set(email, { token: existing.data.accessToken, password: OWNER_PASSWORD });
          const mine = await as(email, "GET", "/api/admin/companies");
          saved.companyId = mine.find((item) => item.slug === company.slug)?.id;
        } else {
          const result = await must("POST", "/api/onboarding/store", { body: {
            owner: { ...tenant.owner, password: OWNER_PASSWORD }, planCode: tenant.plan,
            company: { name: company.name, slug: company.slug, tagline: company.tagline, accentColor: company.palette.accent, storeName: company.stores[0][1], city: company.city },
          } });
          tokens.set(email, { token: result.auth.accessToken, password: OWNER_PASSWORD });
          saved.companyId = result.company.id;
          if (tenant.plan !== "FREE") await as(email, "POST", "/api/admin/plan/change", { body: { planCode: tenant.plan, card: DEMO_CARD } });
        }
      } else {
        const mine = await as(email, "GET", "/api/admin/companies");
        saved.companyId = mine.find((item) => item.slug === company.slug)?.id
          ?? (await as(email, "POST", "/api/admin/companies", { body: { name: company.name, slug: company.slug, tagline: company.tagline, accentColor: company.palette.accent, storeName: company.stores[0][1], city: company.city } })).id;
      }
    }
    const companyId = saved.companyId;
    if (!saved.branded) {
      const allowed = (await as(email, "GET", `/api/admin/companies/${companyId}/branding`)).allowed;
      await as(email, "PATCH", `/api/admin/companies/${companyId}/branding`, { body: {
        displayName: company.name,
        palette: allowed.includes("fullPalette") ? company.palette : { accent: company.palette.accent },
        ...(allowed.includes("tagline") && company.tagline ? { tagline: company.tagline } : {}),
        ...(allowed.includes("contact") ? { contact: { phone: "+591 7" + String(hashSeed(company.key)).slice(0, 7), email: `hola@${company.slug}.bo`, address: `${company.city}, Bolivia`, socials: { instagram: `@${company.slug.replace(/-/g, "")}` } } } : {}),
      } });
      await uploadImage(email, `/api/admin/companies/${companyId}/branding/logo`, await logoPng(company.logo), "logo.png");
      if (allowed.includes("banner")) await uploadImage(email, `/api/admin/companies/${companyId}/branding/banner`, await bannerPng(company.logo, company.name), "banner.png");
      saved.branded = true;
    }
    // Sucursales (la principal la creó el aprovisionamiento) y su punto de venta.
    let stores = await as(email, "GET", `/api/admin/stores?companyId=${companyId}`);
    for (const [code, name] of company.stores.slice(1)) {
      if (!stores.some((store) => store.name === name)) await as(email, "POST", "/api/admin/stores", { body: { companyId, code, name } });
    }
    stores = await as(email, "GET", `/api/admin/stores?companyId=${companyId}`);
    const warehouses = await as(email, "GET", "/api/inventory/warehouses");
    const points = await as(email, "GET", `/api/admin/points-of-sale?companyId=${companyId}`);
    saved.stores = [];
    for (const [index, [code, name]] of company.stores.entries()) {
      const store = stores.find((candidate) => candidate.name === name);
      const warehouse = warehouses.find((candidate) => candidate.storeId === store.id && candidate.defaultWarehouse) ?? warehouses.find((candidate) => candidate.storeId === store.id);
      const point = points.find((candidate) => candidate.storeId === store.id)
        ?? await as(email, "POST", "/api/admin/points-of-sale", { body: { storeId: store.id, warehouseId: warehouse.id, code: `CAJA-${code}`, name: `Caja ${name}` } });
      saved.stores.push({ storeId: store.id, warehouseId: warehouse.id, pointId: point.id, name, weight: company.storeWeights[index] });
    }
    // Categorías extra y productos con variantes.
    if (!saved.productsReady) {
      const existingCategories = await as(email, "GET", `/api/catalog/manage/categories?companyId=${companyId}`);
      const categories = [];
      for (const category of CATEGORY_CATALOG) {
        const found = existingCategories.find((candidate) => candidate.slug === category.slug)
          ?? await as(email, "POST", "/api/catalog/manage/categories", { body: { companyId, name: category.name, slug: category.slug } });
        categories.push({ ...category, id: found.id });
      }
      const existingProducts = await as(email, "GET", `/api/catalog/manage/products?companyId=${companyId}`);
      const rng = rngFor("products", company.key);
      const prefix = company.key.split("-").map((part) => part[0]).join("").toUpperCase();
      for (let index = 0; index < company.products; index += 1) {
        const category = categories[index % categories.length];
        const name = `${category.names[Math.floor(index / categories.length) % category.names.length]}${index >= categories.length * category.names.length ? " II" : ""} ${String(index + 1).padStart(2, "0")}`;
        const slug = `${category.slug}-${index + 1}`;
        if (existingProducts.some((product) => product.slug === slug)) continue;
        const product = await as(email, "POST", "/api/catalog/manage/products", { body: { companyId, categoryId: category.id, name, slug, description: `${name} de ${company.name}.`, brand: company.name, status: "ACTIVE" } });
        const price = between(rng, category.price);
        const colors = [COLORS[Math.floor(rng() * COLORS.length)]];
        if (rng() < 0.5) colors.push(COLORS[(COLORS.indexOf(colors[0]) + 2) % COLORS.length]);
        const sizes = /lente|bolso/.test(category.slug) ? ["Única"] : SIZES.slice(rng() < 0.5 ? 0 : 1, 3 + Math.floor(rng() * 2));
        for (const color of colors) for (const size of sizes) {
          await as(email, "POST", `/api/catalog/manage/products/${product.id}/variants`, { body: { sku: `${prefix}-${String(index + 1).padStart(3, "0")}-${size}-${color.slice(0, 3)}`.toUpperCase().replace(/[^A-Z0-9-]/g, ""), size, color, price } });
        }
      }
      saved.productsReady = true;
    }
    await loadCatalog(email, saved, companyId, company);
    if (!saved.stocked) {
      for (const store of saved.stores) {
        await pool(saved.variants, 4, async (variant) => {
          await as(email, "POST", "/api/inventory/movements", { body: { warehouseId: store.warehouseId, variantId: variant.id, movementType: "ENTRY", quantity: 25, reason: "Stock inicial", referenceType: "INITIAL_STOCK" } });
        });
      }
      saved.stocked = true;
    }
  }
  return email;
}

/** Tiendas que ya existen (VÉLORA y, desde la Fase 4B, las de Trama): solo se preparan sucursales, cajas y catálogo. */
async function setupVelora(tenant, state) {
  const email = tenant.ownerEmail ?? ENV.VELORA_SEED_OWNER_EMAIL; const password = tenant.passwordEnv ? ENV[tenant.passwordEnv] : ENV.VELORA_SEED_OWNER_PASSWORD;
  if (!email || !password) { console.log(`  · ${tenant.key} omitida: faltan sus credenciales en el .env local.`); return null; }
  tokens.set(email, { password });
  for (const company of tenant.companies) await setupExistingCompany(email, company, state);
  return email;
}

async function setupExistingCompany(email, company, state) {
  state.companies[company.key] ??= {};
  const saved = state.companies[company.key];
  const companyId = company.companyId ?? (await as(email, "GET", "/api/admin/companies")).find((candidate) => candidate.slug === company.slug)?.id;
  if (!companyId) throw new Error(`No existe la tienda ${company.slug}: ejecuta antes scripts/seed-new-stores.mjs.`);
  saved.companyId = companyId;
  const stores = await as(email, "GET", `/api/admin/stores?companyId=${companyId}`);
  const warehouses = await as(email, "GET", "/api/inventory/warehouses");
  const points = await as(email, "GET", `/api/admin/points-of-sale?companyId=${companyId}`);
  saved.stores = stores.filter((store) => store.active).map((store, index) => {
    const warehouse = warehouses.find((candidate) => candidate.storeId === store.id && candidate.defaultWarehouse) ?? warehouses.find((candidate) => candidate.storeId === store.id);
    const point = points.find((candidate) => candidate.storeId === store.id && candidate.active !== false);
    return { storeId: store.id, warehouseId: warehouse?.id, pointId: point?.id ?? null, name: store.name, weight: index === 0 ? 1 : 0.7 };
  }).filter((store) => store.warehouseId);
  for (const store of saved.stores.filter((candidate) => !candidate.pointId)) {
    store.pointId = (await as(email, "POST", "/api/admin/points-of-sale", { body: { storeId: store.storeId, warehouseId: store.warehouseId, code: `CAJA-${store.storeId.slice(0, 4).toUpperCase()}`, name: `Caja ${store.name}` } })).id;
  }
  await loadCatalog(email, saved, companyId, company);
}

async function loadCatalog(email, saved, companyId, company) {
  const products = (await as(email, "GET", `/api/catalog/manage/products?companyId=${companyId}`)).filter((product) => product.status === "ACTIVE");
  const categories = await as(email, "GET", `/api/catalog/manage/categories?companyId=${companyId}`);
  const rng = rngFor("pareto", company.key);
  const order = products.map((product) => ({ product, r: rng() })).sort((a, b) => a.r - b.r).map((entry) => entry.product);
  saved.variants = [];
  order.forEach((product, rank) => {
    const category = categories.find((candidate) => candidate.id === product.categoryId)?.name ?? product.categoryName ?? "";
    for (const variant of product.variants.filter((candidate) => candidate.active !== false)) {
      saved.variants.push({ id: variant.id, productId: product.id, price: Number(variant.price), category: `${category} ${product.name}`, paretoWeight: 1 / (rank + 1) ** 1.15 / product.variants.length });
    }
  });
}

// ------------------------------------------------------------------ clientes

async function setupCustomers(company, saved) {
  saved.customers ??= [];
  const rng = rngFor("customers", company.key);
  const span = Math.max(1, daysBetween(company.start, END));
  for (let index = saved.customers.length; index < company.customers; index += 1) {
    const segment = pickWeighted(rng, SEGMENTS, (candidate) => candidate.share).key;
    // Llegada con más clientes nuevos hacia el final (crecimiento).
    const joinOffset = Math.floor(span * Math.sqrt(rng()) * 0.97);
    const joinDay = addDays(company.start, Math.min(span - 1, joinOffset));
    const churnDay = segment === "CHURN_RISK" ? addDays(joinDay, Math.floor((daysBetween(joinDay, END)) * (0.35 + rng() * 0.3))) : null;
    const first = ["Ana", "Lucía", "Camila", "Valentina", "Sofía", "Daniela", "Mariana", "Gabriela", "Paola", "Andrea", "Carla", "Fernanda", "Diego", "Luis", "Jorge", "Rodrigo", "Marco", "Pablo"][Math.floor(rng() * 18)];
    const last = ["Gutiérrez", "Mamani", "Flores", "Vargas", "Rojas", "Choque", "Quispe", "Fernández", "Suárez", "Justiniano", "Paz", "Medina", "Salvatierra", "Cuéllar"][Math.floor(rng() * 14)];
    const email = `${company.key}.cliente${String(index + 1).padStart(4, "0")}@clientes.seed.velora.local`;
    saved.customers.push({ email, firstName: first, lastName: last, segment, joinDay, churnDay, id: null, addressId: null, orders: 0 });
  }
  // En --resume los clientes ya registrados solo necesitan su contraseña para renovar sesión.
  for (const customer of saved.customers.filter((candidate) => candidate.id)) if (!tokens.has(customer.email)) tokens.set(customer.email, { password: PASSWORD });
  await pool(saved.customers.filter((customer) => !customer.id), 4, async (customer) => {
    tokens.set(customer.email, { password: PASSWORD });
    const result = await http("POST", "/api/auth/register", { body: { firstName: customer.firstName, lastName: customer.lastName, email: customer.email, password: PASSWORD } });
    if (result.status === 200) { customer.id = result.data.user.id; tokens.set(customer.email, { token: result.data.accessToken, password: PASSWORD }); return; }
    const logged = await must("POST", "/api/auth/login", { body: { email: customer.email, password: PASSWORD } });
    customer.id = logged.user.id; tokens.set(customer.email, { token: logged.accessToken, password: PASSWORD });
  });
}

// ------------------------------------------------------------------ planificación de un día

function planDay(company, saved, day, forcedCount = null) {
  const rng = rngFor(forcedCount === null ? "day" : "gap", company.key, day);
  const count = forcedCount ?? poisson(rng, expectedOrders(company, day, rng));
  const recentCutoff = addDays(END, -2);
  const eligible = saved.customers.filter((customer) => customer.joinDay <= day && (!customer.churnDay || day < customer.churnDay) && !(customer.segment === "ONE_TIME" && customer.orders > 0));
  const usedToday = new Set();
  const orders = [];
  for (let index = 0; index < count; index += 1) {
    const channel = rng() < company.ecommerce ? "ECOMMERCE" : "POS";
    const store = pickWeighted(rng, saved.stores, (candidate) => candidate.weight);
    let customer = null;
    if (channel === "ECOMMERCE" || rng() < 0.45) {
      const pool = eligible.filter((candidate) => !usedToday.has(candidate.email));
      if (pool.length) customer = pickWeighted(rng, pool, (candidate) => SEGMENTS.find((segment) => segment.key === candidate.segment).weight * (candidate.joinDay === day ? 4 : 1));
    }
    if (channel === "ECOMMERCE" && !customer) continue;
    if (customer) { usedToday.add(customer.email); customer.orders += 1; }
    const segment = SEGMENTS.find((candidate) => candidate.key === customer?.segment) ?? SEGMENTS[1];
    const lines = Math.min(4, 1 + (rng() < 0.32 ? 1 : 0) + (rng() < 0.1 ? 1 : 0) + (segment.itemsBoost && rng() < 0.5 ? 1 : 0));
    const items = new Map();
    for (let line = 0; line < lines; line += 1) {
      const variant = pickWeighted(rng, saved.variants, (candidate) => candidate.paretoWeight * seasonFactor(candidate.category, day) * (candidate.price > 300 ? 0.6 + segment.pricePreference : 1.4 - segment.pricePreference));
      items.set(variant.id, (items.get(variant.id) ?? 0) + (rng() < 0.12 ? 2 : 1));
    }
    const hour = localHour(rng, channel); const minute = Math.floor(rng() * 60);
    const createdAt = new Date(Date.parse(`${day}T00:00:00Z`) + ((hour + TZ_OFFSET_HOURS) * 60 + minute) * 60_000);
    const ticket = [...items].reduce((sum, [variantId, quantity]) => sum + saved.variants.find((variant) => variant.id === variantId).price * quantity, 0);
    const fulfillment = channel === "POS" ? "IN_STORE" : rng() < company.delivery ? "DELIVERY" : "PICKUP";
    const method = channel === "POS" ? pickWeighted(rng, [["CASH", 0.58], ["QR", 0.27], ["CARD", 0.15]], (entry) => entry[1])[0]
      : fulfillment === "DELIVERY" ? pickWeighted(rng, [["COD", 0.45], ["QR", 0.35], ["CARD", 0.2]], (entry) => entry[1])[0]
        : pickWeighted(rng, [["CASH", 0.4], ["QR", 0.4], ["CARD", 0.2]], (entry) => entry[1])[0];
    const cancelProbability = channel === "POS" ? 0 : 0.04 + (fulfillment === "DELIVERY" ? 0.06 : 0) + (ticket > 600 ? 0.05 : 0) + (method === "COD" ? 0.05 : method === "QR" ? 0.015 : 0);
    const recent = day >= recentCutoff;
    const outcome = rng() < cancelProbability ? "CANCELLED" : recent && channel === "ECOMMERCE" && rng() < 0.55 ? "PENDING" : "FULFILLED";
    orders.push({
      key: forcedCount === null ? stableUuid(SEED, company.key, day, index) : stableUuid(SEED, "gap", company.key, day, index), company: company.key, channel, store, customer, items: [...items].map(([variantId, quantity]) => ({ variantId, quantity })),
      createdAt, paidAt: new Date(createdAt.getTime() + (3 + Math.floor(rng() * 40)) * 60_000),
      fulfilledAt: outcome === "FULFILLED" ? new Date(createdAt.getTime() + (channel === "POS" ? 2 * 60_000 : (2 + Math.floor(rng() * 46)) * 3_600_000)) : null,
      cancelledAt: outcome === "CANCELLED" ? new Date(createdAt.getTime() + (1 + Math.floor(rng() * 20)) * 3_600_000) : null,
      fulfillment, method, outcome,
    });
  }
  return orders.sort((a, b) => a.createdAt - b.createdAt);
}

// ------------------------------------------------------------------ ejecución de pedidos

async function ensureStock(ownerEmail, saved, orders, ledger) {
  const demand = new Map();
  for (const order of orders) for (const item of order.items) {
    const key = `${order.store.warehouseId}:${item.variantId}`; demand.set(key, (demand.get(key) ?? 0) + item.quantity);
  }
  const restocks = [];
  for (const [key, needed] of demand) {
    const [warehouseId, variantId] = key.split(":");
    if (!ledger.has(key)) ledger.set(key, null);
    let available = ledger.get(key);
    if (available === null) {
      const stock = await as(ownerEmail, "GET", `/api/inventory/warehouses/${warehouseId}/stock`);
      for (const row of stock) ledger.set(`${warehouseId}:${row.variantId}`, Number(row.availableQuantity ?? row.physicalQuantity - row.committedQuantity));
      available = ledger.get(key) ?? 0;
    }
    if (available - needed < RESTOCK_THRESHOLD) {
      const quantity = RESTOCK_QUANTITY + needed;
      await as(ownerEmail, "POST", "/api/inventory/movements", { body: { warehouseId, variantId, movementType: "ENTRY", quantity, reason: "Reposición automática (umbral de stock)", referenceType: "SEED_RESTOCK" } });
      restocks.push(warehouseId);
      available += quantity;
    }
    ledger.set(key, available - needed);
  }
  return restocks;
}

const ADDRESS = (customer, city) => ({ label: "Casa", recipientName: `${customer.firstName} ${customer.lastName}`, recipientPhone: "70000000", department: city ?? "Santa Cruz", city: city ?? "Santa Cruz", zone: "Centro", addressLine: "Calle Principal 123", reference: null, defaultAddress: true });

async function runEcommerce(order, ownerEmail, companyId, city) {
  const customerEmail = order.customer.email;
  if (order.fulfillment === "DELIVERY" && !order.customer.addressId) {
    order.customer.addressId = (await as(customerEmail, "POST", "/api/customer/addresses", { body: ADDRESS(order.customer, city) })).id;
  }
  await http("DELETE", `/api/customer/cart?companyId=${companyId}`, { token: await login(customerEmail) });
  for (const item of order.items) await as(customerEmail, "POST", "/api/customer/cart/items", { body: { companyId, variantId: item.variantId, quantity: item.quantity } });
  const created = await as(customerEmail, "POST", "/api/customer/orders", { body: { companyId, warehouseId: order.store.warehouseId, fulfillmentType: order.fulfillment, addressId: order.fulfillment === "DELIVERY" ? order.customer.addressId : null }, headers: { "Idempotency-Key": order.key } });
  order.orderId = created.id;
  if (created.status !== "RESERVED") return;
  if (order.outcome === "PENDING" && order.key.charCodeAt(0) % 2 === 0) return; // reservado sin pago aún
  const payment = await as(customerEmail, "POST", `/api/customer/orders/${created.id}/payments`, { body: { method: order.method } }, (status) => status < 300 || status === 409);
  const paymentId = payment?.id ?? (await as(customerEmail, "GET", `/api/customer/orders/${created.id}/payments`)).find((candidate) => candidate.status === "PENDING")?.id;
  if (!paymentId || order.outcome === "PENDING") return;
  if (order.outcome === "CANCELLED") {
    await as(ownerEmail, "POST", `/api/admin/payments/${paymentId}/fail`, { body: { reason: "Pago no completado" } });
    await as(customerEmail, "POST", `/api/customer/orders/${created.id}/cancel`, { body: {} });
    return;
  }
  await as(ownerEmail, "POST", `/api/admin/payments/${paymentId}/confirm`, { body: {} });
  await as(ownerEmail, "POST", `/api/admin/orders/${created.id}/fulfill`, { body: {} });
}

async function runPos(order, ownerEmail, sessionId) {
  const sale = await as(ownerEmail, "POST", "/api/admin/pos/sales", { body: { clientOperationId: order.key, cashSessionId: sessionId, customerId: order.customer?.id ?? null, paymentMethod: order.method, items: order.items } });
  order.orderId = sale.orderId;
  if (order.method !== "CASH" && sale.paymentStatus === "PENDING") await as(ownerEmail, "POST", `/api/admin/pos/sales/payments/${sale.paymentId}/confirm`, { body: {} });
}

async function openSession(ownerEmail, pointId) {
  const opened = await http("POST", "/api/admin/cash-sessions/open", { token: await login(ownerEmail), body: { pointOfSaleId: pointId, openingAmount: 300 } });
  if (opened.status < 300) return opened.data;
  return as(ownerEmail, "GET", `/api/admin/cash-sessions/open/${pointId}`);
}

// ------------------------------------------------------------------ reescritura de fechas (única escritura SQL)

async function rewriteDates(client, orders, sessions, restockIds, day) {
  if (!orders.length && !sessions.length && !restockIds.length) return;
  await client.query("BEGIN");
  try {
    // Sin triggers: no se incrementan versiones ni se registran cambios de sync (Fase 2).
    await client.query("SET LOCAL session_replication_role = replica");
    const rows = orders.filter((order) => order.orderId);
    if (rows.length) {
      const values = JSON.stringify(rows.map((order) => ({ id: order.orderId, c: order.createdAt.toISOString(), p: order.paidAt.toISOString(), f: order.fulfilledAt?.toISOString() ?? null, x: order.cancelledAt?.toISOString() ?? null })));
      const target = `with t as (select (v->>'id')::uuid id, (v->>'c')::timestamptz c, (v->>'p')::timestamptz p, (v->>'f')::timestamptz f, (v->>'x')::timestamptz x from jsonb_array_elements($1::jsonb) v)`;
      await client.query(`${target} update orders o set created_at = t.c, updated_at = greatest(t.c, coalesce(case when o.fulfilled_at is not null then coalesce(t.f, t.p) end, case when o.cancelled_at is not null then t.x end, t.p)),
        fulfilled_at = case when o.fulfilled_at is not null then coalesce(t.f, t.p) end, cancelled_at = case when o.cancelled_at is not null then coalesce(t.x, t.p) end,
        client_created_at = case when o.client_created_at is not null then t.c end, synced_at = case when o.synced_at is not null then t.c end from t where o.id = t.id`, [values]);
      await client.query(`${target} update order_items i set created_at = t.c from t where i.order_id = t.id`, [values]);
      await client.query(`${target} update order_inventory_allocations a set created_at = t.c from t where a.order_id = t.id`, [values]);
      await client.query(`${target} update payments p set created_at = t.c + interval '1 minute', updated_at = t.p, paid_at = case when p.paid_at is not null then t.p end,
        failed_at = case when p.failed_at is not null then t.p end, cancelled_at = case when p.cancelled_at is not null then t.p end, refunded_at = case when p.refunded_at is not null then t.p end from t where p.order_id = t.id`, [values]);
      await client.query(`${target} update payment_status_history h set created_at = case when h.to_status = 'PENDING' then t.c + interval '1 minute' else t.p end from t, payments p where p.id = h.payment_id and p.order_id = t.id`, [values]);
      await client.query(`${target} update inventory_movements m set created_at = case m.movement_type when 'RESERVE' then t.c when 'SALE' then coalesce(t.f, t.p, t.c) when 'RELEASE' then coalesce(t.x, t.c) else t.c end from t where m.reference_id = t.id`, [values]);
      await client.query(`${target} update shopping_carts sc set created_at = t.c - interval '15 minutes', updated_at = t.c from t, orders o where o.id = t.id and sc.id = o.source_cart_id`, [values]);
      await client.query(`${target} update shopping_cart_items ci set created_at = t.c - interval '12 minutes', updated_at = t.c - interval '10 minutes' from t, orders o where o.id = t.id and ci.cart_id = o.source_cart_id`, [values]);
    }
    for (const session of sessions) {
      const opened = new Date(Date.parse(`${day}T00:00:00Z`) + (9 + TZ_OFFSET_HOURS) * 3_600_000).toISOString();
      const closed = new Date(Date.parse(`${day}T00:00:00Z`) + (21 + TZ_OFFSET_HOURS) * 3_600_000).toISOString();
      await client.query("update cash_sessions set opened_at = $2, closed_at = case when closed_at is not null then $3::timestamptz end, created_at = $2, updated_at = $3 where id = $1", [session, opened, closed]);
      await client.query("update cash_movements set created_at = $2 where cash_session_id = $1", [session, closed]);
    }
    if (restockIds.length) {
      // La respuesta de movimientos devuelve el stock (no el id): se ubican por su referencia y por ser de esta corrida.
      await client.query("update inventory_movements set created_at = $3 where reference_type = 'SEED_RESTOCK' and created_at >= $2::timestamptz and warehouse_id = any($1::uuid[])",
        [[...new Set(restockIds)], RUN_STARTED_AT, new Date(Date.parse(`${day}T00:00:00Z`) + (7 + TZ_OFFSET_HOURS) * 3_600_000).toISOString()]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}

/** El stock inicial de las tiendas nuevas queda fechado el día anterior a su primera venta. */
async function rewriteInitialStockDates(client, saved, start, since = RUN_STARTED_AT) {
  const warehouses = saved.stores.map((store) => store.warehouseId);
  const at = new Date(Date.parse(`${addDays(start, -1)}T00:00:00Z`) + (8 + TZ_OFFSET_HOURS) * 3_600_000).toISOString();
  await client.query("BEGIN");
  await client.query("SET LOCAL session_replication_role = replica");
  await client.query("update inventory_movements set created_at = $3 where reference_type = 'INITIAL_STOCK' and created_at >= $2::timestamptz and warehouse_id = any($1::uuid[])", [warehouses, since, at]);
  await client.query("update inventory_stocks set created_at = $3 where created_at >= $2::timestamptz and warehouse_id = any($1::uuid[])", [warehouses, since, at]);
  await client.query("COMMIT");
}

async function rewriteCustomerDates(client, customers) {
  const rows = customers.filter((customer) => customer.id).map((customer) => ({ id: customer.id, d: `${customer.joinDay}T${String(10 + (hashSeed(customer.email) % 10)).padStart(2, "0")}:00:00-04:00` }));
  if (!rows.length) return;
  await client.query("BEGIN");
  await client.query("SET LOCAL session_replication_role = replica");
  await client.query(`update app_users u set created_at = (v->>'d')::timestamptz, updated_at = (v->>'d')::timestamptz from jsonb_array_elements($1::jsonb) v where u.id = (v->>'id')::uuid`, [JSON.stringify(rows)]);
  await client.query(`update customer_addresses a set created_at = u.created_at, updated_at = u.created_at from app_users u where u.id = a.user_id and u.id = any($1::uuid[])`, [rows.map((row) => row.id)]);
  await client.query("COMMIT");
}

// ------------------------------------------------------------------ verificación estadística

async function verify(client) {
  const q = async (sql, params = []) => (await client.query(sql, params)).rows;
  const local = "(o.created_at at time zone 'America/La_Paz')";
  const byCompany = `join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id join companies c on c.id = s.company_id`;
  const report = {};
  report.ordersByMonth = await q(`select c.name company, to_char(date_trunc('month', ${local}), 'YYYY-MM') as month, count(*)::int as orders from orders o ${byCompany} where c.code not like 'DEMO%' group by 1, 2 order by 1, 2`);
  report.totals = await q(`select c.name company, count(*)::int orders, count(distinct o.customer_id)::int customers, min(${local})::date first_day, max(${local})::date last_day from orders o ${byCompany} where c.code not like 'DEMO%' group by 1 order by 2 desc`);
  report.emptyDaysLast90 = await q(`select c.name company, count(*)::int empty_days from companies c cross join generate_series(current_date - 89, current_date, interval '1 day') d
    where c.code not like 'DEMO%' and c.slug <> 'primer-paso' and exists (select 1 from stores s where s.company_id = c.id)
      and not exists (select 1 from orders o join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id where s.company_id = c.id and ${local}::date = d::date)
      and exists (select 1 from orders o join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id where s.company_id = c.id) group by 1`);
  report.negativeStock = (await q("select count(*)::int n from inventory_stocks where physical_quantity < 0 or committed_quantity < 0 or committed_quantity > physical_quantity"))[0].n;
  report.totalMismatch = (await q("select count(*)::int n from orders o where o.total <> (select coalesce(sum(i.subtotal), 0) from order_items i where i.order_id = o.id) - o.discount_amount"))[0].n;
  report.paymentIncoherence = (await q(`select count(*)::int n from orders o where (o.status = 'FULFILLED' and not exists (select 1 from payments p where p.order_id = o.id and p.status in ('PAID', 'REFUNDED')))
    or (o.status = 'CANCELLED' and exists (select 1 from payments p where p.order_id = o.id and p.status = 'PAID'))`))[0].n;
  report.crossCompany = (await q(`select count(*)::int n from order_items i join orders o on o.id = i.order_id join product_variants pv on pv.id = i.variant_id join products p on p.id = pv.product_id ${byCompany} where p.company_id <> c.id`))[0].n;
  report.weekendRatio = await q(`select c.name company, round(avg(case when extract(isodow from ${local}) >= 5 then 1.0 else 0 end * 7 / 3) / nullif(avg(case when extract(isodow from ${local}) < 5 then 1.0 else 0 end * 7 / 4), 0), 2) fri_sun_vs_mon_thu
    from orders o ${byCompany} where c.code not like 'DEMO%' group by 1`);
  report.pareto = await q(`with sales as (select p.company_id, p.id, sum(i.subtotal) amount from order_items i join product_variants pv on pv.id = i.variant_id join products p on p.id = pv.product_id join orders o on o.id = i.order_id where o.status <> 'CANCELLED' group by 1, 2),
    ranked as (select company_id, amount, row_number() over (partition by company_id order by amount desc) rn, count(*) over (partition by company_id) n, sum(amount) over (partition by company_id) total from sales)
    select c.name company, round(100 * sum(amount) filter (where rn <= ceil(n * 0.2)) / max(total), 1) top20_share_pct from ranked r join companies c on c.id = r.company_id where c.code not like 'DEMO%' group by 1`);
  report.cancellation = await q(`select o.fulfillment_type, round(100.0 * avg(case when o.status = 'CANCELLED' then 1 else 0 end), 1) cancel_pct, count(*)::int orders from orders o group by 1`);
  report.hours = await q(`select o.order_channel channel, extract(hour from ${local})::int as hour, count(*)::int as orders from orders o group by 1, 2 order by 1, 3 desc`);
  return report;
}

// ------------------------------------------------------------------ main

async function main() {
  const tenants = TENANTS.filter((tenant) => !ONLY || tenant.key === ONLY || tenant.group === ONLY || tenant.companies.some((company) => company.key === ONLY));
  const days = []; for (let day = START; day <= UNTIL; day = addDays(day, 1)) days.push(day);

  if (DRY_RUN) {
    let total = 0;
    for (const tenant of tenants) for (const company of tenant.companies) {
      const fake = { customers: Array.from({ length: company.customers }, () => ({ segment: "OCCASIONAL", joinDay: company.start, churnDay: null, orders: 0, email: "x" })), stores: [{ weight: 1, warehouseId: "w" }], variants: [{ id: "v", price: 200, category: "x", paretoWeight: 1 }] };
      fake.customers.forEach((customer, index) => { customer.email = `c${index}`; });
      const count = days.reduce((sum, day) => sum + planDay(company, fake, day).length, 0);
      total += count; console.log(`  ${company.key.padEnd(18)} ≈ ${count} pedidos nuevos (${company.start} → ${END})`);
    }
    console.log(`  total ≈ ${total} pedidos nuevos (sin contar los 1085 existentes de VÉLORA). Sin cambios (--dry-run).`);
    return;
  }

  const client = new pg.Client({ connectionString: ENV.DATABASE_URL });
  await client.connect();
  try {
    if (VERIFY) { console.log(JSON.stringify(await verify(client), null, 2)); return; }
    const progress = loadProgress();
    const started = Date.now();
    console.log(`Seed ${SEED} · API ${API} · ${tenants.map((tenant) => tenant.key).join(", ")}${RESUME ? " · reanudando" : ""}`);

    const active = [];
    for (const tenant of tenants) {
      progress.tenants[tenant.key] ??= { companies: {} };
      const state = progress.tenants[tenant.key];
      const ownerEmail = tenant.existing ? await setupVelora(tenant, state) : await setupNewTenant(tenant, state);
      if (!ownerEmail) continue;
      for (const company of tenant.companies) {
        const saved = state.companies[company.key];
        await setupCustomers(company, saved);
        if (!saved.customerDatesDone) { await rewriteCustomerDates(client, saved.customers); saved.customerDatesDone = true; }
        if (!tenant.existing) await rewriteInitialStockDates(client, saved, company.start);
        // Tiendas de Trama: su stock inicial lo creó seed-new-stores.mjs antes de esta corrida (almacenes exclusivos).
        else if (tenant.rewriteInitialStock && !saved.initialStockDated) { await rewriteInitialStockDates(client, saved, company.start, "1970-01-01T00:00:00Z"); saved.initialStockDated = true; }
        active.push({ tenant, company, saved, ownerEmail, ledger: new Map() });
        saveProgress(progress);
        console.log(`  ✔ ${company.key}: ${saved.stores.length} sucursales, ${saved.variants.length} variantes, ${saved.customers.length} clientes`);
      }
    }

    let created = 0;
    const runDay = async (day, plan) => {
      const dayOrders = []; const sessions = []; let restocks = [];
      for (const entry of active) {
        const orders = plan(entry, day);
        if (!orders.length) continue;
        restocks = restocks.concat(await ensureStock(entry.ownerEmail, entry.saved, orders, entry.ledger));
        const posStores = new Map();
        for (const order of orders.filter((candidate) => candidate.channel === "POS")) posStores.set(order.store.pointId, order.store);
        const sessionByPoint = new Map();
        for (const pointId of posStores.keys()) { const session = await openSession(entry.ownerEmail, pointId); sessionByPoint.set(pointId, session.id); sessions.push(session.id); }
        const companyId = entry.company.companyId ?? entry.saved.companyId;
        const errors = await pool(orders, CONCURRENCY, async (order) => {
          if (order.channel === "POS") await runPos(order, entry.ownerEmail, sessionByPoint.get(order.store.pointId));
          else await runEcommerce(order, entry.ownerEmail, companyId, entry.company.city);
        });
        for (const [pointId, sessionId] of sessionByPoint) {
          const open = await as(entry.ownerEmail, "GET", `/api/admin/cash-sessions/open/${pointId}`, {}, (status) => status < 300 || status === 404);
          await as(entry.ownerEmail, "POST", `/api/admin/cash-sessions/${sessionId}/close`, { body: { countedCashAmount: Number(open?.expectedCashAmount ?? 300), closingNotes: "Cierre del día" } }, (status) => status < 300 || status === 409);
        }
        if (errors.length) console.log(`  ! ${entry.company.key} ${day}: ${errors.length} pedidos con error (primero: ${errors[0].message.slice(0, 160)})`);
        dayOrders.push(...orders);
      }
      await rewriteDates(client, dayOrders, sessions, restocks, day);
      created += dayOrders.filter((order) => order.orderId).length;
    };

    if (FILL_GAPS) {
      // Continuidad: ≥1 pedido diario en los últimos 90 días y, en el mes en curso, al menos el 85 %
      // del ritmo de los 60 días previos (con la estacionalidad semanal). Primer Paso (FREE) se excluye.
      const needs = new Map();
      for (const entry of active.filter((candidate) => candidate.tenant.plan !== "FREE")) {
        const companyId = entry.company.companyId ?? entry.saved.companyId;
        const counts = new Map((await client.query(`select to_char(o.created_at at time zone 'America/La_Paz', 'YYYY-MM-DD') as day, count(*)::int as orders
          from orders o join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id where s.company_id = $1 group by 1`, [companyId])).rows.map((row) => [row.day, row.orders]));
        const monthStart = `${END.slice(0, 8)}01`;
        const window = []; for (let day = addDays(monthStart, -60); day < monthStart; day = addDays(day, 1)) window.push(counts.get(day) ?? 0);
        const average = window.reduce((sum, value) => sum + value, 0) / Math.max(1, window.length);
        const weekdayMean = WEEKDAY.reduce((sum, value) => sum + value, 0) / 7;
        for (let day = addDays(END, -89); day <= END; day = addDays(day, 1)) {
          const existing = counts.get(day) ?? 0;
          const target = day >= monthStart ? Math.round(0.85 * average * WEEKDAY[new Date(`${day}T12:00:00Z`).getUTCDay()] / weekdayMean) : 1;
          if (target > existing) needs.set(`${entry.company.key}|${day}`, target - existing);
        }
      }
      const gapDays = [...new Set([...needs.keys()].map((key) => key.split("|")[1]))].sort();
      for (const day of gapDays) await runDay(day, (entry) => needs.has(`${entry.company.key}|${day}`) ? planDay(entry.company, entry.saved, day, needs.get(`${entry.company.key}|${day}`)) : []);
      console.log(`Continuidad: ${created} pedidos agregados en ${gapDays.length} días.`);
      return;
    }

    for (const day of days) {
      if (progress.lastDay && day <= progress.lastDay) continue;
      await runDay(day, (entry) => planDay(entry.company, entry.saved, day));
      progress.lastDay = day; saveProgress(progress);
      if (day.endsWith("-01") || day === END) console.log(`  ${day} · ${created} pedidos creados · ${Math.round((Date.now() - started) / 60000)} min`);
    }
    console.log(`Listo: ${created} pedidos nuevos en ${Math.round((Date.now() - started) / 60000)} min. Ejecuta --verify para las estadísticas.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error(`Seed interrumpido: ${error instanceof Error ? error.stack : String(error)}`); process.exitCode = 1; });

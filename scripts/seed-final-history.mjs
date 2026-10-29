#!/usr/bin/env node
// Historial final para la defensa (Parte B · B1). Continúa el historial de seed-realistic-history.mjs
// y seed-new-stores.mjs con el MISMO flujo HTTP real (carrito, pedido, pago, confirmación, entrega o
// cancelación, POS con sesión de caja, reposición con movimientos ENTRY). La ÚNICA escritura SQL
// reescribe columnas de FECHA (nunca montos, estados ni stock):
//   · VÉLORA: 24 meses continuos (retroceso 2024-11-11 → 2025-05-31 anclado al ritmo real de jun-2025).
//   · Casa Montalvo e Ímpetu Sport: retroceso 2026-05-10 → 2026-07-22 (≈ 6 meses al 11-nov).
//   · Solana (la más nueva): sus pedidos existentes se RE-FECHAN al tramo 12-oct → ayer con crecimiento
//     semanal ~10 %, picos de fin de semana y promoción y ticket creciente; luego sigue creciendo.
//   · Todas: continúan desde su ritmo real de los últimos 28 días hasta HOY (o --until).
//   · Huecos: ≥ 1 pedido diario en los últimos 90 días (VÉLORA desde 2025-01-01; FREE excluida).
//   · Fechas de creación (empresa, sucursales, catálogo, stock) coherentes con el primer pedido.
//
// Uso:
//   node scripts/seed-final-history.mjs [--dry-run] [--resume] [--only <slug>] [--until AAAA-MM-DD] [--verify]
//   Tramo final (9 o 10 de noviembre): node scripts/seed-final-history.mjs --until 2026-11-11 --resume
// Idempotente: el progreso vive en scripts/.seed-progress/final-<semilla>.json (no versionado) y una
// segunda corrida sin --resume se niega a duplicar. Un día en curso solo ejecuta los pedidos cuya hora
// ya pasó; el resto queda pendiente para la siguiente corrida con --resume.
// Variables (del .env raíz; nunca se imprimen): VELORA_SEED_API_BASE (p. ej. http://127.0.0.1:18080),
// DATABASE_URL, VELORA_SEED_OWNER_EMAIL/PASSWORD (VÉLORA), VELORA_TRAMA_OWNER_PASSWORD (tiendas Trama).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const pg = createRequire(join(ROOT, "packages/database/package.json"))("pg");

// ------------------------------------------------------------------ configuración

const SEED = 20261111;
const TZ_OFFSET_HOURS = 4; // Bolivia UTC-4
const CUSTOMER_PASSWORD = "SeedCliente2026";
const SEED_OWNER_PASSWORD = "SeedPropietario2026";
const CONCURRENCY = Number(process.env.VELORA_SEED_CONCURRENCY ?? 4);
const RESTOCK_THRESHOLD = 6;
const RESTOCK_QUANTITY = 30;
const MAX_MINUTES = 85;
const RUN_STARTED_AT = new Date(Date.now() - 60_000).toISOString();

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const DRY_RUN = flag("--dry-run");
const RESUME = flag("--resume");
const VERIFY = flag("--verify");
const ONLY = option("--only");
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(new Date());
const UNTIL = option("--until") ?? TODAY;
if (!/^\d{4}-\d{2}-\d{2}$/.test(UNTIL)) throw new Error("--until debe tener el formato AAAA-MM-DD.");

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
const API = (ENV.VELORA_SEED_API_BASE ?? "http://127.0.0.1:18080").replace(/\/$/, "");

const SOLANA_START = "2026-10-12";
const SOLANA_WEEKLY_GROWTH = 0.10;
const SOLANA_PROMOS = { "2026-10-24": 1.7, "2026-11-07": 1.8 }; // lanzamiento y "2x1 de noviembre"

/**
 * Tiendas. `old` = archivo/tenant/empresa del progreso de las corridas anteriores (clientes ya registrados).
 * backfill: tramo nuevo ANTES de lo existente; continuousFrom: desde cuándo no puede haber días vacíos.
 */
const COMPANIES = [
  { key: "velora", companyId: "10000000-0000-0000-0000-000000000001", owner: "env", city: "Santa Cruz", ecommerce: 0.45, delivery: 0.5, growth: 0.04,
    old: ["seed-20251001-all.json", "velora", "velora"], backfill: { from: "2024-11-11", to: "2025-05-31", customers: 70 }, continuousFrom: "2024-11-11",
    // Junio 2025 original es escaso (28 pedidos): se completa con pedidos NUEVOS para que la unión no tenga un bache.
    topUp: { from: "2025-06-01", to: "2025-06-30", target: 52 } },
  { key: "urbano-boutique", owner: "lucia.arce@urbano.seed.velora.local", city: "Santa Cruz", ecommerce: 0.6, delivery: 0.55, growth: 0.04, old: ["seed-20251001-all.json", "urbano", "urbano-boutique"] },
  { key: "urbano-outlet", owner: "lucia.arce@urbano.seed.velora.local", city: "Santa Cruz", ecommerce: 0.3, delivery: 0.35, growth: 0.035, old: ["seed-20251001-all.json", "urbano", "urbano-outlet"] },
  { key: "andina-moda", owner: "mateo.quispe@andina.seed.velora.local", city: "La Paz", ecommerce: 0.5, delivery: 0.45, growth: 0.04, old: ["seed-20251001-all.json", "andina", "andina-moda"] },
  { key: "primer-paso", owner: "valeria.rojas@primerpaso.seed.velora.local", city: "Cochabamba", ecommerce: 0.4, delivery: 0.3, growth: 0.03, free: true, old: ["seed-20251001-all.json", "primer-paso", "primer-paso"] },
  { key: "casa-montalvo", owner: "rodrigo.salvatierra@trama.seed.local", ownerPasswordEnv: "VELORA_TRAMA_OWNER_PASSWORD", city: "La Paz", ecommerce: 0.5, delivery: 0.45, growth: 0.035,
    old: ["seed-20251001-trama.json", "trama-rodrigo", "casa-montalvo"], backfill: { from: "2026-05-10", to: "2026-07-22", customers: 35 }, redateInitialStock: true },
  { key: "impetu-sport", owner: "rodrigo.salvatierra@trama.seed.local", ownerPasswordEnv: "VELORA_TRAMA_OWNER_PASSWORD", city: "La Paz", ecommerce: 0.55, delivery: 0.5, growth: 0.035,
    old: ["seed-20251001-trama.json", "trama-rodrigo", "impetu-sport"], backfill: { from: "2026-05-10", to: "2026-07-22", customers: 35 }, redateInitialStock: true },
  { key: "solana", owner: "daniela.ferrufino@trama.seed.local", ownerPasswordEnv: "VELORA_TRAMA_OWNER_PASSWORD", city: "Santa Cruz", ecommerce: 0.65, delivery: 0.5, growth: 0, solana: true,
    old: ["seed-20251001-trama.json", "trama-daniela", "solana"] },
];

// ------------------------------------------------------------------ PRNG y calendario

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashSeed = (...parts) => createHash("sha256").update(parts.join("|")).digest().readUInt32BE(0);
const rngFor = (...parts) => mulberry32(hashSeed(SEED, ...parts));
function normal(rng) { let u = 0; while (u === 0) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); }
function poisson(rng, lambda) { if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal(rng))); const l = Math.exp(-lambda); let k = 0; let p = 1; do { k += 1; p *= rng(); } while (p > l); return k - 1; }
function pickWeighted(rng, items, weight) { const total = items.reduce((sum, item) => sum + weight(item), 0); let r = rng() * total; for (const item of items) { r -= weight(item); if (r <= 0) return item; } return items[items.length - 1]; }
function stableUuid(...parts) {
  const hex = createHash("sha256").update(parts.join("|")).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const range = (from, to) => { const days = []; for (let day = from; day <= to; day = addDays(day, 1)) days.push(day); return days; };
const localTime = (day, hour, minute = 0) => new Date(Date.parse(`${day}T00:00:00Z`) + ((hour + TZ_OFFSET_HOURS) * 60 + minute) * 60_000);

const WEEKDAY = [1.2, 0.8, 0.85, 0.9, 1.0, 1.25, 1.45]; // domingo..sábado
const WEEKDAY_MEAN = WEEKDAY.reduce((sum, value) => sum + value, 0) / 7;
const weekday = (day) => WEEKDAY[new Date(`${day}T12:00:00Z`).getUTCDay()] / WEEKDAY_MEAN;

function specialFactor(day) {
  const md = day.slice(5);
  if (md === "03-19") return 1.6;                                        // Día del Padre
  if (md === "05-27") return 1.8;                                        // Día de la Madre
  if (["05-24", "05-25", "05-26"].includes(md)) return 1.3;
  if (day === "2024-11-29" || day === "2025-11-28" || day === "2026-11-27") return 2.5; // Black Friday
  if (md === "12-24") return 1.8;
  if (md >= "12-15" && md <= "12-23") return 1.5;
  if (md === "12-25") return 0.5;
  if (md === "01-01") return 0.6;
  return 1;
}
function paydayFactor(day) {
  const date = Number(day.slice(8, 10));
  const last = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).getUTCDate();
  if (date >= 14 && date <= 16) return 1.15;
  if (date >= last - 1 || date === 1) return 1.2;
  return 1;
}
function seasonFactor(categoryName, day) {
  const month = Number(day.slice(5, 7)); const name = categoryName.toLowerCase();
  const winter = month >= 6 && month <= 8; const summer = month >= 11 || month <= 2;
  if (/abrigo|tejido|chompa|chaqueta|parka/.test(name)) return winter ? 2.6 : 0.6;
  if (/vestido|sandalia|lente/.test(name)) return summer ? 2.2 : winter ? 0.5 : 1;
  return 1;
}
function localHour(rng, channel) {
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

/**
 * Solana: el total de cada semana (lunes a domingo desde el 12-oct) crece un 10 % sobre la anterior; dentro
 * de la semana, la demanda se reparte según fin de semana y promoción (la promoción concentra pedidos ese día
 * en lugar de inflar la semana).
 */
const solanaDayWeight = (day) => weekday(day) * (SOLANA_PROMOS[day] ?? 1);
function solanaShape(day) {
  const week = Math.floor(daysBetween(SOLANA_START, day) / 7);
  const weekStart = addDays(SOLANA_START, week * 7);
  const mean = range(weekStart, addDays(weekStart, 6)).reduce((sum, value) => sum + solanaDayWeight(value), 0) / 7;
  return (1 + SOLANA_WEEKLY_GROWTH) ** week * solanaDayWeight(day) / mean;
}
const SOLANA_REMAP_VERSION = 2;

/**
 * Pedidos esperados por día, CONTINUOS con lo existente: hacia adelante se parte del ritmo real de los
 * últimos 28 días (`anchor`) y hacia atrás del ritmo real del primer mes (`firstAnchor`).
 */
function expectedOrders(company, saved, day, rng) {
  const noise = Math.exp(0.15 * normal(rng) - 0.011);
  if (company.solana) return saved.solanaBase * solanaShape(day) * noise;
  const anchor = day < saved.firstDay ? saved.firstAnchor : saved.anchor;
  const months = daysBetween(anchor.day, day) / 30.44;
  return anchor.perDay * (1 + company.growth) ** months * weekday(day) * paydayFactor(day) * specialFactor(day) * noise;
}

// ------------------------------------------------------------------ progreso

const PROGRESS_DIR = join(ROOT, "scripts", ".seed-progress");
const PROGRESS_FILE = join(PROGRESS_DIR, `final-${SEED}.json`);
function loadProgress() {
  if (existsSync(PROGRESS_FILE) && !RESUME && !DRY_RUN && !VERIFY) throw new Error(`Ya existe ${PROGRESS_FILE}: use --resume para continuar sin duplicar.`);
  return existsSync(PROGRESS_FILE) ? JSON.parse(readFileSync(PROGRESS_FILE, "utf8")) : { companies: {}, flags: {}, pending: {} };
}
function saveProgress(progress) { mkdirSync(PROGRESS_DIR, { recursive: true }); writeFileSync(PROGRESS_FILE, JSON.stringify(progress)); }
function oldState(company) {
  const [file, tenant, key] = company.old;
  const path = join(PROGRESS_DIR, file);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")).tenants?.[tenant]?.companies?.[key] ?? null;
}

// ------------------------------------------------------------------ HTTP

const tokens = new Map();
async function http(method, path, { token, body, headers = {} } = {}, attempt = 0) {
  let response;
  try {
    response = await fetch(`${API}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (error) {
    if (attempt < 5) { await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1))); return http(method, path, { token, body, headers }, attempt + 1); }
    throw error;
  }
  const text = await response.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if ((response.status === 429 || response.status >= 502) && attempt < 5) { await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1))); return http(method, path, { token, body, headers }, attempt + 1); }
  return { status: response.status, data };
}
async function login(email) {
  const cached = tokens.get(email);
  if (cached?.token) return cached.token;
  const result = await http("POST", "/api/auth/login", { body: { email, password: cached?.password } });
  if (result.status !== 200) throw new Error(`No se pudo iniciar sesión (${email.split("@")[0]}…): HTTP ${result.status}.`);
  tokens.set(email, { token: result.data.accessToken, password: cached?.password });
  return result.data.accessToken;
}
async function as(email, method, path, options = {}, ok = (status) => status < 300) {
  const result = await http(method, path, { ...options, token: await login(email) });
  if (result.status === 401) { tokens.set(email, { password: tokens.get(email)?.password }); return as(email, method, path, options, ok); }
  if (!ok(result.status)) throw new Error(`${method} ${path} → ${result.status} ${JSON.stringify(result.data).slice(0, 300)}`);
  return result.data;
}
async function pool(items, size, worker) {
  let index = 0; const errors = [];
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (index < items.length) { const item = items[index++]; try { await worker(item); } catch (error) { errors.push(error); } }
  }));
  return errors;
}

// ------------------------------------------------------------------ preparación

function ownerEmailOf(company) {
  if (company.owner !== "env") {
    tokens.set(company.owner, { password: company.ownerPasswordEnv ? ENV[company.ownerPasswordEnv] : SEED_OWNER_PASSWORD });
    return company.owner;
  }
  if (!ENV.VELORA_SEED_OWNER_EMAIL || !ENV.VELORA_SEED_OWNER_PASSWORD) throw new Error("Faltan VELORA_SEED_OWNER_EMAIL/PASSWORD en el .env.");
  tokens.set(ENV.VELORA_SEED_OWNER_EMAIL, { password: ENV.VELORA_SEED_OWNER_PASSWORD });
  return ENV.VELORA_SEED_OWNER_EMAIL;
}

async function setupCompany(company, saved, ownerEmail, client) {
  const mine = await as(ownerEmail, "GET", "/api/admin/companies");
  const companyId = company.companyId ?? mine.find((candidate) => candidate.slug === company.key)?.id;
  if (!companyId) throw new Error(`No existe la tienda ${company.key}.`);
  saved.companyId = companyId;
  const stores = await as(ownerEmail, "GET", `/api/admin/stores?companyId=${companyId}`);
  const warehouses = await as(ownerEmail, "GET", "/api/inventory/warehouses");
  const points = await as(ownerEmail, "GET", `/api/admin/points-of-sale?companyId=${companyId}`);
  saved.stores = stores.filter((store) => store.active).map((store, index) => {
    const warehouse = warehouses.find((candidate) => candidate.storeId === store.id && candidate.defaultWarehouse) ?? warehouses.find((candidate) => candidate.storeId === store.id);
    const point = points.find((candidate) => candidate.storeId === store.id && candidate.active !== false);
    return { storeId: store.id, warehouseId: warehouse?.id, pointId: point?.id ?? null, name: store.name, weight: index === 0 ? 1 : 0.7 };
  }).filter((store) => store.warehouseId);
  for (const store of saved.stores.filter((candidate) => !candidate.pointId)) {
    store.pointId = (await as(ownerEmail, "POST", "/api/admin/points-of-sale", { body: { storeId: store.storeId, warehouseId: store.warehouseId, code: `CAJA-${store.storeId.slice(0, 4).toUpperCase()}`, name: `Caja ${store.name}` } })).id;
  }
  const products = (await as(ownerEmail, "GET", `/api/catalog/manage/products?companyId=${companyId}`)).filter((product) => product.status === "ACTIVE");
  const categories = await as(ownerEmail, "GET", `/api/catalog/manage/categories?companyId=${companyId}`);
  const rng = rngFor("pareto", company.key);
  const ranked = products.map((product) => ({ product, r: rng() })).sort((a, b) => a.r - b.r).map((entry) => entry.product);
  saved.variants = [];
  ranked.forEach((product, rank) => {
    const category = categories.find((candidate) => candidate.id === product.categoryId)?.name ?? "";
    for (const variant of (product.variants ?? []).filter((candidate) => candidate.active !== false)) {
      saved.variants.push({ id: variant.id, price: Number(variant.price), category: `${category} ${product.name}`, paretoWeight: 1 / (rank + 1) ** 1.15 / product.variants.length });
    }
  });
  if (!saved.variants.length) {
    // El listado puede no traer variantes: se piden por producto.
    for (const [rank, product] of ranked.entries()) {
      const detail = await as(ownerEmail, "GET", `/api/catalog/manage/products/${product.id}?companyId=${companyId}`);
      const category = categories.find((candidate) => candidate.id === product.categoryId)?.name ?? "";
      for (const variant of (detail.variants ?? []).filter((candidate) => candidate.active !== false)) {
        saved.variants.push({ id: variant.id, price: Number(variant.price), category: `${category} ${product.name}`, paretoWeight: 1 / (rank + 1) ** 1.15 / detail.variants.length });
      }
    }
  }
  // Ritmo real (anclas de continuidad) medido UNA vez y guardado: las corridas siguientes no se mueven.
  if (!saved.anchor) {
    const rows = (await client.query(`select (o.created_at at time zone 'America/La_Paz')::date::text as day, count(*)::int as n from orders o
      join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id where s.company_id = $1 group by 1 order by 1`, [companyId])).rows;
    const counts = new Map(rows.map((row) => [row.day, row.n]));
    saved.firstDay = rows[0]?.day ?? UNTIL;
    saved.lastDay = rows.at(-1)?.day ?? addDays(UNTIL, -1);
    const avg = (from, to) => range(from, to).reduce((sum, day) => sum + (counts.get(day) ?? 0), 0) / Math.max(1, daysBetween(from, to) + 1);
    saved.anchor = { day: addDays(saved.lastDay, -14), perDay: avg(addDays(saved.lastDay, -27), saved.lastDay) };
    saved.firstAnchor = { day: addDays(saved.firstDay, 14), perDay: avg(saved.firstDay, addDays(saved.firstDay, 27)) };
  }
}

async function setupCustomers(company, saved, client) {
  if (!saved.customers) {
    const old = oldState(company);
    saved.customers = (old?.customers ?? []).filter((customer) => customer.id).map(({ email, firstName, lastName, segment, joinDay, churnDay, id, addressId, orders }) => ({ email, firstName, lastName, segment, joinDay, churnDay, id, addressId, orders }));
    if (company.backfill) {
      const rng = rngFor("historicos", company.key);
      const span = daysBetween(company.backfill.from, company.backfill.to);
      for (let index = 0; index < company.backfill.customers; index += 1) {
        const segment = pickWeighted(rng, SEGMENTS, (candidate) => candidate.share).key;
        const joinDay = addDays(company.backfill.from, Math.floor(span * Math.sqrt(rng()) * 0.97));
        const first = ["Ana", "Lucía", "Camila", "Valentina", "Sofía", "Daniela", "Mariana", "Gabriela", "Paola", "Andrea", "Diego", "Luis", "Jorge", "Marco"][Math.floor(rng() * 14)];
        const last = ["Gutiérrez", "Mamani", "Flores", "Vargas", "Rojas", "Choque", "Quispe", "Suárez", "Paz", "Medina", "Cuéllar"][Math.floor(rng() * 11)];
        saved.customers.push({ email: `${company.key}.historico${String(index + 1).padStart(4, "0")}@clientes.seed.velora.local`, firstName: first, lastName: last, segment, joinDay, churnDay: segment === "CHURN_RISK" ? addDays(joinDay, 60 + Math.floor(rng() * 120)) : null, id: null, addressId: null, orders: 0, historic: true });
      }
    }
  }
  for (const customer of saved.customers) if (!tokens.has(customer.email)) tokens.set(customer.email, { password: CUSTOMER_PASSWORD });
  const pendingRegistration = saved.customers.filter((customer) => !customer.id);
  await pool(pendingRegistration, 3, async (customer) => {
    const result = await http("POST", "/api/auth/register", { body: { firstName: customer.firstName, lastName: customer.lastName, email: customer.email, password: CUSTOMER_PASSWORD } });
    if (result.status === 200) { customer.id = result.data.user.id; tokens.set(customer.email, { token: result.data.accessToken, password: CUSTOMER_PASSWORD }); return; }
    const logged = await http("POST", "/api/auth/login", { body: { email: customer.email, password: CUSTOMER_PASSWORD } });
    customer.id = logged.data?.user?.id ?? null;
  });
  const fresh = pendingRegistration.filter((customer) => customer.id);
  if (fresh.length) {
    await withDateTx(client, async () => {
      const rows = fresh.map((customer) => ({ id: customer.id, d: `${customer.joinDay}T${String(9 + (hashSeed(customer.email) % 10)).padStart(2, "0")}:00:00-04:00` }));
      await client.query(`update app_users u set created_at = (v->>'d')::timestamptz, updated_at = (v->>'d')::timestamptz from jsonb_array_elements($1::jsonb) v where u.id = (v->>'id')::uuid`, [JSON.stringify(rows)]);
    });
  }
}

// ------------------------------------------------------------------ planificación

function planDay(company, saved, day, forcedCount = null, tag = forcedCount === null ? "day" : "gap") {
  const rng = rngFor(tag, company.key, day);
  const count = forcedCount ?? poisson(rng, expectedOrders(company, saved, day, rng));
  const eligible = saved.customers.filter((customer) => customer.id && customer.joinDay <= day && (!customer.churnDay || day < customer.churnDay) && !(customer.segment === "ONE_TIME" && customer.orders > 0));
  const usedToday = new Set();
  const orders = [];
  // Solana: ticket creciente (más líneas y prendas de mayor precio con las semanas) y recompra alta.
  const growth = company.solana ? Math.min(1, daysBetween(SOLANA_START, day) / 35) : 0;
  for (let index = 0; index < count; index += 1) {
    const channel = rng() < company.ecommerce ? "ECOMMERCE" : "POS";
    const store = pickWeighted(rng, saved.stores, (candidate) => candidate.weight);
    let customer = null;
    if (channel === "ECOMMERCE" || rng() < 0.45) {
      const candidates = eligible.filter((candidate) => !usedToday.has(candidate.email));
      if (candidates.length) customer = pickWeighted(rng, candidates, (candidate) => SEGMENTS.find((segment) => segment.key === candidate.segment).weight * (candidate.joinDay === day ? 4 : 1) * (company.solana && candidate.orders > 0 ? 3 : 1));
    }
    if (channel === "ECOMMERCE" && !customer) continue;
    if (customer) { usedToday.add(customer.email); customer.orders += 1; }
    const segment = SEGMENTS.find((candidate) => candidate.key === customer?.segment) ?? SEGMENTS[1];
    const lines = Math.min(4, 1 + (rng() < 0.32 + 0.25 * growth ? 1 : 0) + (rng() < 0.1 + 0.1 * growth ? 1 : 0) + (segment.itemsBoost && rng() < 0.5 ? 1 : 0));
    const items = new Map();
    for (let line = 0; line < lines; line += 1) {
      const preference = Math.min(0.95, segment.pricePreference + 0.3 * growth);
      const variant = pickWeighted(rng, saved.variants, (candidate) => candidate.paretoWeight * seasonFactor(candidate.category, day) * (candidate.price > 300 ? 0.6 + preference : 1.4 - preference));
      items.set(variant.id, (items.get(variant.id) ?? 0) + (rng() < 0.12 ? 2 : 1));
    }
    const hour = localHour(rng, channel); const minute = Math.floor(rng() * 60);
    const createdAt = localTime(day, hour, minute);
    const ticket = [...items].reduce((sum, [variantId, quantity]) => sum + saved.variants.find((variant) => variant.id === variantId).price * quantity, 0);
    const fulfillment = channel === "POS" ? "IN_STORE" : rng() < company.delivery ? "DELIVERY" : "PICKUP";
    const method = channel === "POS" ? pickWeighted(rng, [["CASH", 0.55], ["QR", 0.3], ["CARD", 0.15]], (entry) => entry[1])[0]
      : fulfillment === "DELIVERY" ? pickWeighted(rng, [["COD", 0.42], ["QR", 0.38], ["CARD", 0.2]], (entry) => entry[1])[0]
        : pickWeighted(rng, [["CASH", 0.38], ["QR", 0.42], ["CARD", 0.2]], (entry) => entry[1])[0];
    const cancelProbability = channel === "POS" ? 0 : 0.04 + (fulfillment === "DELIVERY" ? 0.06 : 0) + (ticket > 600 ? 0.05 : 0) + (method === "COD" ? 0.05 : method === "QR" ? 0.015 : 0);
    const recent = day >= addDays(UNTIL, -1) && UNTIL >= TODAY;
    const outcome = rng() < cancelProbability ? "CANCELLED" : recent && channel === "ECOMMERCE" && rng() < 0.5 ? "PENDING" : "FULFILLED";
    orders.push({
      key: stableUuid(SEED, tag, company.key, day, index), channel, warehouseId: store.warehouseId, pointId: store.pointId, customerEmail: customer?.email ?? null,
      items: [...items].map(([variantId, quantity]) => ({ variantId, quantity })),
      createdAt: createdAt.toISOString(), paidAt: new Date(createdAt.getTime() + (3 + Math.floor(rng() * 40)) * 60_000).toISOString(),
      fulfilledAt: outcome === "FULFILLED" ? new Date(createdAt.getTime() + (channel === "POS" ? 2 * 60_000 : (2 + Math.floor(rng() * 30)) * 3_600_000)).toISOString() : null,
      cancelledAt: outcome === "CANCELLED" ? new Date(createdAt.getTime() + (1 + Math.floor(rng() * 20)) * 3_600_000).toISOString() : null,
      fulfillment, method, outcome,
    });
  }
  // Las entregas y cancelaciones nunca quedan en el futuro.
  const limit = Date.now() + (UNTIL > TODAY ? 30 * 86_400_000 : 0);
  for (const order of orders) {
    for (const field of ["fulfilledAt", "cancelledAt"]) {
      if (order[field]) order[field] = new Date(Math.max(Date.parse(order.paidAt), Math.min(Date.parse(order[field]), limit))).toISOString();
    }
  }
  return orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ------------------------------------------------------------------ ejecución

async function ensureStock(ownerEmail, orders, ledger) {
  const demand = new Map();
  for (const order of orders) for (const item of order.items) { const key = `${order.warehouseId}:${item.variantId}`; demand.set(key, (demand.get(key) ?? 0) + item.quantity); }
  const restocked = [];
  for (const [key, needed] of demand) {
    const [warehouseId, variantId] = key.split(":");
    if (!ledger.has(key)) {
      const stock = await as(ownerEmail, "GET", `/api/inventory/warehouses/${warehouseId}/stock`);
      for (const row of stock) ledger.set(`${warehouseId}:${row.variantId}`, Number(row.availableQuantity ?? row.physicalQuantity - row.committedQuantity));
      if (!ledger.has(key)) ledger.set(key, 0);
    }
    let available = ledger.get(key);
    if (available - needed < RESTOCK_THRESHOLD) {
      const quantity = RESTOCK_QUANTITY + needed;
      await as(ownerEmail, "POST", "/api/inventory/movements", { body: { warehouseId, variantId, movementType: "ENTRY", quantity, reason: "Reposición automática (umbral de stock)", referenceType: "SEED_RESTOCK" } });
      restocked.push(warehouseId);
      available += quantity;
    }
    ledger.set(key, available - needed);
  }
  return restocked;
}

const ADDRESS = (customer, city) => ({ label: "Casa", recipientName: `${customer.firstName} ${customer.lastName}`, recipientPhone: "70000000", department: city, city, zone: "Centro", addressLine: "Calle Principal 123", reference: null, defaultAddress: true });

async function runEcommerce(order, customer, ownerEmail, companyId, city) {
  const email = customer.email;
  if (order.fulfillment === "DELIVERY" && !customer.addressId) customer.addressId = (await as(email, "POST", "/api/customer/addresses", { body: ADDRESS(customer, city) })).id;
  await http("DELETE", `/api/customer/cart?companyId=${companyId}`, { token: await login(email) });
  for (const item of order.items) await as(email, "POST", "/api/customer/cart/items", { body: { companyId, variantId: item.variantId, quantity: item.quantity } });
  const created = await as(email, "POST", "/api/customer/orders", { body: { companyId, warehouseId: order.warehouseId, fulfillmentType: order.fulfillment, addressId: order.fulfillment === "DELIVERY" ? customer.addressId : null }, headers: { "Idempotency-Key": order.key } });
  order.orderId = created.id;
  if (created.status !== "RESERVED") return;
  if (order.outcome === "PENDING" && order.key.charCodeAt(0) % 2 === 0) return;
  const payment = await as(email, "POST", `/api/customer/orders/${created.id}/payments`, { body: { method: order.method } }, (status) => status < 300 || status === 409);
  const paymentId = payment?.id ?? (await as(email, "GET", `/api/customer/orders/${created.id}/payments`)).find((candidate) => candidate.status === "PENDING")?.id;
  if (!paymentId || order.outcome === "PENDING") return;
  if (order.outcome === "CANCELLED") {
    await as(ownerEmail, "POST", `/api/admin/payments/${paymentId}/fail`, { body: { reason: "Pago no completado" } });
    await as(email, "POST", `/api/customer/orders/${created.id}/cancel`, { body: {} });
    return;
  }
  await as(ownerEmail, "POST", `/api/admin/payments/${paymentId}/confirm`, { body: {} });
  await as(ownerEmail, "POST", `/api/admin/orders/${created.id}/fulfill`, { body: {} });
}

async function runPos(order, customer, ownerEmail, sessionId) {
  const sale = await as(ownerEmail, "POST", "/api/admin/pos/sales", { body: { clientOperationId: order.key, cashSessionId: sessionId, customerId: customer?.id ?? null, paymentMethod: order.method, items: order.items } });
  order.orderId = sale.orderId;
  if (order.method !== "CASH" && sale.paymentStatus === "PENDING") await as(ownerEmail, "POST", `/api/admin/pos/sales/payments/${sale.paymentId}/confirm`, { body: {} });
}

async function openSession(ownerEmail, pointId) {
  const opened = await http("POST", "/api/admin/cash-sessions/open", { token: await login(ownerEmail), body: { pointOfSaleId: pointId, openingAmount: 300 } });
  if (opened.status < 300) return opened.data;
  return as(ownerEmail, "GET", `/api/admin/cash-sessions/open/${pointId}`);
}

// ------------------------------------------------------------------ fechas (única escritura SQL)

async function withDateTx(client, work) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL session_replication_role = replica"); // sin triggers de sync ni versiones
    await work();
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}

async function rewriteDates(client, orders, sessions, restockWarehouses, day) {
  const rows = orders.filter((order) => order.orderId);
  if (!rows.length && !sessions.length && !restockWarehouses.length) return;
  await withDateTx(client, async () => {
    if (rows.length) {
      const values = JSON.stringify(rows.map((order) => ({ id: order.orderId, c: order.createdAt, p: order.paidAt, f: order.fulfilledAt, x: order.cancelledAt })));
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
      await client.query("update cash_sessions set opened_at = $2, closed_at = case when closed_at is not null then $3::timestamptz end, created_at = $2, updated_at = $3 where id = $1",
        [session, localTime(day, 9).toISOString(), localTime(day, 21).toISOString()]);
      await client.query("update cash_movements set created_at = $2 where cash_session_id = $1", [session, localTime(day, 21).toISOString()]);
    }
    if (restockWarehouses.length) {
      await client.query("update inventory_movements set created_at = $3 where reference_type = 'SEED_RESTOCK' and created_at >= $2::timestamptz and warehouse_id = any($1::uuid[])",
        [[...new Set(restockWarehouses)], RUN_STARTED_AT, localTime(day, 7).toISOString()]);
    }
  });
}

/** Stock inicial (y su fila de stock) un día antes del nuevo primer pedido. */
async function redateInitialStock(client, saved, start) {
  const warehouses = saved.stores.map((store) => store.warehouseId);
  const at = localTime(addDays(start, -1), 8).toISOString();
  await withDateTx(client, async () => {
    await client.query("update inventory_movements set created_at = $2 where reference_type = 'INITIAL_STOCK' and warehouse_id = any($1::uuid[])", [warehouses, at]);
    await client.query("update inventory_stocks set created_at = least(created_at, $2::timestamptz) where warehouse_id = any($1::uuid[])", [warehouses, at]);
  });
}

/**
 * Solana: re-fecha sus pedidos existentes al tramo 12-oct → ayer. Cada pedido (o cada sesión de caja con
 * todas sus ventas) se mueve con un desplazamiento propio aplicado a TODAS sus fechas relacionadas.
 * Cupos diarios = crecimiento semanal × fin de semana × promoción; las unidades de ticket más alto van más tarde.
 */
async function remapSolana(client, saved) {
  const end = addDays(TODAY, -1);
  const days = range(SOLANA_START, end);
  const orders = (await client.query(`select o.id, o.created_at, o.total::float8 as total, o.order_channel, o.cash_session_id, o.customer_id from orders o
    join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id where s.company_id = $1 order by o.created_at`, [saved.companyId])).rows;
  if (!orders.length) return 0;
  const rng = rngFor("solana-remap");
  const units = [];
  const bySession = new Map();
  for (const order of orders) {
    if (order.cash_session_id) { if (!bySession.has(order.cash_session_id)) { const unit = { orders: [], session: order.cash_session_id }; bySession.set(order.cash_session_id, unit); units.push(unit); } bySession.get(order.cash_session_id).orders.push(order); }
    else units.push({ orders: [order], session: null });
  }
  for (const unit of units) unit.score = (unit.orders.reduce((sum, order) => sum + order.total, 0) / unit.orders.length) * Math.exp(1.0 * normal(rng)); // ticket creciente, con dispersión
  units.sort((a, b) => a.score - b.score);
  const weights = days.map((day) => solanaShape(day));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const quotas = weights.map((weight) => (weight / totalWeight) * orders.length);
  const moves = []; const sessionMoves = [];
  let dayIndex = 0; let filled = 0;
  for (const unit of units) {
    while (dayIndex < days.length - 1 && filled >= quotas[dayIndex]) { filled -= quotas[dayIndex]; dayIndex += 1; }
    const day = days[dayIndex];
    if (unit.session) {
      const step = Math.max(1, Math.floor(600 / unit.orders.length));
      unit.orders.forEach((order, index) => moves.push({ id: order.id, at: localTime(day, 10, Math.min(599, index * step + Math.floor(rng() * step))).toISOString() }));
      sessionMoves.push({ id: unit.session, opened: localTime(day, 9).toISOString(), closed: localTime(day, 21).toISOString() });
    } else {
      moves.push({ id: unit.orders[0].id, at: localTime(day, localHour(rng, "ECOMMERCE"), Math.floor(rng() * 60)).toISOString() });
    }
    filled += unit.orders.length;
  }
  saved.solanaBase = orders.length / totalWeight; // pedidos/día por unidad de forma: continúa la misma curva
  await withDateTx(client, async () => {
    await client.query("create temp table solana_moves (id uuid primary key, delta interval) on commit drop");
    await client.query(`insert into solana_moves select (v->>'id')::uuid, (v->>'at')::timestamptz - o.created_at from jsonb_array_elements($1::jsonb) v join orders o on o.id = (v->>'id')::uuid`, [JSON.stringify(moves)]);
    const shift = (column, alias) => `${column} = ${alias}.${column} + m.delta`;
    await client.query(`update orders o set ${["created_at", "updated_at", "fulfilled_at", "cancelled_at", "client_created_at", "synced_at"].map((column) => shift(column, "o")).join(", ")} from solana_moves m where o.id = m.id`);
    await client.query(`update order_items i set ${shift("created_at", "i")} from solana_moves m where i.order_id = m.id`);
    await client.query(`update order_inventory_allocations a set ${shift("created_at", "a")} from solana_moves m where a.order_id = m.id`);
    await client.query(`update payments p set ${["created_at", "updated_at", "paid_at", "failed_at", "cancelled_at", "refunded_at"].map((column) => shift(column, "p")).join(", ")} from solana_moves m where p.order_id = m.id`);
    await client.query(`update payment_status_history h set ${shift("created_at", "h")} from payments p, solana_moves m where p.id = h.payment_id and p.order_id = m.id`);
    await client.query(`update inventory_movements im set ${shift("created_at", "im")} from solana_moves m where im.reference_id = m.id`);
    await client.query(`update shopping_carts sc set ${["created_at", "updated_at"].map((column) => shift(column, "sc")).join(", ")} from orders o, solana_moves m where o.id = m.id and sc.id = o.source_cart_id`);
    await client.query(`update shopping_cart_items ci set ${["created_at", "updated_at"].map((column) => shift(column, "ci")).join(", ")} from orders o, solana_moves m where o.id = m.id and ci.cart_id = o.source_cart_id`);
    for (const session of sessionMoves) {
      await client.query("update cash_sessions set opened_at = $2, closed_at = case when closed_at is not null then $3::timestamptz end, created_at = $2, updated_at = $3 where id = $1", [session.id, session.opened, session.closed]);
      await client.query("update cash_movements set created_at = $2 where cash_session_id = $1", [session.id, session.closed]);
    }
    // Reposiciones previas al nuevo inicio: la mañana del primer día.
    const warehouses = saved.stores.map((store) => store.warehouseId);
    await client.query(`update inventory_movements set created_at = $2::timestamptz + (row_number_seconds || ' seconds')::interval from (
        select id as mid, row_number() over (order by created_at) as row_number_seconds from inventory_movements where warehouse_id = any($1::uuid[]) and reference_type in ('SEED_RESTOCK', 'INITIAL_STOCK') and created_at < $3::timestamptz) r
      where id = r.mid`, [warehouses, localTime(SOLANA_START, 8).toISOString(), localTime(SOLANA_START, 0).toISOString()]);
  });
  return moves.length;
}

/** Alta coherente: empresa, sucursales, catálogo, stock y cuentas de la tienda ≤ primer pedido (Solana: ~12-oct). */
async function alignCreationDates(client, company, saved) {
  const first = (await client.query(`select min(o.created_at) as first from orders o join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id where s.company_id = $1`, [saved.companyId])).rows[0]?.first;
  if (!first) return;
  const exact = company.solana ? localTime(SOLANA_START, 7).toISOString() : null;
  const at = exact ?? new Date(first.getTime() - 7 * 86_400_000).toISOString();
  const set = exact ? "$2::timestamptz" : "least(created_at, $2::timestamptz)";
  await withDateTx(client, async () => {
    const id = saved.companyId;
    await client.query(`update companies set created_at = ${set} where id = $1`, [id, at]);
    await client.query(`update stores set created_at = ${set} where company_id = $1`, [id, at]);
    await client.query(`update warehouses w set created_at = ${set.replace("created_at", "w.created_at")} from stores s where s.id = w.store_id and s.company_id = $1`, [id, at]);
    await client.query(`update points_of_sale p set created_at = ${set.replace("created_at", "p.created_at")} from stores s where s.id = p.store_id and s.company_id = $1`, [id, at]);
    await client.query(`update categories set created_at = ${set} where company_id = $1`, [id, at]);
    await client.query(`update products set created_at = ${set} where company_id = $1`, [id, at]);
    await client.query(`update product_variants v set created_at = ${set.replace("created_at", "v.created_at")} from products p where p.id = v.product_id and p.company_id = $1`, [id, at]);
    await client.query(`update inventory_stocks i set created_at = ${set.replace("created_at", "i.created_at")} from warehouses w, stores s where w.id = i.warehouse_id and s.id = w.store_id and s.company_id = $1`, [id, at]);
    await client.query(`update app_users u set created_at = ${set.replace("created_at", "u.created_at")} from stores s where u.store_id = s.id and s.company_id = $1`, [id, at]);
    await client.query(`update app_users u set created_at = ${set.replace("created_at", "u.created_at")} from companies c where c.id = $1 and u.id = c.owner_user_id
      and not exists (select 1 from companies other where other.owner_user_id = u.id and other.id <> c.id and other.created_at < $2::timestamptz)`, [id, at]);
    await client.query(`update subscriptions s set created_at = ${set.replace("created_at", "s.created_at")}${exact ? ", current_period_start = $2::timestamptz" : ""} from companies c where c.id = $1 and s.owner_user_id = c.owner_user_id and s.company_id is null
      and not exists (select 1 from companies other where other.owner_user_id = c.owner_user_id and other.id <> c.id)`, [id, at]);
    if (company.solana) {
      // Clientes de Solana: alta entre el 12-oct y su primer pedido.
      await client.query(`update app_users u set created_at = greatest($1::timestamptz, coalesce(f.first_order - interval '2 hours', $1::timestamptz)), updated_at = greatest($1::timestamptz, coalesce(f.first_order - interval '2 hours', $1::timestamptz))
        from (select u2.id, (select min(o.created_at) from orders o where o.customer_id = u2.id) first_order from app_users u2 where u2.email like 'solana.%@clientes.seed.velora.local') f where u.id = f.id`, [at]);
    }
  });
}

// ------------------------------------------------------------------ verificación

async function verify(client) {
  const q = async (sql, params = []) => (await client.query(sql, params)).rows;
  const local = "(o.created_at at time zone 'America/La_Paz')";
  const byCompany = `join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id join companies c on c.id = s.company_id`;
  const real = "c.slug not like 'demo-%'";
  const report = {};
  report.totals = await q(`select c.slug, c.created_at::date created, count(*)::int orders, min(${local})::date first_day, max(${local})::date last_day,
    round(count(*) / greatest(1, (max(${local})::date - min(${local})::date + 1))::numeric, 2) per_day from orders o ${byCompany} where ${real} group by 1, 2 order by 3 desc`);
  report.emptyDays = await q(`select c.slug, count(*)::int empty_days from companies c cross join lateral generate_series(
      case when c.slug = 'velora' then date '2025-01-01' else greatest((select min(${local})::date from orders o ${byCompany.replace("join companies c on c.id = s.company_id", "")} where s.company_id = c.id), $1::date - 89) end, $1::date - 1, interval '1 day') d
    where ${real} and c.slug <> 'primer-paso' and not exists (select 1 from orders o join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id where s.company_id = c.id and ${local}::date = d::date) group by 1`, [TODAY]);
  report.negativeStock = (await q("select count(*)::int n from inventory_stocks where physical_quantity < 0 or committed_quantity < 0 or committed_quantity > physical_quantity"))[0].n;
  report.totalMismatch = (await q("select count(*)::int n from orders o where o.total <> (select coalesce(sum(i.subtotal), 0) from order_items i where i.order_id = o.id) - o.discount_amount"))[0].n;
  report.paymentIncoherence = (await q(`select count(*)::int n from orders o where (o.status = 'FULFILLED' and not exists (select 1 from payments p where p.order_id = o.id and p.status in ('PAID', 'REFUNDED')))
    or (o.status = 'CANCELLED' and exists (select 1 from payments p where p.order_id = o.id and p.status = 'PAID'))`))[0].n;
  report.crossCompany = (await q(`select count(*)::int n from order_items i join orders o on o.id = i.order_id join product_variants pv on pv.id = i.variant_id join products p on p.id = pv.product_id ${byCompany} where p.company_id <> c.id`))[0].n;
  report.createdAfterFirstOrder = await q(`select c.slug from companies c where ${real} and c.created_at > (select min(o.created_at) from orders o join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id where s.company_id = c.id)`);
  report.futureOrders = (await q("select count(*)::int n from orders where created_at > now() + interval '1 minute'"))[0].n;
  report.weekendRatio = await q(`select c.slug, round((count(*) filter (where extract(isodow from ${local}) >= 5) / 3.0) / nullif(count(*) filter (where extract(isodow from ${local}) < 5) / 4.0, 0), 2) fri_sun_vs_mon_thu from orders o ${byCompany} where ${real} group by 1 order by 1`);
  report.pareto = await q(`with sales as (select p.company_id, p.id, sum(i.subtotal) amount from order_items i join product_variants pv on pv.id = i.variant_id join products p on p.id = pv.product_id join orders o on o.id = i.order_id where o.status <> 'CANCELLED' group by 1, 2),
    ranked as (select company_id, amount, row_number() over (partition by company_id order by amount desc) rn, count(*) over (partition by company_id) n, sum(amount) over (partition by company_id) total from sales)
    select c.slug, round(100 * sum(amount) filter (where rn <= ceil(n * 0.2)) / max(total), 1) top20_share_pct from ranked r join companies c on c.id = r.company_id where ${real} group by 1 order by 1`);
  report.veloraMonthly = await q(`select to_char(date_trunc('month', ${local}), 'YYYY-MM') as month, count(*)::int orders from orders o ${byCompany} where c.slug = 'velora' group by 1 order by 1`);
  report.solanaWeekly = await q(`select to_char(date_trunc('week', ${local}), 'YYYY-MM-DD') week, count(*)::int orders, round(avg(o.total)::numeric, 1) avg_ticket,
    round(count(*)::numeric / count(distinct ${local}::date), 2) per_day from orders o ${byCompany} where c.slug = 'solana' group by 1 order by 1`);
  report.solanaRepeat = await q(`with x as (select o.customer_id, count(*) n from orders o ${byCompany} where c.slug = 'solana' and o.customer_id is not null and o.status <> 'CANCELLED' group by 1)
    select count(*)::int customers, count(*) filter (where n >= 2)::int repeat_customers, round(100.0 * count(*) filter (where n >= 2) / nullif(count(*), 0), 1) repeat_pct from x`);
  report.last14PerDay = await q(`select c.slug, round(count(*) / 14.0, 2) per_day from orders o ${byCompany} where ${local}::date between $1::date - 14 and $1::date - 1 and c.slug in ('solana', 'casa-montalvo', 'impetu-sport', 'andina-moda', 'velora') group by 1 order by 2 desc`, [TODAY]);
  report.segments = await q(`with x as (select o.customer_id, count(*) n from orders o ${byCompany} where ${real} and o.customer_id is not null group by 1)
    select case when n = 1 then '1 compra' when n <= 3 then '2-3' when n <= 9 then '4-9' else '10+' end as segment, count(*)::int customers from x group by 1 order by 1`);
  return report;
}

// ------------------------------------------------------------------ main

async function main() {
  const companies = COMPANIES.filter((company) => !ONLY || company.key === ONLY);
  if (!companies.length) throw new Error(`--only ${ONLY}: tienda desconocida.`);
  const client = new pg.Client({ connectionString: ENV.DATABASE_URL });
  await client.connect();
  try {
    if (VERIFY) { console.log(JSON.stringify(await verify(client), null, 2)); return; }
    const progress = loadProgress();
    const started = Date.now();
    const outOfTime = () => (Date.now() - started) / 60_000 > MAX_MINUTES;
    console.log(`Seed final ${SEED} · API ${API} · hasta ${UNTIL}${RESUME ? " · reanudando" : ""}${DRY_RUN ? " · simulación" : ""}`);

    const active = [];
    for (const company of companies) {
      progress.companies[company.key] ??= {};
      const saved = progress.companies[company.key];
      const ownerEmail = ownerEmailOf(company);
      await setupCompany(company, saved, ownerEmail, client);
      if (!DRY_RUN) await setupCustomers(company, saved, client);
      else if (!saved.customers) saved.customers = (oldState(company)?.customers ?? []).filter((customer) => customer.id);
      active.push({ company, saved, ownerEmail, ledger: new Map() });
      if (!DRY_RUN) saveProgress(progress);
      console.log(`  ✔ ${company.key}: ${saved.stores.length} sucursales, ${saved.variants.length} variantes, ${saved.customers.length} clientes · ritmo ${saved.anchor.perDay.toFixed(2)}/día al ${saved.lastDay}`);
    }

    // Pasos únicos de fechas (solo columnas de fecha).
    for (const entry of active) {
      const { company, saved } = entry;
      if (company.solana && saved.remapped !== SOLANA_REMAP_VERSION) {
        if (DRY_RUN) { saved.solanaBase ??= 1; continue; }
        const moved = await remapSolana(client, saved);
        saved.remapped = SOLANA_REMAP_VERSION; saved.lastDay ??= addDays(TODAY, -1); if (saved.lastDay < addDays(TODAY, -1) && !saved.forwardDone) saved.lastDay = addDays(TODAY, -1); saveProgress(progress);
        console.log(`  ✔ solana: ${moved} pedidos re-fechados al tramo ${SOLANA_START} → ${saved.lastDay} (base ${saved.solanaBase.toFixed(2)}/día)`);
      }
      if (company.redateInitialStock && company.backfill && !saved.stockRedated && !DRY_RUN) {
        await redateInitialStock(client, saved, company.backfill.from); saved.stockRedated = true; saveProgress(progress);
      }
    }

    let created = 0;
    const runOrders = async (entry, orders, day) => {
      if (!orders.length) return [];
      const restocked = await ensureStock(entry.ownerEmail, orders, entry.ledger);
      const sessionByPoint = new Map();
      for (const order of orders.filter((candidate) => candidate.channel === "POS")) if (!sessionByPoint.has(order.pointId)) sessionByPoint.set(order.pointId, (await openSession(entry.ownerEmail, order.pointId)).id);
      const customers = new Map(entry.saved.customers.map((customer) => [customer.email, customer]));
      const errors = await pool(orders, CONCURRENCY, async (order) => {
        const customer = order.customerEmail ? customers.get(order.customerEmail) : null;
        if (order.channel === "POS") await runPos(order, customer, entry.ownerEmail, sessionByPoint.get(order.pointId));
        else await runEcommerce(order, customer, entry.ownerEmail, entry.saved.companyId, entry.company.city);
      });
      for (const [pointId, sessionId] of sessionByPoint) {
        const open = await as(entry.ownerEmail, "GET", `/api/admin/cash-sessions/open/${pointId}`, {}, (status) => status < 300 || status === 404);
        await as(entry.ownerEmail, "POST", `/api/admin/cash-sessions/${sessionId}/close`, { body: { countedCashAmount: Number(open?.expectedCashAmount ?? 300), closingNotes: "Cierre del día" } }, (status) => status < 300 || status === 409);
      }
      if (errors.length) console.log(`  ! ${entry.company.key} ${day}: ${errors.length} pedidos con error (primero: ${errors[0].message.slice(0, 160)})`);
      await rewriteDates(client, orders, [...sessionByPoint.values()], restocked, day);
      created += orders.filter((order) => order.orderId).length;
      return orders;
    };
    /** Ejecuta un día; si es hoy y no se pidió --until futuro, solo lo ya ocurrido y deja el resto pendiente. */
    const runDay = async (entry, day, plan) => {
      const key = `${entry.company.key}|${day}`;
      const orders = progress.pending[key] ?? plan();
      const horizon = UNTIL > day ? Infinity : Date.now() - 5 * 60_000;
      const due = orders.filter((order) => Date.parse(order.createdAt) <= horizon);
      const later = orders.filter((order) => Date.parse(order.createdAt) > horizon);
      if (DRY_RUN) return due.length;
      await runOrders(entry, due, day);
      if (later.length) progress.pending[key] = later; else delete progress.pending[key];
      return due.length;
    };

    // 1) Retroceso (antes de lo existente): VÉLORA, Casa Montalvo, Ímpetu Sport.
    for (const entry of active.filter((candidate) => candidate.company.backfill)) {
      const { company, saved } = entry;
      let total = 0;
      for (const day of range(company.backfill.from, company.backfill.to)) {
        if (saved.backfillDone && day <= saved.backfillDone) continue;
        if (outOfTime()) break;
        total += await runDay(entry, day, () => planDay(company, saved, day));
        if (!DRY_RUN) { saved.backfillDone = day; saveProgress(progress); }
      }
      console.log(`  ${company.key}: retroceso ${company.backfill.from} → ${company.backfill.to} · ${total} pedidos`);
    }

    // 1b) Completar meses originales escasos (solo pedidos nuevos).
    for (const entry of active.filter((candidate) => candidate.company.topUp && !candidate.saved.topUpDone)) {
      const { company, saved } = entry; const { from, to, target } = company.topUp;
      const existing = Number((await client.query(`select count(*)::int n from orders o join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id
        where s.company_id = $1 and (o.created_at at time zone 'America/La_Paz')::date between $2::date and $3::date`, [saved.companyId, from, to])).rows[0].n);
      const days = range(from, to); const weights = days.map((day) => weekday(day) * paydayFactor(day) * specialFactor(day));
      const totalWeight = weights.reduce((sum, value) => sum + value, 0);
      let added = 0; let carry = 0;
      for (const [index, day] of days.entries()) {
        carry += (Math.max(0, target - existing) * weights[index]) / totalWeight;
        const count = Math.floor(carry); carry -= count;
        if (!count) continue;
        const orders = planDay(company, saved, day, count, "topup");
        if (!DRY_RUN) await runOrders(entry, orders, day);
        added += orders.length;
      }
      if (!DRY_RUN) { saved.topUpDone = true; saveProgress(progress); }
      console.log(`  ${company.key}: ${from} → ${to} completado con ${added} pedidos nuevos (había ${existing})`);
    }

    // 2) Continuación hasta UNTIL (día a día, todas las tiendas).
    const pendingDays = Object.keys(progress.pending).map((key) => key.split("|")[1]);
    const start = [...pendingDays, ...active.map((entry) => addDays(entry.saved.forwardDone ?? entry.saved.lastDay, 1))].reduce((min, day) => (day < min ? day : min), UNTIL);
    const forwardTotals = new Map();
    for (const day of range(start, UNTIL)) {
      if (outOfTime()) break;
      for (const entry of active) {
        const done = entry.saved.forwardDone ?? entry.saved.lastDay;
        const key = `${entry.company.key}|${day}`;
        if (day <= done && !progress.pending[key]) continue;
        const count = await runDay(entry, day, () => planDay(entry.company, entry.saved, day));
        forwardTotals.set(entry.company.key, (forwardTotals.get(entry.company.key) ?? 0) + count);
        if (!DRY_RUN && day > done) entry.saved.forwardDone = day;
      }
      if (!DRY_RUN) saveProgress(progress);
    }
    for (const [key, total] of forwardTotals) console.log(`  ${key}: continuación hasta ${UNTIL} · ${total} pedidos`);

    // 3) Huecos: ≥ 1 pedido por día (VÉLORA desde 2025-01-01; las demás, últimos 90 días; FREE excluida).
    if (!DRY_RUN && !outOfTime()) {
      let filled = 0;
      for (const entry of active.filter((candidate) => !candidate.company.free)) {
        const counts = new Set((await client.query(`select to_char(o.created_at at time zone 'America/La_Paz', 'YYYY-MM-DD') as day from orders o
          join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id where s.company_id = $1 group by 1`, [entry.saved.companyId])).rows.map((row) => row.day));
        const firstDay = [...counts].sort()[0];
        const from = entry.company.continuousFrom ?? (addDays(UNTIL, -89) > firstDay ? addDays(UNTIL, -89) : firstDay);
        for (const day of range(from, addDays(UNTIL >= TODAY ? TODAY : UNTIL, -1))) {
          if (counts.has(day)) continue;
          const rng = rngFor("gapsize", entry.company.key, day);
          const orders = planDay(entry.company, entry.saved, day, 1 + (rng() < 0.4 ? 1 : 0));
          await runOrders(entry, orders, day); filled += orders.length;
        }
      }
      console.log(`  huecos rellenados: ${filled} pedidos`);
      for (const entry of active) await alignCreationDates(client, entry.company, entry.saved);
      saveProgress(progress);
    }

    if (DRY_RUN) { console.log("Simulación terminada: no se escribió nada."); return; }
    const pendingCount = Object.values(progress.pending).reduce((sum, list) => sum + list.length, 0);
    console.log(`Listo: ${created} pedidos nuevos en ${Math.round((Date.now() - started) / 60_000)} min.${pendingCount ? ` ${pendingCount} pedidos de hoy quedan pendientes (aún no es su hora): --resume más tarde.` : ""}${outOfTime() ? " Tiempo agotado: continúe con --resume." : ""}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error(`Seed interrumpido: ${error instanceof Error ? error.stack : String(error)}`); process.exitCode = 1; });

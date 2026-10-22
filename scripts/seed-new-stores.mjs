#!/usr/bin/env node
// Fase 4B · Tres tiendas nuevas de la plataforma Trama por el FLUJO HTTP REAL (sin SQL):
// onboarding y plan, segunda empresa del mismo dueño, marca (paleta, segmento, logo y banner
// según el nivel del plan), sucursales, encargados, categorías, productos, variantes, imagen
// principal (ilustración vectorial → PNG) y movimientos de ENTRADA de inventario.
//
//   Casa Montalvo e Ímpetu Sport → Rodrigo Salvatierra (MAX) · Solana → Daniela Ferrufino (PLUS)
//
// Idempotente y reanudable: consulta lo que ya existe antes de crear y guarda el progreso en
// scripts/.seed-progress/new-stores.json (ignorado por git).
//
// Uso (con el backend corriendo):
//   node scripts/seed-new-stores.mjs                 # todo
//   node scripts/seed-new-stores.mjs --only solana   # una tienda
//   node scripts/seed-new-stores.mjs --resume        # continúa desde el progreso guardado
//   node scripts/seed-new-stores.mjs --verify        # solo verificación
//
// Contraseñas (nunca se imprimen): VELORA_TRAMA_OWNER_PASSWORD, VELORA_TRAMA_MANAGER_PASSWORD y
// VELORA_TRAMA_CUSTOMER_PASSWORD en el entorno o en el .env local.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { bannerSvg, garmentSvg, logoSvg } from "./lib/garment-art.mjs";
import { CUSTOMER, OWNERS, STORES, productsOf, rng, slugify } from "./lib/new-stores-data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sharp = createRequire(join(ROOT, "apps/front/package.json"))("sharp");

const fileEnv = (() => {
  const file = join(ROOT, ".env");
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
})();
const env = (name) => process.env[name]?.trim() || fileEnv[name] || "";
const API = (env("VELORA_SEED_API_BASE") || "http://127.0.0.1:8080").replace(/\/$/, "");
const PASSWORDS = { owner: env("VELORA_TRAMA_OWNER_PASSWORD"), manager: env("VELORA_TRAMA_MANAGER_PASSWORD"), customer: env("VELORA_TRAMA_CUSTOMER_PASSWORD") };
const DEMO_CARD = { cardNumber: "4242 4242 4242 4242", holderName: "Demo Trama" };

const args = process.argv.slice(2);
const ONLY = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const RESUME = args.includes("--resume");
const VERIFY_ONLY = args.includes("--verify");
const CONCURRENCY = 6;

const PROGRESS_FILE = join(ROOT, "scripts", ".seed-progress", "new-stores.json");
const progress = RESUME && existsSync(PROGRESS_FILE) ? JSON.parse(readFileSync(PROGRESS_FILE, "utf8")) : { stores: {} };
const save = () => { mkdirSync(dirname(PROGRESS_FILE), { recursive: true }); writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2)); };

// ------------------------------------------------------------------ HTTP

const tokens = new Map();
async function http(method, path, { token, body, form } = {}, attempt = 0) {
  let response;
  try {
    response = await fetch(`${API}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch (error) {
    if (attempt < 5) { await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1))); return http(method, path, { token, body, form }, attempt + 1); }
    throw error;
  }
  const text = await response.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if ((response.status === 429 || response.status >= 502) && attempt < 5) { await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1))); return http(method, path, { token, body, form }, attempt + 1); }
  return { status: response.status, data };
}
const describe = (result) => (typeof result.data === "string" ? result.data.slice(0, 200) : JSON.stringify(result.data).slice(0, 300));
async function must(method, path, options = {}) {
  const result = await http(method, path, options);
  if (result.status >= 300) throw new Error(`${method} ${path} → ${result.status} ${describe(result)}`);
  return result.data;
}
async function login(email, password) {
  if (tokens.has(email)) return tokens.get(email);
  const data = await must("POST", "/api/auth/login", { body: { email, password } });
  tokens.set(email, data.accessToken);
  return data.accessToken;
}
async function as(email, method, path, options = {}) {
  const result = await http(method, path, { ...options, token: await login(email, PASSWORDS.owner) });
  if (result.status === 401) { tokens.delete(email); return as(email, method, path, options); }
  if (result.status >= 300) throw new Error(`${method} ${path} → ${result.status} ${describe(result)}`);
  return result.data;
}
async function pool(items, size, worker) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (index < items.length) { const item = items[index++]; await worker(item); }
  }));
}
async function upload(email, path, png, name, fields = {}) {
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), name);
  for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
  return as(email, "POST", path, { form });
}
const png = (svg) => sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();

// ------------------------------------------------------------------ alta de cada tienda

/** Dueño: inicia sesión si existe; si no, onboarding real con su primera tienda y el plan (tarjeta DEMO). */
async function ensureCompany(store) {
  const owner = OWNERS[store.owner];
  const first = store.branches[0];
  const provision = { name: store.name, slug: store.slug, tagline: store.tagline, accentColor: store.palette.accent, storeName: first.name, city: first.city };
  const existing = await http("POST", "/api/auth/login", { body: { email: owner.email, password: PASSWORDS.owner } });
  if (existing.status !== 200) {
    const created = await must("POST", "/api/onboarding/store", { body: { owner: { firstName: owner.firstName, lastName: owner.lastName, email: owner.email, password: PASSWORDS.owner }, company: provision, planCode: owner.plan, card: DEMO_CARD } });
    tokens.set(owner.email, created.auth.accessToken);
    console.log(`  · onboarding de ${owner.firstName} ${owner.lastName} (${owner.plan}) con ${store.name}`);
    return created.company.id;
  }
  tokens.set(owner.email, existing.data.accessToken);
  const mine = await as(owner.email, "GET", "/api/admin/companies");
  const found = mine.find((company) => company.slug === store.slug);
  if (found) return found.id;
  // Segunda empresa del mismo dueño (así se demuestra el selector de empresa).
  const created = await as(owner.email, "POST", "/api/admin/companies", { body: provision });
  console.log(`  · nueva empresa ${store.name} para ${owner.firstName}`);
  return created.id;
}

async function brand(store, email, companyId, state) {
  if (state.branded) return;
  const { allowed } = await as(email, "GET", `/api/admin/companies/${companyId}/branding`);
  await as(email, "PATCH", `/api/admin/companies/${companyId}/branding`, { body: {
    displayName: store.name, segment: store.segment,
    palette: allowed.includes("fullPalette") ? store.palette : { accent: store.palette.accent },
    ...(allowed.includes("tagline") ? { tagline: store.tagline } : {}),
    ...(allowed.includes("contact") ? { contact: store.contact } : {}),
  } });
  await upload(email, `/api/admin/companies/${companyId}/branding/logo`, await png(logoSvg(store.logo, store.palette)), "logo.png");
  if (allowed.includes("banner")) await upload(email, `/api/admin/companies/${companyId}/branding/banner`, await png(bannerSvg(store.logo, store.palette)), "banner.png");
  state.branded = true;
  state.brandingAllowed = allowed;
  save();
}

async function branches(store, email, companyId, state) {
  let stores = await as(email, "GET", `/api/admin/stores?companyId=${companyId}`);
  for (const branch of store.branches.slice(1)) {
    if (!stores.some((candidate) => candidate.name === branch.name)) await as(email, "POST", "/api/admin/stores", { body: { companyId, code: branch.code, name: branch.name, address: branch.address } });
  }
  stores = await as(email, "GET", `/api/admin/stores?companyId=${companyId}`);
  const warehouses = await as(email, "GET", "/api/inventory/warehouses");
  const managers = await as(email, "GET", `/api/admin/users/managers?companyId=${companyId}`);
  state.branches = [];
  for (const branch of store.branches) {
    const record = stores.find((candidate) => candidate.name === branch.name);
    const warehouse = warehouses.find((candidate) => candidate.storeId === record.id && candidate.defaultWarehouse) ?? warehouses.find((candidate) => candidate.storeId === record.id);
    const managerEmail = `encargado.${store.slug}.${slugify(branch.name)}@seed.local`;
    if (!managers.some((manager) => manager.email === managerEmail)) {
      await as(email, "PUT", `/api/admin/stores/${record.id}/manager`, { body: { firstName: branch.manager[0], lastName: branch.manager[1], email: managerEmail, password: PASSWORDS.manager } });
    }
    state.branches.push({ name: branch.name, storeId: record.id, warehouseId: warehouse.id, managerEmail });
  }
  save();
}

async function catalog(store, email, companyId, state) {
  const products = productsOf(store);
  const categories = await as(email, "GET", `/api/catalog/manage/categories?companyId=${companyId}`);
  const categoryIds = {};
  for (const category of store.categories) {
    categoryIds[category.slug] = (categories.find((candidate) => candidate.slug === category.slug)
      ?? await as(email, "POST", "/api/catalog/manage/categories", { body: { companyId, name: category.name, slug: category.slug } })).id;
  }
  const existing = await as(email, "GET", `/api/catalog/manage/products?companyId=${companyId}`);
  let created = 0;
  await pool(products.map((product, index) => ({ product, index })), 3, async ({ product, index }) => {
    let record = existing.find((candidate) => candidate.slug === product.slug);
    if (!record) {
      record = await as(email, "POST", "/api/catalog/manage/products", { body: {
        companyId, categoryId: categoryIds[product.category], name: product.name, slug: product.slug, description: product.description,
        brand: store.name, composition: product.composition, careInstructions: product.careInstructions, status: "ACTIVE", tryOnEnabled: false,
      } });
      created += 1;
    }
    const detail = await as(email, "GET", `/api/catalog/manage/products/${record.id}?companyId=${companyId}`);
    for (const color of product.colors) {
      for (const size of product.sizes) {
        const sku = `${store.sku}-${String(index + 1).padStart(3, "0")}-${slugify(size).toUpperCase()}-${slugify(color).slice(0, 3).toUpperCase()}`;
        if (detail.variants?.some((variant) => variant.sku === sku)) continue;
        await as(email, "POST", `/api/catalog/manage/products/${record.id}/variants`, { body: { sku, size, color, colorHex: store.colors[color], price: product.price, currency: "BOB" } });
      }
    }
    if (!detail.images?.length) {
      const image = await png(garmentSvg(product.art, store.colors[product.colors[0]], store.palette));
      await upload(email, `/api/catalog/manage/products/${record.id}/assets`, image, `${product.slug}.png`, { purpose: "GALLERY", primary: "true", sortOrder: 0, altText: `${product.name} (ilustración)` });
    }
  });
  console.log(`  · catálogo: ${products.length} productos (${created} nuevos)`);
  state.catalog = true;
  save();
}

/**
 * Stock inicial por ENTRADA en el almacén principal de cada sucursal: 8 a 40 unidades por variante,
 * algunas con 1–3 (stock crítico) y 3 variantes sin stock en ninguna sucursal (agotadas).
 */
async function stock(store, email, companyId, state) {
  if (state.stocked) return;
  const products = await as(email, "GET", `/api/catalog/manage/products?companyId=${companyId}`);
  const variants = (await Promise.all(products.map((product) => as(email, "GET", `/api/catalog/manage/products/${product.id}?companyId=${companyId}`))))
    .flatMap((product) => product.variants.map((variant) => ({ ...variant, productSlug: product.slug }))).sort((a, b) => a.sku.localeCompare(b.sku));
  const soldOut = new Set(variants.filter((_, index) => index % 97 === 13).slice(0, 3).map((variant) => variant.id));
  const jobs = [];
  for (const branch of state.branches) {
    const current = await as(email, "GET", `/api/inventory/warehouses/${branch.warehouseId}/stock`);
    for (const [index, variant] of variants.entries()) {
      if (soldOut.has(variant.id) || current.some((row) => row.variantId === variant.id && row.physicalQuantity > 0)) continue;
      const random = rng(`${variant.sku}:${branch.name}`);
      const quantity = index % 29 === 7 ? 1 + Math.floor(random() * 3) : 8 + Math.floor(random() * 33);
      jobs.push({ warehouseId: branch.warehouseId, variantId: variant.id, quantity });
    }
  }
  await pool(jobs, CONCURRENCY, (job) => as(email, "POST", "/api/inventory/movements", { body: { ...job, movementType: "ENTRY", reason: "Stock inicial de la tienda", referenceType: "INITIAL_STOCK" } }));
  console.log(`  · inventario: ${jobs.length} entradas en ${state.branches.length} sucursales (${soldOut.size} variantes agotadas a propósito)`);
  state.stocked = true;
  state.soldOut = [...soldOut];
  save();
}

async function setupStore(store) {
  console.log(`\n${store.name} (${store.slug})`);
  const state = progress.stores[store.slug] ??= {};
  const email = OWNERS[store.owner].email;
  state.companyId = await ensureCompany(store);
  save();
  await brand(store, email, state.companyId, state);
  await branches(store, email, state.companyId, state);
  if (!state.catalog) await catalog(store, email, state.companyId, state);
  await stock(store, email, state.companyId, state);
}

async function ensureCustomer() {
  const result = await http("POST", "/api/auth/register", { body: { ...CUSTOMER, password: PASSWORDS.customer } });
  if (result.status < 300) console.log("\nCliente de pruebas creado.");
  else if (result.status === 409 || result.status === 400) console.log("\nCliente de pruebas ya existente.");
  else throw new Error(`Registro del cliente → ${result.status} ${describe(result)}`);
}

// ------------------------------------------------------------------ verificación

const results = [];
function check(label, ok, detail = "") {
  results.push({ label, ok: Boolean(ok) });
  console.log(`  ${ok ? "✔" : "✘"} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function verify(stores) {
  console.log("\nVerificación");
  const directory = await must("GET", "/api/companies/directory");
  for (const store of stores) {
    const email = OWNERS[store.owner].email;
    const companyId = (await as(email, "GET", "/api/admin/companies")).find((company) => company.slug === store.slug)?.id;
    if (!companyId) { check(`${store.name}: existe`, false); continue; }
    const products = await as(email, "GET", `/api/catalog/manage/products?companyId=${companyId}`);
    const details = await Promise.all(products.map((product) => as(email, "GET", `/api/catalog/manage/products/${product.id}?companyId=${companyId}`)));
    const variants = details.reduce((sum, product) => sum + product.variants.length, 0);
    const withImage = details.filter((product) => product.images?.length > 0).length;
    check(`${store.name}: 24 a 28 productos con variantes e imagen principal`, products.length >= 24 && products.length <= 28 && withImage === products.length, `${products.length} productos · ${variants} variantes · ${withImage} imágenes`);
    const imageUrl = details[0]?.images?.[0]?.imageUrl;
    const image = imageUrl ? await fetch(imageUrl) : null;
    check(`${store.name}: imágenes accesibles por URL`, image?.status === 200 && (image.headers.get("content-type") ?? "").startsWith("image/"), image ? `${image.status} ${image.headers.get("content-type")}` : "sin URL");

    const branchesList = await as(email, "GET", `/api/admin/stores?companyId=${companyId}`);
    const warehouses = (await as(email, "GET", "/api/inventory/warehouses")).filter((warehouse) => branchesList.some((branch) => branch.id === warehouse.storeId));
    const rows = (await Promise.all(warehouses.map((warehouse) => as(email, "GET", `/api/inventory/warehouses/${warehouse.id}/stock`)))).flat();
    const negative = rows.filter((row) => row.physicalQuantity < 0 || row.availableQuantity < 0).length;
    const low = rows.filter((row) => row.availableQuantity > 0 && row.availableQuantity <= 3).length;
    const stocked = new Set(rows.filter((row) => row.physicalQuantity > 0).map((row) => row.variantId));
    const soldOut = details.flatMap((product) => product.variants).filter((variant) => !stocked.has(variant.id)).length;
    check(`${store.name}: stock nunca negativo, con críticos y agotados`, negative === 0 && low > 0 && soldOut >= 2 && soldOut <= 3, `${branchesList.length} sucursales · ${rows.length} filas de stock · ${low} críticas (≤3) · ${soldOut} variantes agotadas`);

    const managers = await as(email, "GET", `/api/admin/users/managers?companyId=${companyId}`);
    check(`${store.name}: un encargado por sucursal`, branchesList.every((branch) => managers.some((manager) => manager.storeId === branch.id && manager.status === "ACTIVE")), `${managers.length} encargados`);
    const entry = directory.find((candidate) => candidate.slug === store.slug);
    check(`${store.name}: en el directorio con su marca`, entry && entry.segment === store.segment && entry.logoUrl && entry.palette.accent.toUpperCase() === store.palette.accent.toUpperCase(),
      entry ? `${entry.segment} · logo ${entry.logoUrl ? "sí" : "no"} · banner ${entry.bannerUrl ? "sí" : "no (plan)"} · tagline ${entry.tagline ? "sí" : "no (plan)"}` : "no aparece");
  }

  console.log("\nLímites de plan y aislamiento");
  // Con --only puede que un dueño aún no exista: esas verificaciones se omiten.
  const exists = async (owner) => (await http("POST", "/api/auth/login", { body: { email: owner.email, password: PASSWORDS.owner } })).status === 200;
  const [hasRodrigo, hasDaniela] = [await exists(OWNERS.rodrigo), await exists(OWNERS.daniela)];
  const montalvo = hasRodrigo ? (await as(OWNERS.rodrigo.email, "GET", "/api/admin/companies")).find((company) => company.slug === "casa-montalvo") : null;
  const solana = hasDaniela ? (await as(OWNERS.daniela.email, "GET", "/api/admin/companies")).find((company) => company.slug === "solana") : null;
  if (hasRodrigo) {
    const rodrigoCompanies = await as(OWNERS.rodrigo.email, "GET", "/api/admin/companies");
    check("Rodrigo (MAX) administra Casa Montalvo e Ímpetu Sport", ["casa-montalvo", "impetu-sport"].every((slug) => rodrigoCompanies.some((company) => company.slug === slug)), `${rodrigoCompanies.length} empresas`);
  }
  if (solana) {
    const fourth = await http("POST", "/api/admin/stores", { token: await login(OWNERS.daniela.email, PASSWORDS.owner), body: { companyId: solana.id, code: "SOL-X", name: "Sucursal extra" } });
    check("PLUS: Solana no puede abrir una 4.ª sucursal (límite del plan)", fourth.status === 402 || fourth.status === 403, `HTTP ${fourth.status} ${fourth.data?.code ?? ""}`);
  }
  if (montalvo && solana) {
    const cross = await http("GET", `/api/catalog/manage/products?companyId=${montalvo.id}`, { token: await login(OWNERS.daniela.email, PASSWORDS.owner) });
    const crossBack = await http("GET", `/api/admin/stores?companyId=${solana.id}`, { token: await login(OWNERS.rodrigo.email, PASSWORDS.owner) });
    check("aislamiento: cada dueño solo ve sus empresas", [403, 404].includes(cross.status) && [403, 404].includes(crossBack.status), `Daniela→Montalvo ${cross.status} · Rodrigo→Solana ${crossBack.status}`);
  }
  const customer = await http("POST", "/api/auth/login", { body: { email: CUSTOMER.email, password: PASSWORDS.customer } });
  check("cliente de pruebas puede iniciar sesión", customer.status === 200 && customer.data?.user?.role === "CUSTOMER");
}

/**
 * --repair-art dress,swimsuit: regenera la ilustración de esas prendas y REEMPLAZA los bytes del PNG ya
 * subido (misma clave de almacenamiento local, sin tocar la BD). No hay endpoint para borrar imágenes,
 * y subir otra dejaría la defectuosa como secundaria en la galería. Solo con almacenamiento LOCAL.
 */
async function repairArt(stores, arts) {
  if ((env("VELORA_ASSET_STORAGE_PROVIDER") || "LOCAL") !== "LOCAL") throw new Error("--repair-art solo funciona con VELORA_ASSET_STORAGE_PROVIDER=LOCAL.");
  const dir = join(ROOT, "apps", "back", (env("VELORA_ASSET_LOCAL_DIR") || "./storage/assets").replace(/^\.\//, ""));
  let repaired = 0;
  for (const store of stores) {
    const email = OWNERS[store.owner].email;
    const companyId = (await as(email, "GET", "/api/admin/companies")).find((company) => company.slug === store.slug)?.id;
    if (!companyId) continue;
    const listed = await as(email, "GET", `/api/catalog/manage/products?companyId=${companyId}`);
    for (const product of productsOf(store).filter((candidate) => arts.includes(candidate.art))) {
      const record = listed.find((candidate) => candidate.slug === product.slug);
      if (!record) continue;
      const detail = await as(email, "GET", `/api/catalog/manage/products/${record.id}?companyId=${companyId}`);
      const key = (detail.images.find((image) => image.primary) ?? detail.images[0])?.imageUrl?.split("/").pop();
      if (!key || !/^[0-9a-f-]{36}\.png$/i.test(key) || !existsSync(join(dir, key))) continue;
      writeFileSync(join(dir, key), await png(garmentSvg(product.art, store.colors[product.colors[0]], store.palette)));
      repaired += 1;
    }
  }
  console.log(`Ilustraciones reparadas: ${repaired}`);
}

async function main() {
  for (const [name, value] of Object.entries(PASSWORDS)) {
    if (!value) throw new Error(`Falta VELORA_TRAMA_${name.toUpperCase()}_PASSWORD en el entorno o en el .env local.`);
  }
  const stores = STORES.filter((store) => !ONLY || store.slug === ONLY);
  if (!stores.length) throw new Error(`Tienda desconocida: ${ONLY}`);
  console.log(`Tiendas nuevas de Trama contra ${API}`);
  const started = Date.now();
  if (args.includes("--repair-art")) {
    await repairArt(stores, args[args.indexOf("--repair-art") + 1].split(","));
    return;
  }
  if (!VERIFY_ONLY) {
    // Primero las empresas del dueño MAX (la segunda empresa necesita la sesión del dueño).
    for (const store of stores) await setupStore(store);
    await ensureCustomer();
  }
  await verify(stores);
  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} verificaciones correctas en ${Math.round((Date.now() - started) / 1000)} s.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(`\n✘ ${error.message}`);
  process.exit(1);
});

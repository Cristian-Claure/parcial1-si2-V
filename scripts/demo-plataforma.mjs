#!/usr/bin/env node
// Demo reproducible de la Fase 4B (plataforma Trama), vía HTTP:
//   1. directorio público (solo campos de marca, sin demos, búsqueda y segmento);
//   2. las tres tiendas nuevas con su marca (paleta, logo, banner según plan) y VÉLORA como tienda más;
//   3. el cliente de pruebas comprando en una tienda elegida;
//   4. el dueño con 2 empresas (MAX) viendo ambas; la dueña de 1 empresa (PLUS) con sus límites;
//   5. un encargado fijado a su sucursal y la plataforma (PLATFORM_ADMIN) viendo todas las tiendas;
//   6. la entrada web neutral (index.html y manifest con la marca Trama, sin VÉLORA).
// Sale con código 1 si algo falla.
//
// Credenciales (nunca se imprimen): VELORA_TRAMA_{OWNER,MANAGER,CUSTOMER}_PASSWORD y
// BOOTSTRAP_PLATFORM_ADMIN_{EMAIL,PASSWORD} en el entorno o en el .env local.
//
//   node scripts/demo-plataforma.mjs

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const fileEnv = (() => {
  const file = join(ROOT, ".env");
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
})();
const env = (name) => process.env[name]?.trim() || fileEnv[name] || "";
const API = (env("VELORA_DEMO_API_BASE") || "http://127.0.0.1:8080").replace(/\/$/, "");
const results = [];

function check(label, ok, detail = "") {
  results.push({ label, ok: Boolean(ok) });
  console.log(`  ${ok ? "✔" : "✘"} ${label}${detail ? ` — ${detail}` : ""}`);
}
async function api(method, path, { token, body } = {}) {
  const response = await fetch(`${API}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data, text };
}
async function login(email, password) {
  const result = await api("POST", "/api/auth/login", { body: { email, password } });
  if (result.status !== 200) throw new Error(`No se pudo iniciar sesión con ${email.split("@")[0].replace(/\..*/, "")}… (HTTP ${result.status}).`);
  return { token: result.data.accessToken, user: result.data.user };
}

const STORES = {
  "casa-montalvo": { name: "Casa Montalvo", segment: "HOMBRE", accent: "#8C2F39", banner: true },
  "impetu-sport": { name: "Ímpetu Sport", segment: "DEPORTIVA", accent: "#C2410C", banner: true },
  solana: { name: "Solana", segment: "MUJER", accent: "#B8432F", banner: false },
};

async function main() {
  const passwords = { owner: env("VELORA_TRAMA_OWNER_PASSWORD"), manager: env("VELORA_TRAMA_MANAGER_PASSWORD"), customer: env("VELORA_TRAMA_CUSTOMER_PASSWORD") };
  if (Object.values(passwords).some((value) => !value)) throw new Error("Faltan VELORA_TRAMA_*_PASSWORD en el entorno o en el .env local.");
  console.log(`Demo plataforma Trama contra ${API}\n`);

  console.log("1) Directorio público /tiendas");
  const directory = await api("GET", "/api/companies/directory");
  const slugs = directory.data.map((entry) => entry.slug);
  check("lista las tiendas nuevas y VÉLORA como una tienda más", [...Object.keys(STORES), "velora"].every((slug) => slugs.includes(slug)), `${slugs.length} tiendas`);
  check("no incluye tiendas de demos automáticas (demo-*)", !slugs.some((slug) => slug.startsWith("demo-")));
  check("solo expone campos de marca", directory.data.every((entry) => Object.keys(entry).sort().join() === "bannerUrl,logoUrl,name,palette,segment,slug,tagline"));
  const men = await api("GET", "/api/companies/directory?segment=HOMBRE");
  const search = await api("GET", "/api/companies/directory?q=lino");
  check("filtro por segmento y búsqueda", men.data.some((entry) => entry.slug === "casa-montalvo") && !men.data.some((entry) => entry.slug === "solana") && search.data.some((entry) => entry.slug === "solana"),
    `HOMBRE → ${men.data.map((entry) => entry.name).join(", ")} · "lino" → ${search.data.map((entry) => entry.name).join(", ")}`);

  console.log("\n2) Tiendas con su marca");
  for (const [slug, expected] of Object.entries(STORES)) {
    const brand = (await api("GET", `/api/companies/by-slug/${slug}`)).data;
    const logo = brand?.logoUrl ? await fetch(brand.logoUrl) : null;
    const products = (await api("GET", `/api/catalog/products?companyId=${brand?.companyId}`)).data ?? [];
    const image = products[0]?.images?.[0]?.imageUrl ? await fetch(products[0].images[0].imageUrl) : null;
    check(`${expected.name}: paleta, logo${expected.banner ? ", banner" : ""} y catálogo con imágenes`,
      brand?.palette.accent.toUpperCase() === expected.accent && logo?.status === 200 && Boolean(brand.bannerUrl) === expected.banner && products.length >= 24 && image?.status === 200,
      `/t/${slug} · ${products.length} productos · banner ${brand?.bannerUrl ? "sí" : "no (plan PLUS)"}`);
  }
  const velora = (await api("GET", "/api/companies/by-slug/velora")).data;
  check("VÉLORA sigue en /t/velora con su marca editorial", velora?.isPlatformBrand === true && velora.slug === "velora");

  console.log("\n3) Cliente");
  const customer = await login("cliente.demo@trama.seed.local", passwords.customer);
  const solana = (await api("GET", "/api/companies/by-slug/solana")).data;
  const product = (await api("GET", `/api/catalog/products?companyId=${solana.companyId}`)).data.find((candidate) => candidate.variants.some((variant) => variant.active !== false));
  await api("DELETE", `/api/customer/cart?companyId=${solana.companyId}`, { token: customer.token });
  const added = await api("POST", "/api/customer/cart/items", { token: customer.token, body: { companyId: solana.companyId, variantId: product.variants[0].id, quantity: 1 } });
  const cart = await api("GET", `/api/customer/cart?companyId=${solana.companyId}`, { token: customer.token });
  check("el cliente elige Solana y agrega una prenda a su bolsa", customer.user.role === "CUSTOMER" && added.status < 300 && JSON.stringify(cart.data).includes(product.variants[0].id), product.name);
  await api("DELETE", `/api/customer/cart?companyId=${solana.companyId}`, { token: customer.token });

  console.log("\n4) Dueños");
  const rodrigo = await login("rodrigo.salvatierra@trama.seed.local", passwords.owner);
  const rodrigoCompanies = (await api("GET", "/api/admin/companies", { token: rodrigo.token })).data;
  const rodrigoPlan = (await api("GET", "/api/admin/plan", { token: rodrigo.token })).data;
  check("Rodrigo (MAX) ve sus 2 empresas → irá a /elegir-empresa", rodrigoCompanies.length === 2 && ["casa-montalvo", "impetu-sport"].every((slug) => rodrigoCompanies.some((company) => company.slug === slug)) && rodrigoPlan.effectivePlan.code === "MAX",
    rodrigoCompanies.map((company) => company.brand?.name ?? company.name).join(" y "));
  for (const company of rodrigoCompanies) {
    const stores = (await api("GET", `/api/admin/stores?companyId=${company.id}`, { token: rodrigo.token })).data;
    const ml = await api("GET", `/api/admin/ml/overview?companyId=${company.id}`, { token: rodrigo.token });
    check(`Rodrigo opera ${company.brand?.name ?? company.name}`, stores.length >= 2 && ml.status === 200, `${stores.length} sucursales · Inteligencia (ML) disponible`);
  }
  const daniela = await login("daniela.ferrufino@trama.seed.local", passwords.owner);
  const danielaCompanies = (await api("GET", "/api/admin/companies", { token: daniela.token })).data;
  const fourth = await api("POST", "/api/admin/stores", { token: daniela.token, body: { companyId: danielaCompanies[0].id, code: `X-${randomUUID().slice(0, 4)}`, name: "Sucursal extra" } });
  const mlPlus = await api("GET", `/api/admin/ml/overview?companyId=${danielaCompanies[0].id}`, { token: daniela.token });
  const builder = await api("POST", "/api/admin/reports/query", { token: daniela.token, body: { companyId: danielaCompanies[0].id, dimensions: ["CATEGORY"], measures: ["UNITS"] } });
  check("Daniela (PLUS, 1 empresa) → /admin; límites del plan aplicados", danielaCompanies.length === 1 && fourth.status === 402 && mlPlus.status === 403 && builder.status === 200,
    `4.ª sucursal ${fourth.status} ${fourth.data?.code ?? ""} · ML ${mlPlus.status} · constructor ${builder.status}`);
  const cross = await api("GET", `/api/admin/stores?companyId=${rodrigoCompanies[0].id}`, { token: daniela.token });
  check("aislamiento entre propietarios", cross.status === 404, `Daniela → ${rodrigoCompanies[0].brand?.name}: ${cross.status}`);

  console.log("\n5) Encargado y plataforma");
  const manager = await login("encargado.casa-montalvo.calacoto@seed.local", passwords.manager);
  const managerCompany = (await api("GET", "/api/manager/company", { token: manager.token })).data;
  check("el encargado de Calacoto opera Casa Montalvo → /sucursal", manager.user.role === "STORE_MANAGER" && managerCompany?.slug === "casa-montalvo", `${manager.user.storeName}`);
  if (env("BOOTSTRAP_PLATFORM_ADMIN_EMAIL") && env("BOOTSTRAP_PLATFORM_ADMIN_PASSWORD")) {
    const platform = await login(env("BOOTSTRAP_PLATFORM_ADMIN_EMAIL"), env("BOOTSTRAP_PLATFORM_ADMIN_PASSWORD"));
    const companies = (await api("GET", "/api/platform/companies", { token: platform.token })).data ?? [];
    check("PLATFORM_ADMIN ve las tiendas nuevas en /plataforma", platform.user.role === "PLATFORM_ADMIN" && Object.keys(STORES).every((slug) => JSON.stringify(companies).includes(slug)), `${companies.length} empresas`);
  } else console.log("  · PLATFORM_ADMIN omitido: faltan BOOTSTRAP_PLATFORM_ADMIN_EMAIL / _PASSWORD en el .env local");

  console.log("\n6) Entrada web neutral");
  const html = readFileSync(join(ROOT, "apps/front/index.html"), "utf8");
  const vite = readFileSync(join(ROOT, "apps/front/vite.config.ts"), "utf8");
  check("<title>, theme-color y manifest con la marca Trama (sin VÉLORA)", html.includes("<title>Trama") && !/V[ÉE]LORA/.test(html) && vite.includes('name: "Trama"') && html.includes("#14142B"));
}

main()
  .then(() => {
    const failed = results.filter((result) => !result.ok);
    console.log(`\n${results.length - failed.length}/${results.length} verificaciones correctas.`);
    process.exit(failed.length || results.length === 0 ? 1 : 0);
  })
  .catch((error) => { console.error(`\n✘ ${error.message}`); process.exit(1); });

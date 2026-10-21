#!/usr/bin/env node
// Demo reproducible de la Fase 1 SaaS (segundo parcial SI2), solo vía HTTP.
//
// Uso (con el backend corriendo):
//   node scripts/demo-saas.mjs                       # API en http://127.0.0.1:8080
//   VELORA_DEMO_API_BASE=http://127.0.0.1:18080 node scripts/demo-saas.mjs
//
// Crea propietarios FREE, PLUS y MAX con datos marcados por un identificador de corrida
// (no toca cuentas existentes ni requiere credenciales), comprueba límites PLAN_LIMIT_*,
// aislamiento entre propietarios, marca por empresa, widgets por nivel y que VÉLORA sigue
// funcionando. Termina con código 1 si alguna verificación falla.

import { randomUUID } from "node:crypto";
import process from "node:process";

const API = (process.env.VELORA_DEMO_API_BASE ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const RUN = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "") + "-" + randomUUID().slice(0, 4);
const PASSWORD = "DemoSaas2026";
const CARD = { cardNumber: "4242 4242 4242 4242", holderName: "Demo SaaS" };
const results = [];

async function api(method, path, { token, body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
}

function check(section, label, ok, detail = "") {
  results.push({ section, label, ok: Boolean(ok), detail });
  console.log(`${ok ? "  ✔" : "  ✘"} ${label}${detail ? ` — ${detail}` : ""}`);
}

function expectCode(section, label, result, code) {
  check(section, label, result.data?.code === code, `${result.status} ${result.data?.code ?? result.data?.message ?? ""}`.trim());
}

async function onboard(label, planCode, accentColor) {
  const slug = `demo-${label.toLowerCase()}-${RUN}`.slice(0, 60);
  const result = await api("POST", "/api/onboarding/store", {
    body: {
      owner: { firstName: "Demo", lastName: label, email: `demo.${label.toLowerCase()}.${RUN}@velora.local`, password: PASSWORD },
      company: { name: `Demo ${label} ${RUN}`, slug, tagline: `Tienda ${label} de la demo`, accentColor },
      planCode,
    },
  });
  if (result.status !== 201) throw new Error(`Onboarding ${label} falló: ${result.status} ${JSON.stringify(result.data)}`);
  return { label, token: result.data.auth.accessToken, companyId: result.data.company.id, slug, subscription: result.data.subscription };
}

const newStore = (owner, index) => ({ companyId: owner.companyId, code: `S${index}-${RUN.slice(-4)}`.toUpperCase(), name: `Sucursal ${index}` });
const newCompany = (owner, index) => ({ name: `Demo ${owner.label} extra ${index}`, slug: `demo-${owner.label.toLowerCase()}-x${index}-${RUN}`.slice(0, 60) });

async function main() {
  console.log(`VÉLORA · demo Fase 1 SaaS · API ${API} · corrida ${RUN}\n`);
  const health = await api("GET", "/api/health");
  if (health.status !== 200) throw new Error(`El backend no responde en ${API} (status ${health.status}).`);

  console.log("1. Onboarding transaccional (cuenta + tienda + sucursal + almacén + categorías + suscripción)");
  const free = await onboard("Free", "FREE", "#1F4E79");
  const plus = await onboard("Plus", "PLUS", "#7A1F3D");
  const max = await onboard("Max", "MAX", "#2F5D50");
  check("onboarding", "FREE queda ACTIVE sin vencimiento", free.subscription.status === "ACTIVE" && free.subscription.currentPeriodEnd === null);
  check("onboarding", "PLUS y MAX empiezan en TRIAL de 14 días", plus.subscription.status === "TRIAL" && max.subscription.status === "TRIAL");
  const categories = await api("GET", `/api/catalog/manage/categories?companyId=${free.companyId}`, { token: free.token });
  check("onboarding", "categorías base de moda creadas", categories.data?.length === 5, `${categories.data?.length ?? 0} categorías`);

  console.log("\n2. Límites del plan FREE (1 tienda, 1 sucursal, 25 productos, marca básica)");
  expectCode("límites", "FREE: segunda sucursal → PLAN_LIMIT_STORES", await api("POST", "/api/admin/stores", { token: free.token, body: newStore(free, 2) }), "PLAN_LIMIT_STORES");
  expectCode("límites", "FREE: segunda tienda → PLAN_LIMIT_COMPANIES", await api("POST", "/api/admin/companies", { token: free.token, body: newCompany(free, 2) }), "PLAN_LIMIT_COMPANIES");
  let created = 0;
  for (let index = 0; index < 25; index += 1) {
    const product = await api("POST", "/api/catalog/manage/products", { token: free.token, body: { companyId: free.companyId, categoryId: categories.data[0].id, name: `Producto demo ${index + 1}`, slug: `producto-demo-${index + 1}` } });
    if (product.status < 300) created += 1;
  }
  check("límites", "FREE: crea hasta 25 productos", created === 25, `${created} creados`);
  expectCode("límites", "FREE: producto 26 → PLAN_LIMIT_PRODUCTS", await api("POST", "/api/catalog/manage/products", { token: free.token, body: { companyId: free.companyId, categoryId: categories.data[0].id, name: "Producto 26", slug: "producto-demo-26" } }), "PLAN_LIMIT_PRODUCTS");
  expectCode("límites", "FREE: paleta completa → PLAN_LIMIT_BRANDING", await api("PATCH", `/api/admin/companies/${free.companyId}/branding`, { token: free.token, body: { palette: { accent: "#1F4E79", paper: "#FFFFFF" } } }), "PLAN_LIMIT_BRANDING");

  console.log("\n3. Límites del plan PLUS (2 tiendas, 3 sucursales por tienda)");
  const plusStores = [await api("POST", "/api/admin/stores", { token: plus.token, body: newStore(plus, 2) }), await api("POST", "/api/admin/stores", { token: plus.token, body: newStore(plus, 3) })];
  check("límites", "PLUS: crea sucursales 2 y 3", plusStores.every((result) => result.status < 300));
  expectCode("límites", "PLUS: cuarta sucursal → PLAN_LIMIT_STORES", await api("POST", "/api/admin/stores", { token: plus.token, body: newStore(plus, 4) }), "PLAN_LIMIT_STORES");
  check("límites", "PLUS: crea la segunda tienda", (await api("POST", "/api/admin/companies", { token: plus.token, body: newCompany(plus, 2) })).status === 201);
  expectCode("límites", "PLUS: tercera tienda → PLAN_LIMIT_COMPANIES", await api("POST", "/api/admin/companies", { token: plus.token, body: newCompany(plus, 3) }), "PLAN_LIMIT_COMPANIES");
  expectCode("límites", "PLUS: bajar a FREE con excedentes → 409 PLAN_DOWNGRADE_EXCEEDS", await api("POST", "/api/admin/plan/change", { token: plus.token, body: { planCode: "FREE" } }), "PLAN_DOWNGRADE_EXCEEDS");
  const upgrade = await api("POST", "/api/admin/plan/change", { token: free.token, body: { planCode: "PLUS", card: { cardNumber: "4000 0000 0000 0002", holderName: "Demo" } } });
  expectCode("límites", "pago DEMO rechazado con la tarjeta de prueba", upgrade, "PAYMENT_DECLINED");

  console.log("\n4. Aislamiento entre propietarios (FREE intenta operar la tienda PLUS)");
  check("aislamiento", "listar sucursales ajenas → 404", (await api("GET", `/api/admin/stores?companyId=${plus.companyId}`, { token: free.token })).status === 404);
  check("aislamiento", "reportes ajenos → 404", (await api("GET", `/api/admin/reports/overview?companyId=${plus.companyId}`, { token: free.token })).status === 404);
  check("aislamiento", "editar marca ajena → 404", (await api("PATCH", `/api/admin/companies/${plus.companyId}/branding`, { token: free.token, body: { displayName: "Hack" } })).status === 404);
  check("aislamiento", "crear producto en tienda ajena → 404", (await api("POST", "/api/catalog/manage/products", { token: free.token, body: { companyId: plus.companyId, categoryId: categories.data[0].id, name: "Hack", slug: "hack" } })).status === 404);
  const ownList = await api("GET", "/api/admin/companies", { token: free.token });
  check("aislamiento", "cada propietario ve solo sus tiendas", ownList.data?.length === 1 && ownList.data[0].id === free.companyId);

  console.log("\n5. Marca por empresa");
  check("marca", "PLUS guarda paleta completa (AA)", (await api("PATCH", `/api/admin/companies/${plus.companyId}/branding`, { token: plus.token, body: { palette: { accent: "#7A1F3D", paper: "#FFF8F3", ink: "#1B1B1F" } } })).status === 200);
  expectCode("marca", "paleta sin contraste AA → BRAND_CONTRAST", await api("PATCH", `/api/admin/companies/${plus.companyId}/branding`, { token: plus.token, body: { palette: { accent: "#7A1F3D", paper: "#FFFFFF", ink: "#CCCCCC" } } }), "BRAND_CONTRAST");
  const brands = await Promise.all([free, plus, max].map((owner) => api("GET", `/api/companies/by-slug/${owner.slug}`)));
  check("marca", "/t/:slug devuelve la marca de cada tienda", brands.every((brand, index) => brand.status === 200 && brand.data.slug === [free, plus, max][index].slug));
  check("marca", "cada tienda tiene su color de acento", new Set(brands.map((brand) => brand.data?.palette?.accent)).size === 3, brands.map((brand) => brand.data?.palette?.accent).join(" / "));
  check("marca", "frase de marca solo visible en MAX (marca completa)", brands[0].data.tagline === null && brands[2].data.tagline !== null);

  console.log("\n6. Dashboard: widgets distintos por nivel");
  const overview = async (owner) => (await api("GET", `/api/admin/reports/overview?companyId=${owner.companyId}`, { token: owner.token })).data;
  const [basic, standard, advanced] = await Promise.all([overview(free), overview(plus), overview(max)]);
  check("reportes", "FREE → BASIC (4 KPIs, resto bloqueado)", basic?.tier === "BASIC" && basic.kpis.length === 4 && basic.locked.length > 0, `kpis=${basic?.kpis.length} bloqueados=${basic?.locked.length}`);
  check("reportes", "PLUS → STANDARD (solo ADVANCED bloqueado)", standard?.tier === "STANDARD" && standard.locked.every((widget) => widget.minTier === "ADVANCED"), `kpis=${standard?.kpis.length} bloqueados=${standard?.locked.length}`);
  check("reportes", "MAX → ADVANCED (sin bloqueos)", advanced?.tier === "ADVANCED" && advanced.locked.length === 0, `kpis=${advanced?.kpis.length}`);
  expectCode("reportes", "FREE: narración IA → PLAN_LIMIT_REPORT_FEATURE", await api("POST", "/api/admin/reports/ai-narrative", { token: free.token, body: { companyId: free.companyId, question: "resumen" } }), "PLAN_LIMIT_REPORT_FEATURE");
  const paid = await api("POST", "/api/admin/plan/change", { token: free.token, body: { planCode: "PLUS", card: CARD } });
  check("reportes", "upgrade FREE → PLUS con pago DEMO cambia el nivel a STANDARD", paid.status === 200 && (await overview(free))?.tier === "STANDARD");

  console.log("\n7. VÉLORA sigue funcionando (prueba de humo pública)");
  const velora = await api("GET", "/api/companies/by-slug/velora");
  check("velora", "marca de plataforma VÉLORA", velora.status === 200 && velora.data.isPlatformBrand === true);
  const products = await api("GET", `/api/catalog/products?companyId=${velora.data?.companyId}`);
  const productCount = Array.isArray(products.data) ? products.data.length : products.data?.items?.length ?? 0;
  check("velora", "catálogo público de VÉLORA", products.status === 200 && productCount > 0, `${productCount} productos`);
  const plans = await api("GET", "/api/plans");
  check("velora", "planes públicos FREE/PLUS/MAX", plans.data?.map((plan) => plan.code).join(",") === "FREE,PLUS,MAX");

  const failed = results.filter((result) => !result.ok);
  console.log(`\nResultado: ${results.length - failed.length}/${results.length} verificaciones OK.`);
  console.log(`Tiendas creadas: /t/${free.slug} · /t/${plus.slug} · /t/${max.slug} (contraseña de los propietarios demo: ${PASSWORD})`);
  if (failed.length) {
    console.log("Fallas:\n" + failed.map((result) => `  - [${result.section}] ${result.label} ${result.detail}`).join("\n"));
    process.exitCode = 1;
  }
}

main().catch((error) => { console.error(`\nDemo interrumpida: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });

#!/usr/bin/env node
// Demo reproducible de la Fase 4C (app móvil), vía HTTP y con los MISMOS endpoints que usa el móvil:
//   1. directorio y tema de cada tienda (paleta derivada con @velora/contracts y contraste AA);
//   2. cliente: catálogo, disponibilidad por variante (solo nivel), descuento por compras y cuota del probador;
//   3. propietario con 2 empresas (MAX) y propietaria de 1 (PLUS): widgets por nivel del plan;
//   4. pedidos e inventario con el alcance correcto (empresa del dueño; sucursal del encargado);
//   5. aislamiento A/B entre propietarios y rechazo de PLATFORM_ADMIN en las rutas de dueño;
//   6. redirección por rol del móvil (función compartida mobileHomePath).
// No modifica datos: las escrituras que prueba son intentos A/B que deben ser rechazados.
// Sale con código 1 si algo falla.
//
// Credenciales (nunca se imprimen): VELORA_TRAMA_{OWNER,MANAGER,CUSTOMER}_PASSWORD y, opcional,
// BOOTSTRAP_PLATFORM_ADMIN_{EMAIL,PASSWORD} en el entorno o en el .env local.
//
//   node scripts/demo-movil.mjs

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const contracts = await import(pathToFileURL(join(ROOT, "packages/contracts/dist/index.js")).href);
const { contrastRatio, mobileHomePath, resolveBrandPalette, TRAMA_TOKENS, WCAG_AA_TEXT } = contracts;

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
const isoDay = (offsetDays) => new Date(Date.now() - 4 * 3_600_000 - offsetDays * 86_400_000).toISOString().slice(0, 10);
const denied = (status) => status === 403 || status === 404;

async function main() {
  const passwords = { owner: env("VELORA_TRAMA_OWNER_PASSWORD"), manager: env("VELORA_TRAMA_MANAGER_PASSWORD"), customer: env("VELORA_TRAMA_CUSTOMER_PASSWORD") };
  if (Object.values(passwords).some((value) => !value)) throw new Error("Faltan VELORA_TRAMA_*_PASSWORD en el entorno o en el .env local.");
  console.log(`Demo móvil (Fase 4C) contra ${API}\n`);

  console.log("1) Directorio y tema de cada tienda");
  const directory = (await api("GET", "/api/companies/directory")).data ?? [];
  const sport = (await api("GET", "/api/companies/directory?segment=DEPORTIVA&q=sport")).data ?? [];
  check("directorio con buscador y segmento (pantalla /stores)", directory.length >= 4 && sport.some((entry) => entry.slug === "impetu-sport"), `${directory.length} tiendas · DEPORTIVA+"sport" → ${sport.map((entry) => entry.name).join(", ")}`);
  const themes = [];
  for (const entry of directory) {
    const brand = (await api("GET", `/api/companies/by-slug/${entry.slug}`)).data;
    const theme = resolveBrandPalette(brand?.palette);
    themes.push({ slug: entry.slug, accent: theme.accent, aa: contrastRatio(theme.ink, theme.paper) >= WCAG_AA_TEXT && contrastRatio(theme.onAccent, theme.accent) >= WCAG_AA_TEXT });
  }
  check("cada tienda tiene su propio acento y cumple AA (texto y botón)", themes.every((theme) => theme.aa) && new Set(themes.map((theme) => theme.accent)).size >= Math.min(4, themes.length),
    themes.map((theme) => `${theme.slug} ${theme.accent}`).join(" · "));
  check("tokens de Trama para las pantallas de plataforma", TRAMA_TOKENS.accent === "#4F46E5" && contrastRatio(TRAMA_TOKENS.ink, TRAMA_TOKENS.paper) >= WCAG_AA_TEXT);

  console.log("\n2) Cliente");
  const customer = await login("cliente.demo@trama.seed.local", passwords.customer);
  check("redirección del móvil: cliente sin tienda → /stores; con tienda → /home",
    mobileHomePath({ status: "authenticated", role: customer.user.role, hasStore: false, ownerCompanySelected: false }) === "/stores"
    && mobileHomePath({ status: "authenticated", role: customer.user.role, hasStore: true, ownerCompanySelected: false }) === "/home");
  const montalvo = (await api("GET", "/api/companies/by-slug/casa-montalvo")).data;
  const products = (await api("GET", `/api/catalog/products?companyId=${montalvo.companyId}`)).data ?? [];
  const availability = await api("GET", `/api/catalog/products/${products[0]?.id}/availability?companyId=${montalvo.companyId}`);
  check("disponibilidad por variante: solo nivel (IN_STOCK/LOW/OUT), sin cantidades",
    availability.status === 200 && availability.data.length > 0 && availability.data.every((item) => Object.keys(item).sort().join() === "level,variantId" && ["IN_STOCK", "LOW", "OUT"].includes(item.level)),
    `${products[0]?.name}: ${availability.data?.map((item) => item.level).join(", ")}`);
  const foreign = await api("GET", `/api/catalog/products/${products[0]?.id}/availability?companyId=${(await api("GET", "/api/companies/by-slug/solana")).data.companyId}`);
  check("disponibilidad A/B: el producto de otra tienda es 404", foreign.status === 404);
  const plans = (await api("GET", "/api/plans")).data ?? [];
  const max = plans.find((plan) => plan.code === "MAX");
  check("descuento por compras (MAX) y cuota del probador publicados por plan", Boolean(max?.loyaltyDiscounts?.tiers?.length) && plans.every((plan) => "tryOnMonthlyPerCustomer" in plan.limits),
    plans.map((plan) => `${plan.code}: probador ${plan.limits.tryOnMonthlyPerCustomer ?? "∞"}${plan.loyaltyDiscounts ? `, fidelidad ${plan.loyaltyDiscounts.tiers.map((tier) => `${tier.percent}%`).join("/")}` : ""}`).join(" · "));
  const orders = await api("GET", "/api/customer/orders", { token: customer.token });
  check("Mis pedidos del cliente (con descuento cuando aplica)", orders.status === 200 && Array.isArray(orders.data), `${orders.data?.length ?? 0} pedidos · con descuento: ${(orders.data ?? []).filter((order) => order.discountAmount > 0).length}`);

  console.log("\n3) Propietarios y widgets por nivel");
  const rodrigo = await login("rodrigo.salvatierra@trama.seed.local", passwords.owner);
  const rodrigoCompanies = (await api("GET", "/api/admin/companies", { token: rodrigo.token })).data ?? [];
  check("dueño con 2 empresas → Mis empresas (/owner/companies)", rodrigoCompanies.length === 2
    && mobileHomePath({ status: "authenticated", role: "ADMIN", hasStore: false, ownerCompanySelected: false }) === "/owner/companies", rodrigoCompanies.map((company) => company.brand?.name ?? company.name).join(" + "));
  const daniela = await login("daniela.ferrufino@trama.seed.local", passwords.owner);
  const danielaCompany = ((await api("GET", "/api/admin/companies", { token: daniela.token })).data ?? [])[0];
  const range = `from=${isoDay(29)}&to=${isoDay(0)}`;
  const companyA = rodrigoCompanies.find((company) => company.slug === "casa-montalvo") ?? rodrigoCompanies[0];
  const maxOverview = (await api("GET", `/api/admin/reports/overview?companyId=${companyA.id}&${range}`, { token: rodrigo.token })).data;
  const plusOverview = (await api("GET", `/api/admin/reports/overview?companyId=${danielaCompany.id}&${range}`, { token: daniela.token })).data;
  check("MAX recibe más widgets que PLUS; PLUS recibe los suyos bloqueados con plan requerido",
    maxOverview?.tier === "ADVANCED" && plusOverview?.tier === "STANDARD" && (maxOverview.kpis.length + maxOverview.charts.length + maxOverview.tables.length) > (plusOverview.kpis.length + plusOverview.charts.length + plusOverview.tables.length)
    && (plusOverview.locked ?? []).length > 0 && plusOverview.locked.every((widget) => widget.requiredPlan),
    `MAX ${maxOverview?.kpis.length} KPIs/${maxOverview?.charts.length} gráficos · PLUS ${plusOverview?.kpis.length}/${plusOverview?.charts.length} + ${plusOverview?.locked?.length} bloqueados`);
  check("comparación con el periodo anterior en los KPIs", maxOverview?.kpis.some((kpi) => kpi.changePct !== undefined && kpi.changePct !== null));
  const stores = (await api("GET", `/api/admin/stores?companyId=${companyA.id}`, { token: rodrigo.token })).data ?? [];
  const byStore = await api("GET", `/api/admin/reports/overview?companyId=${companyA.id}&storeId=${stores[0]?.id}&${range}`, { token: rodrigo.token });
  check("selector de sucursal en el resumen", byStore.status === 200 && byStore.data.scopeLabel !== maxOverview.scopeLabel, `${byStore.data?.scopeLabel}`);

  console.log("\n4) Pedidos e inventario con alcance");
  const ownerOrders = (await api("GET", `/api/admin/orders?companyId=${companyA.id}`, { token: rodrigo.token })).data ?? [];
  check("pedidos del dueño: solo de la empresa activa", ownerOrders.length > 0 && ownerOrders.every((order) => order.companyId === companyA.id), `${ownerOrders.length} pedidos de ${companyA.brand?.name ?? companyA.name}`);
  const storeIds = new Set(stores.map((store) => store.id));
  const ownerWarehouses = (await api("GET", "/api/inventory/warehouses", { token: rodrigo.token })).data ?? [];
  const companyWarehouses = ownerWarehouses.filter((warehouse) => storeIds.has(warehouse.storeId));
  const stock = (await api("GET", `/api/inventory/warehouses/${companyWarehouses[0]?.id}/stock`, { token: rodrigo.token })).data ?? [];
  const low = stock.filter((item) => item.availableQuantity > 0 && item.availableQuantity <= 5).length;
  const out = stock.filter((item) => item.availableQuantity <= 0).length;
  check("inventario por almacén con filtros bajo/agotado", stock.length > 0, `${companyWarehouses[0]?.storeName} · ${stock.length} variantes · ${low} bajo · ${out} agotado`);
  const manager = await login("encargado.casa-montalvo.calacoto@seed.local", passwords.manager);
  const managerOrders = (await api("GET", "/api/manager/orders", { token: manager.token })).data ?? [];
  const managerWarehouses = (await api("GET", "/api/inventory/warehouses", { token: manager.token })).data ?? [];
  check("encargado: pedidos e inventario solo de su sucursal (mismas pantallas)",
    managerOrders.length > 0 && managerOrders.every((order) => order.storeId === manager.user.storeId) && managerWarehouses.length > 0 && managerWarehouses.every((warehouse) => warehouse.storeId === manager.user.storeId)
    && mobileHomePath({ status: "authenticated", role: "STORE_MANAGER", hasStore: false, ownerCompanySelected: false }) === "/operations",
    `${manager.user.storeName}: ${managerOrders.length} pedidos, ${managerWarehouses.length} almacenes`);

  console.log("\n5) Aislamiento A/B y PLATFORM_ADMIN");
  const intruder = await Promise.all([
    api("GET", `/api/admin/orders?companyId=${companyA.id}`, { token: daniela.token }),
    api("GET", `/api/admin/reports/overview?companyId=${companyA.id}&${range}`, { token: daniela.token }),
    api("GET", `/api/admin/stores?companyId=${companyA.id}`, { token: daniela.token }),
    api("GET", `/api/inventory/warehouses/${companyWarehouses[0]?.id}/stock`, { token: daniela.token }),
    api("GET", `/api/catalog/manage/products?companyId=${companyA.id}`, { token: daniela.token }),
  ]);
  check("otra dueña no ve pedidos, resumen, sucursales, stock ni catálogo de la empresa A", intruder.every((result) => denied(result.status)), intruder.map((result) => result.status).join("/"));
  const managed = (await api("GET", `/api/catalog/manage/products?companyId=${companyA.id}`, { token: rodrigo.token })).data ?? [];
  const variant = managed[0]?.variants?.[0];
  const priceAttempt = await api("PUT", `/api/catalog/manage/variants/${variant?.id}`, { token: daniela.token, body: { sku: variant?.sku, barcode: variant?.barcode, size: variant?.size, color: variant?.color, colorHex: variant?.colorHex, price: 1, compareAtPrice: null, currency: "BOB", active: true } });
  const movementAttempt = await api("POST", "/api/inventory/movements", { token: daniela.token, body: { warehouseId: companyWarehouses[0]?.id, variantId: variant?.id, movementType: "ENTRY", quantity: 1, reason: "intento A/B", referenceType: null, referenceId: null } });
  check("editar precio o mover stock de la empresa A desde otra cuenta: rechazado", denied(priceAttempt.status) && denied(movementAttempt.status), `${priceAttempt.status}/${movementAttempt.status}`);
  if (env("BOOTSTRAP_PLATFORM_ADMIN_EMAIL") && env("BOOTSTRAP_PLATFORM_ADMIN_PASSWORD")) {
    const platform = await login(env("BOOTSTRAP_PLATFORM_ADMIN_EMAIL"), env("BOOTSTRAP_PLATFORM_ADMIN_PASSWORD"));
    const routes = await Promise.all([
      api("GET", "/api/admin/companies", { token: platform.token }),
      api("GET", `/api/admin/orders?companyId=${companyA.id}`, { token: platform.token }),
      api("GET", "/api/admin/plan", { token: platform.token }),
      api("GET", `/api/admin/reports/overview?companyId=${companyA.id}&${range}`, { token: platform.token }),
      api("GET", "/api/inventory/warehouses", { token: platform.token }),
    ]);
    check("PLATFORM_ADMIN rechazado en las rutas de dueño y enviado a /platform-only en el móvil",
      routes.every((result) => result.status === 403) && mobileHomePath({ status: "authenticated", role: platform.user.role, hasStore: false, ownerCompanySelected: false }) === "/platform-only",
      routes.map((result) => result.status).join("/"));
  } else console.log("  · PLATFORM_ADMIN omitido: faltan BOOTSTRAP_PLATFORM_ADMIN_EMAIL / _PASSWORD en el .env local");
}

main()
  .then(() => {
    const failed = results.filter((result) => !result.ok);
    console.log(`\n${results.length - failed.length}/${results.length} verificaciones correctas.`);
    process.exit(failed.length || results.length === 0 ? 1 : 0);
  })
  .catch((error) => { console.error(`\n✘ ${error.message}`); process.exit(1); });

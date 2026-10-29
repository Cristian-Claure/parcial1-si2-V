#!/usr/bin/env node
// Demo reproducible de la Fase 5 (pagos), vía HTTP contra el backend local:
//   1. pedido pagado por QR DEMO (token inválido 403, doble confirmación idempotente);
//   2. QR vencido (410) — único paso que simula el reloj: adelanta expires_at en la BD local;
//   3. mejora/renovación de plan por QR: el plan cambia SOLO al pagar; comprobante PDF;
//   4. Stripe: sesión de Checkout si hay clave válida (luego se cancela); si no, método deshabilitado;
//   5. transferencia: comprobante, rechazo con motivo, reenvío y aprobación de la plataforma;
//   6. aislamiento (otro cliente, otro propietario, encargado) y reporte por método con QR.
// Usa una tienda propia "demo-pagos" (oculta del directorio) para no tocar los datos de las tiendas.
// Sale con código 1 si algo falla.
//
// Credenciales (nunca se imprimen): VELORA_TRAMA_{OWNER,CUSTOMER}_PASSWORD y
// BOOTSTRAP_PLATFORM_ADMIN_{EMAIL,PASSWORD} en el entorno o en el .env local.
//
//   VELORA_DEMO_API_BASE=http://127.0.0.1:18080 node scripts/demo-pagos.mjs

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
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
const CONTAINER = env("VELORA_DB_CONTAINER") || "velora-local-v25";
const DATABASE = env("VELORA_DB_NAME") || "velora_migrated_v25";
const DEMO_OWNER = { firstName: "Paula", lastName: "Pagos", email: "pagos.demo@trama.seed.local" };
const OTHER_CUSTOMER = { firstName: "Otro", lastName: "Cliente", email: "pagos.otro@trama.seed.local" };
const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const results = [];

function check(label, ok, detail = "") {
  results.push({ label, ok: Boolean(ok) });
  console.log(`  ${ok ? "✔" : "✘"} ${label}${detail ? ` — ${detail}` : ""}`);
}
async function api(method, path, { token, body, raw, headers = {} } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  const text = buffer.toString("utf8");
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data, text, buffer };
}
async function ok(method, path, options) {
  const result = await api(method, path, options);
  if (result.status >= 300) throw new Error(`${method} ${path} → HTTP ${result.status}: ${String(result.text).slice(0, 200)}`);
  return result.data;
}
async function login(email, password) {
  const result = await api("POST", "/api/auth/login", { body: { email, password } });
  return result.status === 200 ? result.data.accessToken : null;
}
function multipart(fields, file) {
  const boundary = `----demo${randomUUID().replaceAll("-", "")}`;
  const parts = Object.entries(fields).map(([name, value]) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`), file.data, Buffer.from(`\r\n--${boundary}--\r\n`));
  return { raw: Buffer.concat(parts), headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` } };
}
/** Único atajo fuera de HTTP: simular que pasaron los 10 minutos del QR (solo la columna expires_at). */
function expireQr(reference) {
  if (!/^\d{8,24}$/.test(reference)) throw new Error("Referencia inválida.");
  execFileSync("docker", ["exec", CONTAINER, "sh", "-c", `psql -U "$POSTGRES_USER" -d ${DATABASE} -qAtc "update qr_charges set expires_at = now() - interval '1 second' where reference = '${reference}'"`], { stdio: "pipe" });
}
const tokenOf = (payUrl) => new URL(payUrl).searchParams.get("t");
const businessToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(new Date());

async function ensureOwner(password) {
  let token = await login(DEMO_OWNER.email, password);
  if (!token) {
    const created = await ok("POST", "/api/onboarding/store", { body: { owner: { ...DEMO_OWNER, password }, company: { name: "Demo Pagos", slug: "demo-pagos", storeName: "Demo Pagos Central", city: "La Paz" }, planCode: "FREE" } });
    token = created.auth.accessToken;
  }
  const companies = await ok("GET", "/api/admin/companies", { token });
  const company = companies.find((entry) => entry.slug === "demo-pagos");
  if (!company) throw new Error("La cuenta demo de pagos no tiene la tienda demo-pagos.");
  return { token, companyId: company.id };
}

async function ensureProduct(token, companyId) {
  const categories = await ok("GET", `/api/catalog/manage/categories?companyId=${companyId}`, { token });
  const products = await ok("GET", `/api/catalog/manage/products?companyId=${companyId}`, { token });
  let product = products.find((entry) => entry.slug === "demo-pagos-polo");
  if (!product) {
    product = await ok("POST", "/api/catalog/manage/products", { token, body: { companyId, categoryId: categories[0].id, name: "Polo demo de pagos", slug: "demo-pagos-polo", description: "Producto para el demo de pagos.", status: "ACTIVE", tryOnEnabled: false } });
  }
  const detail = await ok("GET", `/api/catalog/manage/products/${product.id}?companyId=${companyId}`, { token });
  let variant = detail.variants?.find((entry) => entry.sku === "DEMO-PAGOS-M");
  if (!variant) variant = await ok("POST", `/api/catalog/manage/products/${product.id}/variants`, { token, body: { sku: "DEMO-PAGOS-M", size: "M", color: "Negro", price: 120, currency: "BOB" } });
  const warehouses = await ok("GET", "/api/inventory/warehouses", { token });
  const warehouse = warehouses.find((entry) => entry.defaultWarehouse) ?? warehouses[0];
  const stock = await ok("GET", `/api/inventory/warehouses/${warehouse.id}/stock`, { token });
  const available = stock.find((row) => row.variantId === variant.id)?.availableQuantity ?? 0;
  if (available < 5) await ok("POST", "/api/inventory/movements", { token, body: { warehouseId: warehouse.id, variantId: variant.id, movementType: "ENTRY", quantity: 20, reason: "Stock del demo de pagos", referenceType: "MANUAL_ADJUSTMENT" } });
  return { variantId: variant.id, warehouseId: warehouse.id };
}

async function ensureCustomer(person, password) {
  let token = await login(person.email, password);
  if (!token) { await ok("POST", "/api/auth/register", { body: { ...person, password } }); token = await login(person.email, password); }
  return token;
}

async function newOrder(customer, companyId, shop) {
  await ok("POST", "/api/customer/cart/items", { token: customer, body: { companyId, variantId: shop.variantId, quantity: 1 } });
  return ok("POST", "/api/customer/orders", { token: customer, body: { companyId, warehouseId: shop.warehouseId, fulfillmentType: "PICKUP" }, headers: { "Idempotency-Key": randomUUID() } });
}

async function main() {
  const passwords = { owner: env("VELORA_TRAMA_OWNER_PASSWORD"), customer: env("VELORA_TRAMA_CUSTOMER_PASSWORD") };
  if (!passwords.owner || !passwords.customer) throw new Error("Faltan VELORA_TRAMA_OWNER_PASSWORD o VELORA_TRAMA_CUSTOMER_PASSWORD.");
  if (!env("BOOTSTRAP_PLATFORM_ADMIN_EMAIL") || !env("BOOTSTRAP_PLATFORM_ADMIN_PASSWORD")) throw new Error("Faltan BOOTSTRAP_PLATFORM_ADMIN_EMAIL/PASSWORD.");
  console.log(`Demo de pagos (Fase 5) contra ${API}\n`);
  const platform = await login(env("BOOTSTRAP_PLATFORM_ADMIN_EMAIL"), env("BOOTSTRAP_PLATFORM_ADMIN_PASSWORD"));
  if (!platform) throw new Error("No se pudo iniciar sesión como PLATFORM_ADMIN.");
  const owner = await ensureOwner(passwords.owner);
  const shop = await ensureProduct(owner.token, owner.companyId);
  const customer = await ensureCustomer({ firstName: "Camila", lastName: "Demo", email: "cliente.demo@trama.seed.local" }, passwords.customer);
  const otherCustomer = await ensureCustomer(OTHER_CUSTOMER, passwords.customer);
  const otherOwner = await login("rodrigo.salvatierra@trama.seed.local", passwords.owner);

  console.log("1) Pedido pagado con QR DEMO");
  const order = await newOrder(customer, owner.companyId, shop);
  const created = await ok("POST", `/api/customer/orders/${order.id}/payments/qr`, { token: customer });
  check("QR con el monto del servidor y vencimiento de 10 minutos", created.qr.amount === Number(order.total) && created.qr.secondsRemaining > 590, `ref ${created.qr.reference}, ${created.qr.amount} ${created.qr.currency}`);
  check("imagen SVG (web) y PNG data URL (móvil)", created.qr.qrSvg?.startsWith("<svg") && created.qr.qrPngDataUrl?.startsWith("data:image/png;base64,"));
  const token = tokenOf(created.qr.payUrl);
  check("token inválido → 403", (await api("POST", `/api/pay/qr/${created.qr.reference}/confirm`, { body: { token: `${token.slice(0, -3)}abc` } })).status === 403);
  const view = await ok("GET", `/api/pay/qr/${created.qr.reference}?t=${encodeURIComponent(token)}`);
  check("Banco demo muestra comercio y monto", view.status === "PENDING" && view.demo === true && view.merchantName === "Demo Pagos");
  const paid = await ok("POST", `/api/pay/qr/${created.qr.reference}/confirm`, { body: { token } });
  const again = await ok("POST", `/api/pay/qr/${created.qr.reference}/confirm`, { body: { token } });
  check("pago confirmado y doble confirmación idempotente", paid.status === "PAID" && !paid.alreadyProcessed && again.alreadyProcessed === true);
  check("el cliente ve el QR como pagado", (await ok("GET", `/api/customer/payments/${created.payment.id}/qr`, { token: customer })).status === "PAID");
  check("aislamiento: otro cliente no ve el QR (404)", (await api("GET", `/api/customer/payments/${created.payment.id}/qr`, { token: otherCustomer })).status === 404);
  await api("POST", `/api/admin/orders/${order.id}/fulfill`, { token: owner.token, body: {} });

  console.log("\n2) QR vencido");
  const late = await newOrder(customer, owner.companyId, shop);
  const lateQr = await ok("POST", `/api/customer/orders/${late.id}/payments/qr`, { token: customer });
  expireQr(lateQr.qr.reference);
  check("el Banco demo responde 410 al vencer", (await api("POST", `/api/pay/qr/${lateQr.qr.reference}/confirm`, { body: { token: tokenOf(lateQr.qr.payUrl) } })).status === 410);
  check("el pago queda EXPIRED (sin cron)", (await ok("GET", `/api/customer/payments/${lateQr.payment.id}/qr`, { token: customer })).status === "EXPIRED");
  await api("POST", `/api/customer/orders/${late.id}/cancel`, { token: customer });

  console.log("\n3) Mejora o renovación del plan por QR");
  const before = await ok("GET", "/api/admin/plan", { token: owner.token });
  const target = before.subscription?.planCode && before.subscription.planCode !== "FREE" ? before.subscription.planCode : "PLUS";
  const planQr = await ok("POST", "/api/admin/plan/payments", { token: owner.token, body: { planCode: target, method: "QR" } });
  const pendingPlan = await ok("GET", "/api/admin/plan", { token: owner.token });
  check("mientras el pago está pendiente el plan no cambia", pendingPlan.subscription?.planCode === before.subscription?.planCode && pendingPlan.subscription?.currentPeriodEnd === before.subscription?.currentPeriodEnd);
  await ok("POST", `/api/pay/qr/${planQr.qr.reference}/confirm`, { body: { token: tokenOf(planQr.qr.payUrl) } });
  const afterQr = await ok("GET", "/api/admin/plan", { token: owner.token });
  check(`plan ${target} activo al pagar (periodo de 30 días)`, afterQr.subscription?.planCode === target && afterQr.subscription.status === "ACTIVE" && afterQr.subscription.currentPeriodEnd !== before.subscription?.currentPeriodEnd, `vence ${afterQr.subscription?.currentPeriodEnd?.slice(0, 10)}`);
  const receipt = await api("GET", `/api/admin/plan/payments/${planQr.payment.id}/receipt`, { token: owner.token });
  check("comprobante PDF del pago", receipt.status === 200 && receipt.buffer.subarray(0, 4).toString("latin1") === "%PDF");

  console.log("\n4) Tarjeta (Stripe)");
  const options = await ok("GET", "/api/admin/plan/payment-options", { token: owner.token });
  const stripe = options.methods.find((method) => method.method === "STRIPE");
  if (stripe.enabled) {
    const session = await ok("POST", "/api/admin/plan/payments", { token: owner.token, body: { planCode: target, method: "STRIPE" } });
    check("sesión de Stripe Checkout (modo test) con monto del servidor", /^https:\/\/checkout\.stripe\.com\//.test(session.checkoutUrl ?? ""), "se cancela sin pagar");
    const cancelled = await ok("POST", `/api/admin/plan/payments/${session.payment.id}/cancel`, { token: owner.token });
    check("intento cancelado sin cambiar el plan", cancelled.payment.status === "CANCELLED");
  } else {
    check("sin clave válida: Stripe aparece deshabilitado con aviso", /no configurada/i.test(stripe.reason ?? ""));
    check("crear un pago Stripe responde 503", (await api("POST", "/api/admin/plan/payments", { token: owner.token, body: { planCode: target, method: "STRIPE" } })).status === 503);
  }

  console.log("\n5) Transferencia con revisión");
  const transfer = await ok("POST", "/api/admin/plan/payments", { token: owner.token, body: { planCode: target, method: "TRANSFER" } });
  check("datos de cobro, monto exacto y glosa única", Boolean(transfer.transfer?.accountNumber) && /^TRM\d{12}$/.test(transfer.payment.reference ?? ""), transfer.transfer?.isSample ? "datos de ejemplo" : "");
  const fake = multipart({ operationNumber: "OP-FALSO" }, { filename: "falso.png", contentType: "image/png", data: Buffer.from("no es una imagen") });
  check("archivo que no es imagen ni PDF → 415", (await api("POST", `/api/admin/plan/payments/${transfer.payment.id}/transfer-proof`, { token: owner.token, ...fake })).status === 415);
  const proof = multipart({ operationNumber: "OP-1001" }, { filename: "comprobante.png", contentType: "image/png", data: TINY_PNG });
  const sent = await ok("POST", `/api/admin/plan/payments/${transfer.payment.id}/transfer-proof`, { token: owner.token, ...proof });
  check("comprobante enviado → PENDING_REVIEW", sent.payment.status === "PENDING_REVIEW");
  check("comprobante privado: otro propietario 404", otherOwner ? (await api("GET", `/api/billing/payments/${transfer.payment.id}/proof`, { token: otherOwner })).status === 404 : false);
  check("comprobante privado: cliente 403, plataforma 200", (await api("GET", `/api/billing/payments/${transfer.payment.id}/proof`, { token: customer })).status === 403
    && (await api("GET", `/api/billing/payments/${transfer.payment.id}/proof`, { token: platform })).status === 200);
  const queue = await ok("GET", "/api/platform/payments?status=PENDING_REVIEW", { token: platform });
  check("aparece en la cola /plataforma/pagos", queue.some((payment) => payment.id === transfer.payment.id));
  await ok("POST", `/api/platform/payments/${transfer.payment.id}/review`, { token: platform, body: { decision: "REJECT", reason: "La glosa no coincide con la referencia" } });
  const rejected = await ok("GET", `/api/admin/plan/payments/${transfer.payment.id}`, { token: owner.token });
  check("rechazo con motivo visible para el propietario", rejected.payment.status === "PENDING" && rejected.payment.rejectionReason === "La glosa no coincide con la referencia");
  await ok("POST", `/api/admin/plan/payments/${transfer.payment.id}/transfer-proof`, { token: owner.token, ...multipart({ operationNumber: "OP-1002" }, { filename: "comprobante.png", contentType: "image/png", data: TINY_PNG }) });
  const approved = await ok("POST", `/api/platform/payments/${transfer.payment.id}/review`, { token: platform, body: { decision: "APPROVE" } });
  const afterTransfer = await ok("GET", "/api/admin/plan", { token: owner.token });
  const added = Math.round((Date.parse(afterTransfer.subscription.currentPeriodEnd) - Date.parse(afterQr.subscription.currentPeriodEnd)) / 86_400_000);
  check("aprobado → PAID y renovación anticipada suma 30 días", approved.status === "PAID" && added === 30, `+${added} días`);

  console.log("\n6) Reportes y aislamiento");
  const today = businessToday();
  const overview = await ok("GET", `/api/admin/reports/overview?companyId=${owner.companyId}&from=${today}&to=${today}`, { token: owner.token });
  const chart = overview.charts.find((entry) => entry.id === "payments-method");
  check("el reporte \"Cobros por método\" incluye QR", chart?.categories.includes("QR"));
  check("los pagos de plan no cuentan como ventas", !(chart?.categories ?? []).includes("Transferencia"));
  check("otro propietario no ve el pago de plan (404)", otherOwner ? (await api("GET", `/api/admin/plan/payments/${transfer.payment.id}`, { token: otherOwner })).status === 404 : false);

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas.`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(`\n✘ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});

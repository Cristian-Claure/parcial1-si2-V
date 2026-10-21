#!/usr/bin/env node
// Demo reproducible de la Fase 2 (offline completo), solo vía HTTP.
//
// Simula un dispositivo de un encargado con el MISMO motor de cola que usan la web y el
// móvil (@velora/contracts): registra cliente y producto sin red, reconecta, sincroniza
// y verifica idempotencia, conflictos (con su resolución), límites del plan, versiones y
// el pull incremental con tombstones. Crea su propia tienda FREE; no requiere credenciales.
//
// Uso (con el backend corriendo y `pnpm build:packages` hecho):
//   node scripts/demo-offline.mjs
//   VELORA_DEMO_API_BASE=http://127.0.0.1:18080 node scripts/demo-offline.mjs

import { randomUUID } from "node:crypto";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { mirrorChanges, pushOutbox, resolveConflict } = await import(pathToFileURL(join(root, "packages/contracts/dist/index.js")).href);

const API = (process.env.VELORA_DEMO_API_BASE ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const RUN = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "") + "-" + randomUUID().slice(0, 4);
const PASSWORD = "DemoOffline2026";
const results = [];

async function api(method, path, { token, body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
}

function check(label, ok, detail = "") {
  results.push({ label, ok: Boolean(ok), detail });
  console.log(`${ok ? "  ✔" : "  ✘"} ${label}${detail ? ` — ${detail}` : ""}`);
}

/** Dispositivo simulado: cola en memoria + transporte que puede "perder la red". */
function createDevice(token, companyId, userId) {
  const outbox = new Map();
  const mirror = new Map();
  let online = false;
  let cursor = null;
  const store = {
    pending: async () => [...outbox.values()],
    update: async (id, patch) => { const current = outbox.get(id); if (current) outbox.set(id, { ...current, ...patch }); },
    remove: async (id) => { outbox.delete(id); },
  };
  const transport = {
    push: async (company, operations) => {
      if (!online) { const error = new Error("Sin conexión"); error.offline = true; throw error; }
      const response = await api("POST", "/api/sync/push", { token, body: { companyId: company, operations } });
      if (response.status !== 200) throw new Error(`push ${response.status}: ${JSON.stringify(response.data)}`);
      return response.data;
    },
  };
  return {
    outbox, mirror,
    setOnline: (value) => { online = value; },
    enqueue: (operation, label) => {
      const at = new Date().toISOString();
      outbox.set(operation.clientOperationId, { clientOperationId: operation.clientOperationId, companyId, userId, operation, label, status: "PENDING", attempts: 0, code: null, error: null, result: null, createdAt: at, updatedAt: at });
    },
    sync: () => pushOutbox(store, transport, companyId, userId, (error) => Boolean(error?.offline)),
    pull: async () => {
      const response = await api("GET", `/api/sync/pull?companyId=${companyId}${cursor ? `&since=${cursor}` : ""}`, { token });
      if (response.status !== 200) throw new Error(`pull ${response.status}`);
      const { upserts, deletes } = mirrorChanges(response.data);
      for (const key of deletes) mirror.delete(key);
      for (const record of upserts) mirror.set(record.key, record);
      cursor = response.data.cursor;
      return response.data;
    },
    resolve: (id, option, adjusted) => {
      const entry = outbox.get(id);
      const resolution = resolveConflict(entry, option, adjusted);
      if (resolution.action === "REMOVE") outbox.delete(id); else outbox.set(id, { ...entry, ...resolution.patch });
      return resolution;
    },
  };
}

const customerOp = (overrides = {}) => ({ clientOperationId: randomUUID(), type: "CUSTOMER_CREATE", payload: { id: randomUUID(), firstName: "Rosa", lastName: "Méndez", phone: "70011122", taxId: `CI-${RUN}`, ...overrides } });
const productOp = (categoryId, warehouseId, sku, quantity = 0) => {
  const variantId = randomUUID();
  return { clientOperationId: randomUUID(), type: "PRODUCT_CREATE", payload: { id: randomUUID(), categoryId, name: `Blusa offline ${sku}`, variants: [{ id: variantId, sku, size: "M", color: "Crema", price: 180 }], ...(quantity ? { initialStock: [{ variantId, warehouseId, quantity }] } : {}) } };
};

async function main() {
  console.log(`VÉLORA · demo Fase 2 (offline) · API ${API} · corrida ${RUN}\n`);
  if ((await api("GET", "/api/health")).status !== 200) throw new Error(`El backend no responde en ${API}.`);

  console.log("0. Preparación: tienda FREE con su encargado");
  const ownerEmail = `demo.offline.${RUN}@velora.local`;
  const onboarding = await api("POST", "/api/onboarding/store", { body: { owner: { firstName: "Demo", lastName: "Offline", email: ownerEmail, password: PASSWORD }, company: { name: `Offline ${RUN}`, slug: `demo-offline-${RUN}`.slice(0, 60) }, planCode: "FREE" } });
  if (onboarding.status !== 201) throw new Error(`Onboarding falló: ${onboarding.status} ${JSON.stringify(onboarding.data)}`);
  const ownerToken = onboarding.data.auth.accessToken; const companyId = onboarding.data.company.id;
  const stores = await api("GET", `/api/admin/stores?companyId=${companyId}`, { token: ownerToken });
  const managerEmail = `encargado.offline.${RUN}@velora.local`;
  await api("POST", "/api/admin/users/managers", { token: ownerToken, body: { companyId, storeId: stores.data[0].id, firstName: "Encargada", lastName: "Demo", email: managerEmail, password: PASSWORD } });
  const managerLogin = await api("POST", "/api/auth/login", { body: { email: managerEmail, password: PASSWORD } });
  const managerToken = managerLogin.data.accessToken;
  check("encargado de la tienda creado e inicia sesión", managerLogin.status === 200);

  const device = createDevice(managerToken, companyId, managerLogin.data.user.id);
  device.setOnline(true);
  const snapshot = await device.pull();
  const categoryId = snapshot.categories[0].id; const warehouseId = snapshot.warehouses[0].id;
  check("pull inicial: el dispositivo guarda categorías y almacén para trabajar sin red", snapshot.snapshot && snapshot.categories.length === 5 && snapshot.warehouses.length === 1);

  console.log("\n1. Sin red: registrar cliente y producto (quedan en la cola)");
  device.setOnline(false);
  const customer = customerOp({ email: `rosa.${RUN}@velora.local` });
  const product = productOp(categoryId, warehouseId, `OFF-${RUN.slice(-4)}-1`, 8);
  device.enqueue(customer, "Cliente Rosa Méndez");
  device.enqueue(product, "Producto Blusa offline");
  const offline = await device.sync();
  check("sin red no se envía nada ni se gastan intentos", offline.offline && [...device.outbox.values()].every((entry) => entry.status === "PENDING" && entry.attempts === 0), `${device.outbox.size} en cola`);

  console.log("\n2. Reconexión: sincronización completa");
  device.setOnline(true);
  const online = await device.sync();
  check("cliente y producto APLICADOS al reconectar", online.applied === 2 && device.outbox.size === 0, `aplicadas=${online.applied}`);
  const pulled = await device.pull();
  check("el pull trae lo creado sin red", pulled.customers.some((item) => item.id === customer.payload.id) && pulled.products.some((item) => item.id === product.payload.id));
  check("stock inicial aplicado por el servidor (movimiento ENTRY)", pulled.products.find((item) => item.id === product.payload.id)?.stock?.[0]?.available === 8);

  console.log("\n3. Idempotencia: el mismo envío dos veces (p. ej. se cortó la respuesta)");
  device.enqueue(customer, "Reenvío del cliente");
  device.enqueue(product, "Reenvío del producto");
  const again = await device.sync();
  check("los reenvíos responden DUPLICATE y no duplican datos ni stock", again.duplicates === 2 && again.applied === 0);
  const afterDuplicate = await device.pull();
  check("el stock sigue en 8 tras el reenvío", (afterDuplicate.products.find((item) => item.id === product.payload.id)?.stock?.[0]?.available ?? 8) === 8);

  console.log("\n4. Conflictos y su resolución");
  device.setOnline(false);
  const dupDocument = customerOp({ firstName: "Otra", lastName: "Persona" });
  const dupSku = productOp(categoryId, warehouseId, product.payload.variants[0].sku);
  device.enqueue(dupDocument, "Cliente con documento repetido");
  device.enqueue(dupSku, "Producto con SKU repetido");
  device.setOnline(true);
  const conflicts = await device.sync();
  const docEntry = device.outbox.get(dupDocument.clientOperationId); const skuEntry = device.outbox.get(dupSku.clientOperationId);
  check("documento repetido → CONFLICT DOCUMENT_TAKEN con opciones", docEntry?.status === "CONFLICT" && docEntry.code === "DOCUMENT_TAKEN" && docEntry.result.options.includes("USE_EXISTING"));
  check("SKU repetido → CONFLICT SKU_TAKEN", skuEntry?.status === "CONFLICT" && skuEntry.code === "SKU_TAKEN", `conflictos=${conflicts.conflicts}`);
  device.resolve(dupDocument.clientOperationId, "USE_EXISTING");
  device.resolve(dupSku.clientOperationId, "ADJUST_AND_RETRY", { variants: dupSku.payload.variants.map((variant) => ({ ...variant, sku: `${variant.sku}-B` })) });
  const resolved = await device.sync();
  check("'usar el existente' descarta el duplicado; 'ajustar y reintentar' aplica con otro SKU", resolved.applied === 1 && device.outbox.size === 0);

  console.log("\n5. Edición con versión (control optimista)");
  const editOwner = await api("POST", "/api/sync/push", { token: ownerToken, body: { companyId, operations: [{ clientOperationId: randomUUID(), type: "PRODUCT_UPDATE", baseVersion: 1, payload: { id: product.payload.id, name: "Nombre del propietario" } }] } });
  check("el propietario edita el producto (versión 2)", editOwner.data?.results?.[0]?.status === "APPLIED" && editOwner.data.results[0].version === 2);
  const staleEdit = { clientOperationId: randomUUID(), type: "PRODUCT_UPDATE", baseVersion: 1, payload: { id: product.payload.id, name: "Nombre del encargado (offline)" } };
  device.enqueue(staleEdit, "Edición offline del producto");
  await device.sync();
  check("edición desactualizada → CONFLICT VERSION_MISMATCH", device.outbox.get(staleEdit.clientOperationId)?.code === "VERSION_MISMATCH");
  device.resolve(staleEdit.clientOperationId, "KEEP_MINE");
  const keepMine = await device.sync();
  check("'conservar el mío' reenvía con la versión del servidor y se aplica", keepMine.applied === 1);

  console.log("\n6. Límite del plan al sincronizar (FREE: 25 productos)");
  device.setOnline(false);
  for (let index = 0; index < 24; index += 1) device.enqueue(productOp(categoryId, warehouseId, `LIM-${RUN.slice(-4)}-${index}`), `Producto ${index}`);
  device.setOnline(true);
  const limited = await device.sync();
  const rejected = [...device.outbox.values()].filter((entry) => entry.status === "FAILED");
  check("los productos que exceden el plan quedan REJECTED con PLAN_LIMIT_PRODUCTS (no CONFLICT)", rejected.length === 1 && rejected[0].code === "PLAN_LIMIT_PRODUCTS", `aplicadas=${limited.applied} rechazadas=${limited.rejected}`);

  console.log("\n7. Pull incremental con tombstones");
  await device.pull();
  const deactivate = await api("POST", "/api/sync/push", { token: ownerToken, body: { companyId, operations: [{ clientOperationId: randomUUID(), type: "PRODUCT_UPDATE", baseVersion: 3, payload: { id: product.payload.id, status: "INACTIVE" } }] } });
  const incremental = await device.pull();
  check("al desactivar un producto llega como tombstone y sale del dispositivo", deactivate.data?.results?.[0]?.status === "APPLIED" && incremental.tombstones.some((item) => item.id === product.payload.id) && ![...device.mirror.keys()].some((key) => key.endsWith(product.payload.id)));

  console.log("\n8. Vinculación del cliente registrado sin acceso");
  const register = await api("POST", "/api/auth/register", { body: { firstName: "Rosa", lastName: "Méndez", email: customer.payload.email, password: "RosaDemo2026" } });
  check("si el cliente se registra con el mismo correo, obtiene acceso sobre su ficha", register.status === 200 && register.data.user.id === customer.payload.id);

  const failed = results.filter((result) => !result.ok);
  console.log(`\nResultado: ${results.length - failed.length}/${results.length} verificaciones OK.`);
  console.log(`Encargado demo: ${managerEmail} · contraseña ${PASSWORD} (cuentas locales de prueba)`);
  if (failed.length) { console.log("Fallas:\n" + failed.map((result) => `  - ${result.label} ${result.detail}`).join("\n")); process.exitCode = 1; }
}

main().catch((error) => { console.error(`\nDemo interrumpida: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });

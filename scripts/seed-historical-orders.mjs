// One-off historical data seed for feat/historical-order-seed.
//
// Creates realistic ECOMMERCE orders through the REAL customer checkout HTTP flow
// (cart -> order -> payment -> confirm/fulfill/cancel), exactly as a real customer
// and staff member would. The one and only exception, explicitly approved: after an
// order is fully created through the real flow (so status/amounts/stock are all
// genuinely computed by the app's own business logic), a single SQL UPDATE rewrites
// ONLY orders.created_at to spread the batch across realistic dates from 2026-09-01
// through 2026-09-22 -- because the real API always stamps created_at with the
// server's current time and has no field to backdate/forward-date it. No other
// column is ever touched by SQL.
//
// Usage:
//   node scripts/seed-historical-orders.mjs --test        # 3-5 orders, prints before/after, exits
//   node scripts/seed-historical-orders.mjs                # full run
//
import { createRequire } from "node:module";

// "pg" is only a transitive dependency (via packages/database), not declared directly
// anywhere, so pnpm's strict linking won't resolve a bare `import "pg"` from scripts/.
const require = createRequire(import.meta.url);
const pg = require("../node_modules/.pnpm/pg@8.23.0/node_modules/pg/lib/index.js");

const API = process.env.SEED_API_BASE_URL ?? "http://127.0.0.1:8080";
const DB_URL = process.env.DATABASE_URL ?? "postgresql://velora:velora_local_test@127.0.0.1:55433/velora_migrated_v25";
const COMPANY_ID = "10000000-0000-0000-0000-000000000001";

const ADMIN_EMAIL = "seed.script.admin@velora.local";
const ADMIN_PASSWORD = "SeedScript2026!Admin";

const RANGE_START = new Date("2026-09-01T00:00:00Z");
const RANGE_END = new Date("2026-09-22T00:00:00Z");

const SEED_CUSTOMERS = Array.from({ length: 5 }, (_, i) => ({
  email: `seed.customer.${i + 1}@velora.local`,
  password: "SeedScript2026!Cust",
  firstName: "Cliente",
  lastName: `Semilla${i + 1}`,
}));

const isTestRun = process.argv.includes("--test");

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[rand(0, arr.length - 1)];
}

function weightedPick(pairs) {
  const total = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [value, weight] of pairs) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function businessHourTimestamp(day) {
  const hour = rand(9, 20);
  const minute = rand(0, 59);
  const second = rand(0, 59);
  const d = new Date(day);
  d.setUTCHours(hour, minute, second, 0);
  return d;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(path, { method = "GET", body, token, headers = {} } = {}, attempt = 0) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;

  if (res.status === 429 && attempt < 8) {
    const wait = 8000 * (attempt + 1);
    await sleep(wait);
    return api(path, { method, body, token, headers }, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${payload?.message ?? text}`);
  }

  return payload;
}

async function ensureCustomer(customer) {
  // Try login first (the common case once customers exist from a previous run) so we
  // spend a single auth call per customer instead of two -- the auth endpoints share a
  // tight per-IP rate limit (10 requests / 60s) that a register-then-login fallback for
  // every already-existing customer would blow through immediately.
  try {
    const auth = await api("/api/auth/login", {
      method: "POST",
      body: { email: customer.email, password: customer.password },
    });
    return auth.accessToken;
  } catch (error) {
    if (!String(error.message).includes("401") && !String(error.message).toLowerCase().includes("credenciales")) {
      throw error;
    }
  }

  const auth = await api("/api/auth/register", {
    method: "POST",
    body: {
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      password: customer.password,
    },
  });
  return auth.accessToken;
}

async function ensureAddress(token) {
  const addresses = await api("/api/customer/addresses", { token });
  if (addresses.length > 0) return addresses[0].id;

  const created = await api("/api/customer/addresses", {
    method: "POST",
    token,
    body: {
      label: "Casa",
      recipientName: "Cliente Semilla",
      recipientPhone: "70000000",
      department: "Santa Cruz",
      city: "Santa Cruz de la Sierra",
      zone: "Equipetrol",
      addressLine: "Av. San Martín #123",
      reference: null,
      defaultAddress: true,
    },
  });
  return created.id;
}

async function main() {
  console.log(`API=${API} testRun=${isTestRun}`);

  const adminToken = (
    await api("/api/auth/login", {
      method: "POST",
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    })
  ).accessToken;

  const products = await api(`/api/catalog/products?companyId=${COMPANY_ID}`);
  const variants = products.flatMap((product) =>
    product.variants.filter((variant) => variant.active).map((variant) => ({ ...variant, productName: product.name })),
  );

  if (variants.length === 0) {
    throw new Error("No hay variantes activas para generar órdenes.");
  }

  const customers = [];
  for (const seed of SEED_CUSTOMERS) {
    const token = await ensureCustomer(seed);
    const addressId = await ensureAddress(token);
    customers.push({ ...seed, token, addressId });
    await sleep(600);
  }

  const pg1 = new pg.Client({ connectionString: DB_URL });
  await pg1.connect();

  const existingByDay = new Map();
  {
    const { rows } = await pg1.query(
      `select date_trunc('day', created_at) as day, count(*) as n
       from orders
       where order_channel = 'ECOMMERCE' and created_at >= $1 and created_at < $2
       group by 1`,
      [RANGE_START.toISOString(), RANGE_END.toISOString()],
    );
    for (const row of rows) {
      existingByDay.set(dateKey(new Date(row.day)), Number(row.n));
    }
  }

  const days = [];
  for (let d = new Date(RANGE_START); d < RANGE_END; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(new Date(d));
  }

  const plan = [];
  for (const day of days) {
    const key = dateKey(day);
    const existing = existingByDay.get(key) ?? 0;
    const target = rand(3, 7);
    const needed = Math.max(0, target - existing);
    for (let i = 0; i < needed; i += 1) {
      plan.push(day);
    }
  }

  const batch = isTestRun ? plan.slice(0, rand(3, 5)) : plan;
  console.log(`Plan: ${plan.length} órdenes necesarias en total; ejecutando ${batch.length}.`);

  const created = [];
  let customerIndex = 0;

  for (const targetDay of batch) {
    const customer = customers[customerIndex % customers.length];
    customerIndex += 1;

    try {
      await api(`/api/customer/cart?companyId=${COMPANY_ID}`, { method: "DELETE", token: customer.token });

      const lineCount = rand(1, 2);
      for (let i = 0; i < lineCount; i += 1) {
        const variant = pick(variants);
        await api("/api/customer/cart/items", {
          method: "POST",
          token: customer.token,
          body: { companyId: COMPANY_ID, variantId: variant.id, quantity: 1 },
        });
      }

      const fulfillmentType = weightedPick([
        ["DELIVERY", 61.8],
        ["PICKUP", 38.2],
      ]);

      const warehouses = await api(`/api/customer/checkout/warehouses?companyId=${COMPANY_ID}`, { token: customer.token });
      const eligible = warehouses.filter((w) => (fulfillmentType === "PICKUP" ? w.pickupEligible : w.deliveryEligible));
      if (eligible.length === 0) {
        console.warn(`Sin almacén elegible para ${fulfillmentType}, se omite una orden.`);
        continue;
      }
      const warehouse = pick(eligible);

      const order = await api("/api/customer/orders", {
        method: "POST",
        token: customer.token,
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: {
          companyId: COMPANY_ID,
          warehouseId: warehouse.warehouseId,
          fulfillmentType,
          addressId: fulfillmentType === "DELIVERY" ? customer.addressId : null,
          notes: null,
        },
      });

      const statusWeights =
        fulfillmentType === "DELIVERY"
          ? [
              ["FULFILLED", 83.6],
              ["CANCELLED", 8.6],
              ["RESERVED", 7.8],
            ]
          : [
              ["FULFILLED", 69.6],
              ["CANCELLED", 15.2],
              ["RESERVED", 15.2],
            ];
      const targetStatus = weightedPick(statusWeights);

      if (targetStatus === "CANCELLED") {
        await api(`/api/customer/orders/${order.id}/cancel`, { method: "POST", token: customer.token, body: {} });
      } else if (targetStatus === "FULFILLED") {
        const method = fulfillmentType === "DELIVERY" ? "COD" : "CASH";
        const payment = await api(`/api/customer/orders/${order.id}/payments`, {
          method: "POST",
          token: customer.token,
          body: { method, notes: null },
        });
        await api(`/api/admin/payments/${payment.id}/confirm`, {
          method: "POST",
          token: adminToken,
          body: { reason: null },
        });
        await api(`/api/admin/orders/${order.id}/fulfill`, { method: "POST", token: adminToken, body: {} });
      }

      created.push({ id: order.id, orderNumber: order.orderNumber, targetDay: dateKey(targetDay), status: targetStatus, fulfillmentType });
      process.stdout.write(".");
    } catch (error) {
      console.warn(`\nOrden fallida (${dateKey(targetDay)}): ${error.message}`);
    }
  }

  console.log(`\n${created.length} órdenes creadas vía HTTP real.`);

  if (created.length > 0) {
    const byDay = new Map();
    for (const entry of created) {
      if (!byDay.has(entry.targetDay)) byDay.set(entry.targetDay, []);
      byDay.get(entry.targetDay).push(entry.id);
    }

    console.log("\n-- BEFORE (created_at actual, recién insertado por la API) --");
    const beforeIds = created.map((c) => c.id);
    const before = await pg1.query(`select id, order_number, created_at from orders where id = any($1) order by created_at`, [beforeIds]);
    for (const row of before.rows) console.log(`${row.order_number}: ${row.created_at.toISOString()}`);

    for (const [day, ids] of byDay) {
      const timestamps = ids.map(() => businessHourTimestamp(day).toISOString());
      await pg1.query(
        `update orders set created_at = t.ts::timestamptz
         from (select unnest($1::uuid[]) as id, unnest($2::text[]) as ts) as t
         where orders.id = t.id`,
        [ids, timestamps],
      );
    }

    console.log("\n-- AFTER (created_at reescrito a la fecha objetivo) --");
    const after = await pg1.query(`select id, order_number, created_at from orders where id = any($1) order by created_at`, [beforeIds]);
    for (const row of after.rows) console.log(`${row.order_number}: ${row.created_at.toISOString()}`);
  }

  if (!isTestRun) {
    console.log("\n-- Conteo final por día (2026-09-01..22, ECOMMERCE) --");
    const finalCounts = await pg1.query(
      `select date_trunc('day', created_at) as day, count(*) as n
       from orders
       where order_channel = 'ECOMMERCE' and created_at >= $1 and created_at < $2
       group by 1 order by 1`,
      [RANGE_START.toISOString(), RANGE_END.toISOString()],
    );
    const seen = new Set(finalCounts.rows.map((r) => dateKey(new Date(r.day))));
    for (const row of finalCounts.rows) console.log(`${dateKey(new Date(row.day))}: ${row.n}`);
    const gaps = days.map(dateKey).filter((k) => !seen.has(k));
    console.log(gaps.length === 0 ? "Sin huecos: todos los días 09-01..09-22 tienen al menos una orden ECOMMERCE." : `HUECOS DETECTADOS: ${gaps.join(", ")}`);

    console.log("\n-- Stock final de las variantes usadas en este seed --");
    const usedVariantIds = [...new Set(variants.map((v) => v.id))];
    const stock = await pg1.query(
      `select p.name as product_name, pv.sku, s.available_quantity, s.physical_quantity, s.committed_quantity
       from inventory_stocks s
       join product_variants pv on pv.id = s.variant_id
       join products p on p.id = pv.product_id
       where s.variant_id = any($1)
       order by s.available_quantity asc
       limit 15`,
      [usedVariantIds],
    );
    for (const row of stock.rows) {
      console.log(`${row.product_name} (${row.sku}): disponible=${row.available_quantity} físico=${row.physical_quantity} comprometido=${row.committed_quantity}`);
    }
    const negative = stock.rows.filter((r) => Number(r.available_quantity) < 0 || Number(r.physical_quantity) < 0);
    console.log(negative.length === 0 ? "Sin stock negativo en las variantes usadas." : `STOCK NEGATIVO EN: ${negative.map((r) => r.sku).join(", ")}`);
  }

  await pg1.end();
}

await main();

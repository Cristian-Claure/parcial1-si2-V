#!/usr/bin/env node
// Demo reproducible de la Fase 3 (reportes dinámicos y exportación), solo vía HTTP.
//
// Con los propietarios MAX (Urbano Boutique), PLUS (Andina Moda) y FREE (Primer Paso) de las
// tiendas de muestra arma 3 reportes distintos con el constructor, compara sus cifras contra
// SQL de referencia escrito aparte, verifica el rechazo a FREE (403 PLAN_LIMIT_*), exporta
// XLSX y PDF y valida los archivos (abre el XLSX con exceljs y extrae texto del PDF).
// Sale con código 1 si algo falla.
//
// Credenciales: VELORA_DEMO_{MAX,PLUS,FREE}_{EMAIL,PASSWORD} desde el entorno o el .env local
// (nunca se imprimen). DATABASE_URL para las consultas de referencia (solo lectura).
//
// Uso (con el backend corriendo y `pnpm build:packages` hecho):
//   node scripts/demo-reportes.mjs
//   $env:VELORA_DEMO_API_BASE="http://127.0.0.1:18080"; node scripts/demo-reportes.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const requireBack = createRequire(join(root, "apps/back/package.json"));
const requireDb = createRequire(join(root, "packages/database/package.json"));
const ExcelJS = requireBack("exceljs");
const pg = requireDb("pg");

const fileEnv = (() => {
  const file = join(root, ".env");
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
})();
const env = (name) => process.env[name]?.trim() || fileEnv[name] || "";

const API = (env("VELORA_DEMO_API_BASE") || "http://127.0.0.1:8080").replace(/\/$/, "");
const LOCAL = "America/La_Paz";
const OUT = join(tmpdir(), "velora-demo-reportes");
const results = [];

function check(label, ok, detail = "") {
  results.push({ label, ok: Boolean(ok) });
  console.log(`${ok ? "  ✔" : "  ✘"} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function api(method, path, { token, body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("json") || !response.ok) {
    const text = await response.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: response.status, data, type };
  }
  return { status: response.status, buffer: Buffer.from(await response.arrayBuffer()), type };
}

async function owner(tier, slug) {
  const email = env(`VELORA_DEMO_${tier}_EMAIL`); const password = env(`VELORA_DEMO_${tier}_PASSWORD`);
  if (!email || !password) throw new Error(`Faltan VELORA_DEMO_${tier}_EMAIL / VELORA_DEMO_${tier}_PASSWORD en el entorno o en el .env local.`);
  const login = await api("POST", "/api/auth/login", { body: { email, password } });
  if (login.status !== 200) throw new Error(`No se pudo iniciar sesión con la cuenta ${tier} (HTTP ${login.status}).`);
  const token = login.data.accessToken;
  const companies = await api("GET", "/api/admin/companies", { token });
  const company = companies.data?.find?.((candidate) => candidate.slug === slug);
  if (!company) throw new Error(`La cuenta ${tier} no administra la tienda ${slug}.`);
  return { token, company };
}

/** Texto de un PDF con fuentes estándar (streams Flate + operadores Tj/TJ en WinAnsi). */
function pdfText(buffer) {
  const source = buffer.toString("latin1");
  if (!source.startsWith("%PDF-") || !source.trimEnd().endsWith("%%EOF")) return null;
  const decoder = new TextDecoder("windows-1252");
  const out = [];
  for (const match of source.matchAll(/stream\r?\n/g)) {
    const start = match.index + match[0].length;
    const end = source.indexOf("endstream", start);
    let body = buffer.subarray(start, end);
    try { body = inflateSync(body); } catch { /* sin comprimir */ }
    for (const op of body.toString("latin1").matchAll(/\[((?:[^\]\\]|\\.)*)\]\s*TJ|<([0-9a-fA-F]*)>\s*Tj/g)) {
      const hexes = op[1] !== undefined ? [...op[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((part) => part[1]) : [op[2]];
      out.push(hexes.map((hex) => decoder.decode(Buffer.from(hex, "hex"))).join(""));
    }
  }
  return { text: out.join("\n"), pages: (source.match(/\/Type\s*\/Page[^s]/g) ?? []).length };
}

async function validXlsx(buffer, expectedSheets) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const names = workbook.worksheets.map((sheet) => sheet.name);
  const data = workbook.worksheets[1];
  return { names, ok: expectedSheets.every((name) => names.includes(name)) && data?.views?.[0]?.state === "frozen" && Boolean(data?.autoFilter), workbook };
}

const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
const windowOf = (result) => [`${result.from}`, `${result.to}`];

const SCOPE = "join orders o on o.id = p.order_id join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id where s.company_id = $1";
const WINDOW = (column) => `${column} >= ($2::date)::timestamp at time zone '${LOCAL}' and ${column} < ($3::date + 1)::timestamp at time zone '${LOCAL}'`;

async function main() {
  const databaseUrl = env("DATABASE_URL");
  if (!databaseUrl) throw new Error("Falta DATABASE_URL para las consultas de referencia.");
  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  await db.query("set default_transaction_read_only = on");
  mkdirSync(OUT, { recursive: true });
  try {
    console.log(`Demo de reportes Fase 3 contra ${API}\n`);
    const max = await owner("MAX", "urbano-boutique");
    const plus = await owner("PLUS", "andina-moda");
    const free = await owner("FREE", "primer-paso");
    const ref = async (sql, company, result, extra = []) => (await db.query(sql, [company.id, ...windowOf(result), ...extra])).rows;

    // 1) MAX · venta neta y pedidos por mes y sucursal (12 meses), vs SQL y vs el resumen.
    console.log("1) MAX · Urbano Boutique: venta neta y pedidos por mes × sucursal (12 meses)");
    const r1 = await api("POST", "/api/admin/reports/query", { token: max.token, body: { companyId: max.company.id, preset: "LAST_365", dimensions: ["DATE_MONTH", "STORE"], measures: ["NET_SALES", "ORDERS"], limit: 500 } });
    check("consulta del constructor (200)", r1.status === 200, `HTTP ${r1.status}, ${r1.data?.rows?.length ?? 0} filas`);
    const expected1 = await ref(`
      with ev as (select p.order_id, s.id store_id, p.paid_at ts, p.amount amt, true sale from payments p ${SCOPE} and p.status in ('PAID', 'REFUNDED') and p.paid_at is not null
                  union all select p.order_id, s.id, p.refunded_at, -p.amount, false from payments p ${SCOPE} and p.status = 'REFUNDED' and p.refunded_at is not null)
      select to_char(ts at time zone '${LOCAL}', 'YYYY-MM') || '|' || store_id k, round(sum(amt), 2) net, count(distinct order_id) filter (where sale) orders
      from ev where ${WINDOW("ts")} group by 1`, max.company, r1.data);
    const byKey1 = new Map(r1.data.rows.map((row) => [row.keys.join("|"), row.values]));
    const mismatches1 = expected1.filter((row) => !near(byKey1.get(row.k)?.[0] ?? 0, row.net) || Number(byKey1.get(row.k)?.[1] ?? 0) !== Number(row.orders));
    check("cifras por mes × sucursal = SQL de referencia", mismatches1.length === 0 && expected1.length === byKey1.size, `${expected1.length} combinaciones, ${mismatches1.length} diferencias`);
    const overview = await api("GET", `/api/admin/reports/overview?companyId=${max.company.id}&from=${r1.data.from}&to=${r1.data.to}`, { token: max.token });
    const netKpi = overview.data?.kpis?.find((kpi) => kpi.key === "NET_SALES")?.value;
    check("total de venta neta = KPI del resumen (misma definición)", near(r1.data.totals[0], netKpi), `Bs ${r1.data.totals[0]} vs Bs ${netKpi}`);

    // 2) MAX · categoría × talla en la sucursal principal con comparación de período.
    console.log("\n2) MAX · unidades y venta neta por categoría × talla, filtrado por sucursal, vs período anterior");
    const store = (await db.query(`select s.id::text id, s.name from stores s join warehouses w on w.store_id = s.id join orders o on o.warehouse_id = w.id where s.company_id = $1 group by 1, 2 order by count(*) desc limit 1`, [max.company.id])).rows[0];
    const body2 = { companyId: max.company.id, preset: "LAST_90", dimensions: ["CATEGORY", "SIZE"], measures: ["UNITS", "NET_SALES"], filters: [{ dimension: "STORE", values: [store.id] }], compareWithPrevious: true, sort: { by: "UNITS", direction: "DESC" }, limit: 200 };
    const r2 = await api("POST", "/api/admin/reports/query", { token: max.token, body: body2 });
    check("consulta con filtro y comparación (200)", r2.status === 200 && r2.data.previousTotals !== null, `${r2.data?.rows?.length ?? 0} filas · sucursal ${store.name}`);
    const expected2 = await ref(`
      select pr.category_id || '|' || coalesce(nullif(btrim(pv.size), ''), 'Sin talla') k, sum(i.quantity) units
      from order_items i join product_variants pv on pv.id = i.variant_id join products pr on pr.id = pv.product_id
      where i.order_id in (select p.order_id from payments p ${SCOPE} and s.id = $4::uuid and p.status = 'PAID' and ${WINDOW("p.paid_at")}) group by 1`, max.company, r2.data, [store.id]);
    const byKey2 = new Map(r2.data.rows.map((row) => [row.keys.join("|"), row.values[0]]));
    const mismatches2 = expected2.filter((row) => Number(byKey2.get(row.k) ?? -1) !== Number(row.units));
    check("unidades por categoría × talla = SQL de referencia", mismatches2.length === 0, `${expected2.length} combinaciones, ${mismatches2.length} diferencias`);

    // 3) PLUS · valor de inventario por sucursal × categoría; ADVANCED bloqueado.
    console.log("\n3) PLUS · Andina Moda: valor de inventario por sucursal × categoría (foto actual)");
    const r3 = await api("POST", "/api/admin/reports/query", { token: plus.token, body: { companyId: plus.company.id, dimensions: ["STORE", "CATEGORY"], measures: ["INVENTORY_VALUE"], limit: 500 } });
    const expected3 = (await db.query(`select s.id || '|' || pr.category_id k, round(sum(st.available_quantity * pv.price), 2) v from inventory_stocks st join product_variants pv on pv.id = st.variant_id
      join products pr on pr.id = pv.product_id join warehouses w on w.id = st.warehouse_id join stores s on s.id = w.store_id where s.company_id = $1 group by 1`, [plus.company.id])).rows;
    const byKey3 = new Map((r3.data?.rows ?? []).map((row) => [row.keys.join("|"), row.values[0]]));
    check("valor de inventario = SQL de referencia", r3.status === 200 && expected3.every((row) => near(byKey3.get(row.k) ?? -1, row.v)), `${expected3.length} combinaciones`);
    const advanced = await api("POST", "/api/admin/reports/query", { token: plus.token, body: { companyId: plus.company.id, dimensions: ["CUSTOMER"], measures: ["NET_SALES"] } });
    check("PLUS no usa dimensiones ADVANCED (403, disponible en MAX)", advanced.status === 403 && advanced.data?.details?.requiredPlan === "MAX", `HTTP ${advanced.status} ${advanced.data?.code ?? ""}`);
    const clamped = await api("POST", "/api/admin/reports/query", { token: plus.token, body: { companyId: plus.company.id, from: "2020-01-01", to: r3.data?.to ?? "2026-01-01", dimensions: [], measures: ["NET_SALES"] } });
    check("PLUS: el backend recorta a 365 días de historial", clamped.data?.policy?.clamped === true, `desde ${clamped.data?.from}`);

    // 4) FREE: constructor y exportación rechazados.
    console.log("\n4) FREE · Primer Paso: constructor y exportación bloqueados");
    const freeQuery = await api("POST", "/api/admin/reports/query", { token: free.token, body: { companyId: free.company.id, dimensions: [], measures: ["NET_SALES"] } });
    const freeExport = await api("GET", `/api/admin/reports/overview/export?companyId=${free.company.id}&format=pdf`, { token: free.token });
    check("FREE recibe 403 PLAN_LIMIT_REPORT_FEATURE en el constructor", freeQuery.status === 403 && freeQuery.data?.code === "PLAN_LIMIT_REPORT_FEATURE", `HTTP ${freeQuery.status}`);
    check("FREE recibe 403 al exportar el resumen", freeExport.status === 403 && freeExport.data?.code === "PLAN_LIMIT_REPORT_FEATURE", `HTTP ${freeExport.status}`);
    const foreign = await api("POST", "/api/admin/reports/query", { token: plus.token, body: { companyId: max.company.id, dimensions: [], measures: ["NET_SALES"] } });
    check("companyId ajeno: 404 sin datos", foreign.status === 404, `HTTP ${foreign.status}`);

    // 5) Exportaciones válidas.
    console.log("\n5) Exportación XLSX y PDF desde el backend");
    const xlsx = await api("POST", "/api/admin/reports/query/export?format=xlsx", { token: max.token, body: body2 });
    const xlsxCheck = xlsx.buffer ? await validXlsx(xlsx.buffer, ["Resumen", "Datos"]) : { ok: false, names: [] };
    if (xlsx.buffer) writeFileSync(join(OUT, "urbano-categoria-talla.xlsx"), xlsx.buffer);
    check("XLSX del constructor: hojas Resumen y Datos, encabezado fijo y autofiltro", xlsxCheck.ok, `hojas: ${xlsxCheck.names.join(", ")}`);
    const pdf = await api("POST", "/api/admin/reports/query/export?format=pdf", { token: max.token, body: body2 });
    const parsed = pdf.buffer ? pdfText(pdf.buffer) : null;
    if (pdf.buffer) writeFileSync(join(OUT, "urbano-categoria-talla.pdf"), pdf.buffer);
    check("PDF del constructor: marca, filtros, totales y número de página", Boolean(parsed && ["Urbano Boutique", "Filtros aplicados", `Sucursal: ${store.name}`, "Total", "Página 1 de"].every((text) => parsed.text.includes(text))), parsed ? `${parsed.pages} página(s)` : "inválido");
    const overviewPdf = await api("GET", `/api/admin/reports/overview/export?companyId=${plus.company.id}&format=pdf`, { token: plus.token });
    const overviewText = overviewPdf.buffer ? pdfText(overviewPdf.buffer) : null;
    if (overviewPdf.buffer) writeFileSync(join(OUT, "andina-resumen.pdf"), overviewPdf.buffer);
    check("PDF del resumen existente (PLUS)", Boolean(overviewText?.text.includes("Indicadores") && overviewText.text.includes("Andina Moda")), overviewText ? `${overviewText.pages} página(s)` : "inválido");
    const overviewXlsx = await api("GET", `/api/admin/reports/overview/export?companyId=${max.company.id}&format=xlsx`, { token: max.token });
    const overviewXlsxCheck = overviewXlsx.buffer ? await validXlsx(overviewXlsx.buffer, ["Resumen", "Indicadores"]) : { ok: false, names: [] };
    if (overviewXlsx.buffer) writeFileSync(join(OUT, "urbano-resumen.xlsx"), overviewXlsx.buffer);
    check("XLSX del resumen existente (MAX)", overviewXlsxCheck.ok, `${overviewXlsxCheck.names.length} hojas`);

    // 6) Definición guardada (ida y vuelta, sin dejar rastro).
    console.log("\n6) Definiciones guardadas");
    const { companyId: _ignored, ...definition } = body2;
    const name = `Demo Fase 3 ${Date.now()}`;
    const saved = await api("POST", "/api/admin/reports/definitions", { token: max.token, body: { companyId: max.company.id, name, definition } });
    const listed = await api("GET", `/api/admin/reports/definitions?companyId=${max.company.id}`, { token: max.token });
    const removed = saved.data?.id ? await api("DELETE", `/api/admin/reports/definitions/${saved.data.id}`, { token: max.token }) : { status: 0 };
    check("guardar, listar y eliminar una definición", saved.status === 201 && listed.data?.some?.((item) => item.name === name) && removed.status === 204, `HTTP ${saved.status}/${listed.status}/${removed.status}`);
  } finally {
    await db.end();
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} verificaciones correctas. Archivos en ${OUT}`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(`\n✘ ${error.message}`);
  process.exit(1);
});

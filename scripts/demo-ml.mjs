#!/usr/bin/env node
// Demo reproducible de la Fase 4 (Machine Learning local), vía HTTP.
//
// Con el propietario MAX de Urbano Boutique lanza un entrenamiento REAL (servicio Python local),
// espera a que termine (máximo 10 minutos, consultando cada 15 s), verifica que haya resultados con
// métricas coherentes (y la venta real del pronóstico contra SQL de referencia), que FREE y PLUS
// reciban 403 y que ese propietario no pueda leer los resultados ML de VÉLORA. Sale con código 1 si falla.
//
// Requisitos: backend (pnpm dev:back) y servicio ML (pnpm dev:ml) corriendo; credenciales
// VELORA_DEMO_{MAX,PLUS,FREE}_{EMAIL,PASSWORD} en el entorno o en el .env local (no se imprimen).
//
//   node scripts/demo-ml.mjs

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pg = createRequire(join(root, "packages/database/package.json"))("pg");
const fileEnv = (() => {
  const file = join(root, ".env");
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
})();
const env = (name) => process.env[name]?.trim() || fileEnv[name] || "";
const API = (env("VELORA_DEMO_API_BASE") || "http://127.0.0.1:8080").replace(/\/$/, "");
const TIMEOUT_MS = 10 * 60_000;
const POLL_MS = 15_000;
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
  const text = await response.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
}

async function owner(tier, slug) {
  const email = env(`VELORA_DEMO_${tier}_EMAIL`); const password = env(`VELORA_DEMO_${tier}_PASSWORD`);
  if (!email || !password) throw new Error(`Faltan VELORA_DEMO_${tier}_EMAIL / VELORA_DEMO_${tier}_PASSWORD.`);
  const login = await api("POST", "/api/auth/login", { body: { email, password } });
  if (login.status !== 200) throw new Error(`No se pudo iniciar sesión con la cuenta ${tier} (HTTP ${login.status}).`);
  const companies = await api("GET", "/api/admin/companies", { token: login.data.accessToken });
  const company = companies.data?.find?.((candidate) => candidate.slug === slug);
  if (!company) throw new Error(`La cuenta ${tier} no administra ${slug}.`);
  return { token: login.data.accessToken, company };
}

const finite = (value) => typeof value === "number" && Number.isFinite(value);

async function main() {
  const db = new pg.Client({ connectionString: env("DATABASE_URL") });
  await db.connect();
  await db.query("set default_transaction_read_only = on");
  try {
    console.log(`Demo de ML Fase 4 contra ${API}\n`);
    const max = await owner("MAX", "urbano-boutique");
    const plus = await owner("PLUS", "andina-moda");
    const free = await owner("FREE", "primer-paso");
    const velora = (await db.query("select id from companies where slug = 'velora'")).rows[0]?.id;

    console.log("1) Servicio y entrenamiento real (Urbano Boutique, MAX)");
    const before = await api("GET", `/api/admin/ml/overview?companyId=${max.company.id}`, { token: max.token });
    check("el servicio ML local responde", before.data?.service?.available === true, before.data?.service?.available ? "127.0.0.1:8090" : "inicia el servicio con: pnpm dev:ml");
    if (!before.data?.service?.available) return;
    let started = await api("POST", "/api/admin/ml/runs", { token: max.token, body: { companyId: max.company.id } });
    if (started.status === 409) {
      console.log("  · ya había un entrenamiento en curso; se espera y se reintenta");
      await sleep(POLL_MS * 2);
      started = await api("POST", "/api/admin/ml/runs", { token: max.token, body: { companyId: max.company.id } });
    }
    check("POST /api/admin/ml/runs responde 202 con 4 corridas", started.status === 202 && Object.keys(started.data?.runIds ?? {}).length === 4, `HTTP ${started.status}`);
    if (started.status !== 202) return;
    const runIds = started.data.runIds;
    const deadline = Date.now() + TIMEOUT_MS;
    const begin = Date.now();
    let runs = {};
    for (;;) {
      for (const [model, id] of Object.entries(runIds)) runs[model] = (await api("GET", `/api/admin/ml/runs/${id}?companyId=${max.company.id}`, { token: max.token })).data;
      const pending = Object.values(runs).filter((run) => ["QUEUED", "RUNNING"].includes(run?.status));
      if (!pending.length || Date.now() > deadline) break;
      console.log(`  · ${pending.length} modelo(s) en curso… (${Math.round((Date.now() - begin) / 1000)} s)`);
      await sleep(POLL_MS);
    }
    const statuses = Object.entries(runs).map(([model, run]) => `${model}=${run?.status}`).join(", ");
    check("las 4 corridas terminan en SUCCEEDED en menos de 10 minutos", Object.values(runs).every((run) => run?.status === "SUCCEEDED"), `${Math.round((Date.now() - begin) / 1000)} s · ${statuses}`);

    console.log("\n2) Resultados y métricas coherentes");
    const forecast = (await api("GET", `/api/admin/ml/forecast?companyId=${max.company.id}`, { token: max.token })).data;
    const fm = forecast?.run?.metrics ?? {};
    const backtest = forecast?.points?.filter((point) => point.kind === "BACKTEST") ?? [];
    const future = forecast?.points?.filter((point) => point.kind === "FORECAST") ?? [];
    check("pronóstico: corrida nueva, 90 días de prueba y 30 de pronóstico con bandas", forecast?.run?.id === runIds.SALES_FORECAST && backtest.length === 90 && future.length === 30 && future.every((point) => point.upper >= point.lower && point.predicted >= 0));
    const best = fm.test?.baselines?.[fm.best_baseline];
    check("pronóstico: MAE/RMSE/sMAPE finitos y comparados con 3 referencias", finite(fm.test?.model?.mae) && Object.keys(fm.test?.baselines ?? {}).length === 3,
      `${fm.selected?.name} MAE ${fm.test?.model?.mae} vs ${fm.best_baseline} ${best?.mae} → ${fm.beats_baselines ? "supera" : "NO supera"} a la referencia`);
    const [{ net }] = (await db.query(`
      with ev as (select p.paid_at ts, p.amount amt from payments p join orders o on o.id = p.order_id join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id
                  where s.company_id = $1 and p.status in ('PAID','REFUNDED') and p.paid_at is not null
                  union all select p.refunded_at, -p.amount from payments p join orders o on o.id = p.order_id join warehouses w on w.id = o.warehouse_id join stores s on s.id = w.store_id
                  where s.company_id = $1 and p.status = 'REFUNDED' and p.refunded_at is not null)
      select coalesce(sum(amt), 0)::float8 net from ev where (ts at time zone 'America/La_Paz')::date between $2 and $3`, [max.company.id, backtest[0]?.day, backtest.at(-1)?.day])).rows;
    const actualSum = backtest.reduce((sum, point) => sum + (point.actual ?? 0), 0);
    check("pronóstico: la venta real usada = SQL de referencia (pagos − reembolsos)", Math.abs(actualSum - net) < 0.5, `Bs ${actualSum.toFixed(2)} vs Bs ${net.toFixed(2)}`);

    const risk = (await api("GET", `/api/admin/ml/cancel-risk?companyId=${max.company.id}`, { token: max.token })).data;
    const rt = risk?.run?.metrics?.test ?? {};
    const confusion = rt.model?.confusion ?? {};
    check("riesgo: ROC-AUC y PR-AUC en [0,1], matriz = tamaño de prueba", rt.model?.roc_auc >= 0 && rt.model?.roc_auc <= 1 && rt.model?.pr_auc <= 1
      && confusion.tn + confusion.fp + confusion.fn + confusion.tp === risk.run.metrics.split?.test,
      `ROC-AUC ${rt.model?.roc_auc} (logística ${rt.logistic?.roc_auc}, mayoritaria 0.5) · PR-AUC ${rt.model?.pr_auc} vs ${rt.majority?.pr_auc}`);
    check("riesgo: pedidos abiertos puntuados y ordenados", (risk?.orders ?? []).every((order, index, all) => index === 0 || all[index - 1].probability >= order.probability), `${risk?.orders?.length ?? 0} pedidos`);

    const segments = (await api("GET", `/api/admin/ml/segments?companyId=${max.company.id}`, { token: max.token })).data;
    const sm = segments?.run?.metrics ?? {};
    const share = (sm.profiles ?? []).reduce((sum, profile) => sum + profile.revenue_share, 0);
    check("segmentos: k entre 2 y 8, todos los clientes asignados y % de ingresos = 100", sm.k >= 2 && sm.k <= 8 && segments.customers.length === segments.run.rowsUsed && Math.abs(share - 1) < 0.01,
      `k=${sm.k} · ${(sm.profiles ?? []).map((profile) => profile.name).join(", ")} · ARI vs sembrado ${sm.seeded_comparison?.ari ?? "n/d"}`);

    const anomalies = (await api("GET", `/api/admin/ml/anomalies?companyId=${max.company.id}`, { token: max.token })).data;
    const am = anomalies?.run?.metrics ?? {};
    check("anomalías: un día por fila y cada marcado con su z", anomalies?.days?.length === anomalies?.run?.rowsUsed && anomalies.days.filter((day) => day.isAnomaly).every((day) => Math.abs(day.score) >= am.threshold),
      `${am.anomalies} días atípicos · fechas sembradas detectadas ${am.seeded_detected}/${am.seeded_special_days} · sin explicación ${am.unexplained_false_positives}`);

    console.log("\n3) Plan y aislamiento");
    for (const [label, account] of [["FREE", free], ["PLUS", plus]]) {
      const read = await api("GET", `/api/admin/ml/overview?companyId=${account.company.id}`, { token: account.token });
      const start = await api("POST", "/api/admin/ml/runs", { token: account.token, body: { companyId: account.company.id } });
      check(`${label} recibe 403 PLAN_LIMIT_REPORT_FEATURE (lectura y entrenamiento)`, read.status === 403 && start.status === 403 && read.data?.code === "PLAN_LIMIT_REPORT_FEATURE", `HTTP ${read.status}/${start.status}`);
    }
    const foreign = await Promise.all(["overview", "forecast", "segments", "cancel-risk", "anomalies"].map((path) => api("GET", `/api/admin/ml/${path}?companyId=${velora}`, { token: max.token })));
    check("el propietario de Urbano no lee los resultados ML de VÉLORA (404)", Boolean(velora) && foreign.every((result) => result.status === 404), foreign.map((result) => result.status).join("/"));
  } finally {
    await db.end();
  }
}

main()
  .then(() => {
    const failed = results.filter((result) => !result.ok);
    console.log(`\n${results.length - failed.length}/${results.length} verificaciones correctas.`);
    process.exit(failed.length || results.length === 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error(`\n✘ ${error.message}`);
    process.exit(1);
  });

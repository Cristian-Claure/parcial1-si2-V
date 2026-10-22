#!/usr/bin/env node
// Lanzador del servicio ML local (Fase 4). Invoca SIEMPRE el Python del venv por ruta (sin activarlo).
// No forma parte de postinstall, EAS ni Azure: solo lo corre quien lo pide.
//
//   pnpm ml:setup                 crea apps/ml/.venv e instala requirements.txt
//   pnpm dev:ml                   API local en 127.0.0.1:8090
//   pnpm ml:train -- --company urbano-boutique [--models SALES_FORECAST ...]
//   pnpm ml:test                  pytest
//   pnpm ml:db-role               crea el rol velora_ml de mínimo privilegio y guarda VELORA_ML_DATABASE_URL en .env

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mlDir = join(root, "apps", "ml");
const venvPython = process.platform === "win32" ? join(mlDir, ".venv", "Scripts", "python.exe") : join(mlDir, ".venv", "bin", "python");
const [command, ...rest] = process.argv.slice(2);
const args = rest[0] === "--" ? rest.slice(1) : rest;

function run(executable, argv, options = {}) {
  const result = spawnSync(executable, argv, { cwd: mlDir, stdio: "inherit", env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" }, ...options });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function requireVenv() {
  if (!existsSync(venvPython)) {
    console.error("No existe apps/ml/.venv. Ejecuta primero: pnpm ml:setup");
    process.exit(1);
  }
}

function envFile() {
  const file = join(root, ".env");
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function setEnvValue(name, value) {
  const file = join(root, ".env");
  const content = envFile();
  const line = `${name}=${value}`;
  const next = new RegExp(`^${name}=.*$`, "m").test(content) ? content.replace(new RegExp(`^${name}=.*$`, "m"), line) : `${content.replace(/\s*$/, "")}\n${line}\n`;
  writeFileSync(file, next);
}

async function createRole() {
  const databaseUrl = process.env.DATABASE_URL || /^DATABASE_URL=(.*)$/m.exec(envFile())?.[1]?.trim();
  if (!databaseUrl) throw new Error("Falta DATABASE_URL.");
  const pg = createRequire(join(root, "packages", "database", "package.json"))("pg");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const password = randomBytes(24).toString("base64url");
  const database = new URL(databaseUrl).pathname.slice(1);
  try {
    const exists = (await client.query("select 1 from pg_roles where rolname = 'velora_ml'")).rowCount > 0;
    await client.query(`${exists ? "alter" : "create"} role velora_ml with login password '${password}' nosuperuser nocreatedb nocreaterole`);
    await client.query(`grant connect on database "${database}" to velora_ml`);
    await client.query("grant usage on schema public to velora_ml");
    // Lectura mínima: solo las tablas (y columnas de clientes) que usan los modelos.
    await client.query("grant select on companies, stores, warehouses, orders, order_items, payments to velora_ml");
    await client.query("grant select (id, email, created_at) on app_users to velora_ml");
    // Escritura SOLO en ml_*.
    await client.query("grant select, insert, update, delete on ml_runs, ml_forecasts, ml_customer_segments, ml_anomalies, ml_order_risk to velora_ml");
    await client.query("grant usage, select on all sequences in schema public to velora_ml");
  } finally {
    await client.end();
  }
  const url = new URL(databaseUrl);
  url.username = "velora_ml";
  url.password = password;
  setEnvValue("VELORA_ML_DATABASE_URL", url.toString());
  console.log("Rol velora_ml listo (SELECT en tablas operativas, DML solo en ml_*). VELORA_ML_DATABASE_URL guardada en .env.");
}

switch (command) {
  case "setup": {
    const candidates = process.platform === "win32" ? [["py", ["-3"]], ["python", []], ["python3", []]] : [["python3", []], ["python", []]];
    const found = candidates.find(([exe, pre]) => spawnSync(exe, [...pre, "--version"], { stdio: "ignore" }).status === 0);
    if (!found) { console.error("No se encontró Python 3.11+. En Windows: winget install -e --id Python.Python.3.12"); process.exit(1); }
    if (!existsSync(venvPython) && run(found[0], [...found[1], "-m", "venv", ".venv"]) !== 0) process.exit(1);
    process.exit(run(venvPython, ["-m", "pip", "install", "--disable-pip-version-check", "-r", "requirements.txt"]));
    break;
  }
  case "serve": requireVenv(); process.exit(run(venvPython, ["-m", "velora_ml", "serve"])); break;
  case "train": requireVenv(); process.exit(run(venvPython, ["-m", "velora_ml", "train", ...args])); break;
  case "test": requireVenv(); process.exit(run(venvPython, ["-m", "pytest", "-q", ...args])); break;
  case "db-role": await createRole(); break;
  default:
    console.error("Uso: node scripts/ml.mjs <setup|serve|train|test|db-role> [...]");
    process.exit(1);
}

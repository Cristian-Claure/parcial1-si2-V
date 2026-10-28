import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const THEME_DIR = path.join(SRC, "shared", "theme");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const files = sourceFiles(SRC);

test("ningún color hexadecimal fuera de shared/theme/", () => {
  const offenders = files
    .filter((file) => !file.startsWith(THEME_DIR))
    .flatMap((file) => readFileSync(file, "utf8").split("\n").map((line, index) => ({ file, line, index })))
    .filter(({ line }) => /#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?(?:[0-9A-Fa-f]{2})?\b/.test(line.replace(/\/\/.*$/, "")))
    .map(({ file, index }) => `${path.relative(SRC, file)}:${index + 1}`);
  assert.deepEqual(offenders, []);
});

test("ningún texto VÉLORA en la app (solo los datos de esa tienda, que vienen del backend)", () => {
  // Se buscan textos visibles: literales con "VÉLORA"/"Vélora"/"VELORA" como palabra (no nombres de
  // variables de entorno como VELORA_PUBLIC_BACKEND_URL ni el paquete @velora/contracts).
  const pattern = /V[ÉE]LORA(?![_A-Z])|Vélora/;
  const offenders = files
    .flatMap((file) => readFileSync(file, "utf8").split("\n").map((line, index) => ({ file, line, index })))
    .filter(({ line }) => pattern.test(line))
    .map(({ file, index, line }) => `${path.relative(SRC, file)}:${index + 1}: ${line.trim()}`);
  assert.deepEqual(offenders, []);
});

test("el monograma de VÉLORA solo se usa en CompanyLogo y condicionado al slug de esa tienda", () => {
  const users = files.filter((file) => readFileSync(file, "utf8").includes("velora-mark.png"));
  assert.deepEqual(users.map((file) => path.relative(SRC, file).replace(/\\/g, "/")), ["shared/ui.tsx"]);
  const ui = readFileSync(path.join(SRC, "shared", "ui.tsx"), "utf8");
  assert.match(ui, /company\.slug === EDITORIAL_MARK_SLUG/);
  assert.match(ui, /if \(company\.logoUrl\)[\s\S]*if \(company\.slug === EDITORIAL_MARK_SLUG\)/, "el logo propio tiene prioridad sobre el monograma");
});

import assert from "node:assert/strict";
import test from "node:test";
import { resolveStorefront } from "../src/core/company/storefrontSelection.ts";

const companies = [{ id: "10000000-0000-4000-8000-000000000001" }, { id: "10000000-0000-4000-8000-000000000002" }];

test("sin pin ni elección previa no fija ninguna tienda (aunque haya una sola)", () => {
  assert.deepEqual(resolveStorefront(companies, null, null), { companyId: null, pinned: false });
  assert.deepEqual(resolveStorefront([companies[0]!], null, null), { companyId: null, pinned: false });
});

test("conserva la última tienda elegida si sigue activa", () => {
  assert.deepEqual(resolveStorefront(companies, null, companies[1]!.id), { companyId: companies[1]!.id, pinned: false });
  assert.deepEqual(resolveStorefront(companies, null, "eliminada"), { companyId: null, pinned: false });
});

test("un pin válido de la instalación manda y bloquea el cambio", () => {
  assert.deepEqual(resolveStorefront(companies, companies[0]!.id, companies[1]!.id), { companyId: companies[0]!.id, pinned: true });
  assert.deepEqual(resolveStorefront(companies, "inexistente", companies[1]!.id), { companyId: companies[1]!.id, pinned: false });
});

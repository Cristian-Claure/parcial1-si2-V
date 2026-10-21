import assert from "node:assert/strict";
import test from "node:test";
import { tryOnErrorMessage } from "../src/features/try-on/tryOnQuota.ts";

test("translates PLAN_LIMIT_TRY_ON with the limit and the store name", () => {
  const error = Object.assign(new Error("402"), { code: "PLAN_LIMIT_TRY_ON", details: { limit: 3 } });
  assert.equal(tryOnErrorMessage(error, "Bella Moda"), "Alcanzaste tus 3 pruebas del probador de este mes en Bella Moda. Podrás volver a usarlo el próximo mes.");
});

test("keeps other errors as they are", () => {
  assert.equal(tryOnErrorMessage(new Error("Sin conexión"), null), "Sin conexión");
  assert.equal(tryOnErrorMessage("x", null), "No se pudo iniciar el probador virtual.");
});

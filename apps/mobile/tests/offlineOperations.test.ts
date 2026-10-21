import assert from "node:assert/strict";
import test from "node:test";
import { pushOutbox, resolveConflict, type OutboxStore } from "@velora/contracts";
import { entryToRow, rowToEntry, type OutboxRow } from "../src/core/sync/outboxRows.ts";
import { buildCustomerOperation, buildProductOperation } from "../src/features/operations/operationBuilders.ts";

let counter = 0;
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
const company = "10000000-0000-0000-0000-000000000001";
const user = "20000000-0000-4000-8000-000000000001";

test("el formulario de cliente valida con el contrato y arma CUSTOMER_CREATE", () => {
  const bad = buildCustomerOperation({ firstName: "", lastName: "X", phone: "", email: "", taxId: "", customerType: "B2C", businessName: "" }, newId);
  assert.equal(bad.ok, false);
  const good = buildCustomerOperation({ firstName: "Rosa", lastName: "Mendez", phone: "700", email: "", taxId: "123", customerType: "B2C", businessName: "" }, newId);
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.operation.type, "CUSTOMER_CREATE");
    assert.equal(good.value.email, null);
    assert.equal(good.label, "Cliente Rosa Mendez");
  }
});

test("el producto lleva variantes con ids propios y stock inicial solo si hay almacén", () => {
  const built = buildProductOperation({
    name: "Blusa", categoryId: company, description: "", warehouseId: company,
    variants: [{ size: "M", color: "Crema", sku: "bl-01", price: "180,50", stock: "5" }, { size: "L", color: "Crema", sku: "BL-02", price: "180", stock: "" }],
  }, newId);
  assert.equal(built.ok, true);
  if (built.ok) {
    assert.deepEqual(built.value.variants.map((variant) => [variant.sku, variant.price]), [["BL-01", 180.5], ["BL-02", 180]]);
    assert.deepEqual(built.value.initialStock?.map((entry) => entry.quantity), [5]);
    assert.equal(built.value.initialStock?.[0]?.variantId, built.value.variants[0]?.id);
  }
});

test("la fila SQLite conserva la operación y el resultado (ida y vuelta)", () => {
  const built = buildCustomerOperation({ firstName: "Ana", lastName: "Paz", phone: "", email: "ana@test.local", taxId: "", customerType: "B2C", businessName: "" }, newId);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const entry = { clientOperationId: built.operation.clientOperationId, companyId: company, userId: user, operation: built.operation, label: built.label, status: "CONFLICT" as const, attempts: 1, code: "EMAIL_TAKEN", error: "Ya existe", result: { clientOperationId: built.operation.clientOperationId, status: "CONFLICT" as const, code: "EMAIL_TAKEN", message: "Ya existe", entityId: null, version: null, options: ["USE_EXISTING" as const], server: { id: "x" } }, createdAt: "2026-10-21T00:00:00.000Z", updatedAt: "2026-10-21T00:00:00.000Z" };
  assert.deepEqual(rowToEntry(entryToRow(entry)), entry);
  assert.deepEqual(resolveConflict(entry, "USE_EXISTING"), { action: "REMOVE", replaceLocalWith: "x" });
});

test("el motor compartido procesa la cola del teléfono: sin red no gasta intentos y luego aplica", async () => {
  const rows = new Map<string, OutboxRow>();
  const built = buildCustomerOperation({ firstName: "Luz", lastName: "Rojas", phone: "", email: "", taxId: "9", customerType: "B2C", businessName: "" }, newId);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  rows.set(built.operation.clientOperationId, entryToRow({ clientOperationId: built.operation.clientOperationId, companyId: company, userId: user, operation: built.operation, label: built.label, status: "PENDING", attempts: 0, code: null, error: null, result: null, createdAt: "2026-10-21T00:00:00.000Z", updatedAt: "" }));
  const store: OutboxStore = {
    pending: async () => [...rows.values()].map(rowToEntry),
    update: async (id, patch) => { const current = rows.get(id); if (current) rows.set(id, entryToRow({ ...rowToEntry(current), ...patch })); },
    remove: async (id) => { rows.delete(id); },
  };
  const offline = await pushOutbox(store, { push: async () => { throw new Error("sin red"); } }, company, user, () => true);
  assert.equal(offline.offline, true);
  assert.equal([...rows.values()][0]?.attempts, 0);
  const online = await pushOutbox(store, { push: async (_company, operations) => ({ results: operations.map((operation) => ({ clientOperationId: operation.clientOperationId, status: "APPLIED" as const, code: null, message: null, entityId: "e", version: 1, options: [], server: null })) }) }, company, user, () => false);
  assert.equal(online.applied, 1);
  assert.equal(rows.size, 0);
});

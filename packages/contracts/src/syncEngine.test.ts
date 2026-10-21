import { describe, expect, it } from "vitest";
import type { SyncOperation, SyncOperationResult, SyncPullResponse } from "./sync.js";
import { decideTransportError, mirrorChanges, pushOutbox, resolveConflict, type OutboxStore } from "./syncEngine.js";
import type { OutboxEntry } from "./syncEngine.js";

const company = "10000000-0000-0000-0000-000000000001";
const user = "20000000-0000-4000-8000-000000000001";

function entry(index: number, operation?: Partial<SyncOperation>): OutboxEntry {
  const id = `00000000-0000-4000-8000-00000000000${index}`;
  return {
    clientOperationId: id, companyId: company, userId: user, label: `op ${index}`, status: "PENDING", attempts: 0, code: null, error: null, result: null,
    createdAt: `2026-10-21T10:00:0${index}.000Z`, updatedAt: "", operation: { clientOperationId: id, type: "CUSTOMER_CREATE", payload: { id, firstName: "A", lastName: "B" }, ...operation } as SyncOperation,
  };
}

function memoryStore(entries: OutboxEntry[]): OutboxStore & { data: Map<string, OutboxEntry> } {
  const data = new Map(entries.map((item) => [item.clientOperationId, item]));
  return {
    data,
    pending: async () => [...data.values()],
    update: async (id, patch) => { const current = data.get(id); if (current) data.set(id, { ...current, ...patch }); },
    remove: async (id) => { data.delete(id); },
  };
}

const result = (clientOperationId: string, status: SyncOperationResult["status"], extra: Partial<SyncOperationResult> = {}): SyncOperationResult => ({
  clientOperationId, status, code: null, message: null, entityId: null, version: null, options: [], server: null, ...extra,
});

describe("cola genérica de sincronización", () => {
  it("aplica resultados por operación: APPLIED/DUPLICATE salen, CONFLICT espera decisión y REJECTED queda FAILED con código", async () => {
    const store = memoryStore([entry(1), entry(2), entry(3), entry(4)]);
    const sent: string[] = [];
    const summary = await pushOutbox(store, { push: async (_company, operations) => {
      sent.push(...operations.map((operation) => operation.clientOperationId));
      return { results: [
        result(operations[0]!.clientOperationId, "APPLIED", { entityId: "x" }),
        result(operations[1]!.clientOperationId, "DUPLICATE"),
        result(operations[2]!.clientOperationId, "CONFLICT", { code: "EMAIL_TAKEN", options: ["USE_EXISTING", "ADJUST_AND_RETRY", "DISCARD"] }),
        result(operations[3]!.clientOperationId, "REJECTED", { code: "PLAN_LIMIT_PRODUCTS", message: "Límite" }),
      ] };
    } }, company, user, () => false);
    expect(sent).toEqual([entry(1), entry(2), entry(3), entry(4)].map((item) => item.clientOperationId));
    expect(summary).toMatchObject({ applied: 1, duplicates: 1, conflicts: 1, rejected: 1 });
    expect([...store.data.values()].map((item) => [item.status, item.code])).toEqual([["CONFLICT", "EMAIL_TAKEN"], ["FAILED", "PLAN_LIMIT_PRODUCTS"]]);
  });

  it("sin red: vuelve a PENDING sin gastar intentos; con error del servidor llega a FAILED al quinto intento", async () => {
    const store = memoryStore([entry(1)]);
    const summary = await pushOutbox(store, { push: async () => { throw new Error("offline"); } }, company, user, () => true);
    expect(summary.offline).toBe(true);
    expect(store.data.get(entry(1).clientOperationId)).toMatchObject({ status: "PENDING", attempts: 0 });
    expect(decideTransportError({ ...entry(1), attempts: 3 }, false, "500")).toMatchObject({ status: "PENDING", attempts: 4 });
    expect(decideTransportError({ ...entry(1), attempts: 4 }, false, "500")).toMatchObject({ status: "FAILED", attempts: 5 });
  });

  it("resolución de conflictos: ajustar reintenta con el payload corregido; conservar el mío usa la versión del servidor; usar el existente reemplaza lo local", () => {
    const conflicted: OutboxEntry = { ...entry(1), status: "CONFLICT", result: result("x", "CONFLICT", { code: "EMAIL_TAKEN", server: { id: "existente" } }) };
    const adjusted = resolveConflict(conflicted, "ADJUST_AND_RETRY", { email: "otro@test.local" });
    expect(adjusted).toMatchObject({ action: "UPDATE", patch: { status: "PENDING", attempts: 0 } });
    expect(adjusted.action === "UPDATE" ? (adjusted.patch.operation!.payload as { email?: string }).email : null).toBe("otro@test.local");
    expect(resolveConflict(conflicted, "USE_EXISTING")).toEqual({ action: "REMOVE", replaceLocalWith: "existente" });
    const stale: OutboxEntry = { ...entry(2, { type: "PRODUCT_UPDATE", baseVersion: 1, payload: { id: "p", name: "Mío" } } as Partial<SyncOperation>), status: "CONFLICT", result: result("y", "CONFLICT", { code: "VERSION_MISMATCH", server: { version: 4 } }) };
    const keepMine = resolveConflict(stale, "KEEP_MINE");
    expect(keepMine.action === "UPDATE" && (keepMine.patch.operation as { baseVersion: number }).baseVersion).toBe(4);
    expect(resolveConflict(stale, "KEEP_SERVER")).toEqual({ action: "REMOVE", replaceLocalWith: null });
  });

  it("el pull se convierte en upserts del espejo y tombstones en borrados", () => {
    const pull = { companyId: company, cursor: "10", snapshot: false, categories: [{ id: "c1", name: "Mujer", slug: "mujer", parentId: null, active: true }], products: [], stores: [], warehouses: [], customers: [], tombstones: [{ entityType: "PRODUCT", id: "p9" }] } as SyncPullResponse;
    const changes = mirrorChanges(pull);
    expect(changes.upserts.map((record) => record.key)).toEqual([`${company}:CATEGORY:c1`]);
    expect(changes.deletes).toEqual([`${company}:PRODUCT:p9`]);
  });
});

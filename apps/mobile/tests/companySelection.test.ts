import assert from "node:assert/strict";
import test from "node:test";
import { resolveCompanySelection } from "../src/core/company/companySelection.ts";

const companies = [
  { id: "10000000-0000-4000-8000-000000000001", name: "VÉLORA", code: "VELORA", active: true },
  { id: "10000000-0000-4000-8000-000000000002", name: "Otra", code: "OTRA", active: true },
] as never[];

test("auto-selects only when exactly one Company is available", () => {
  assert.equal(resolveCompanySelection([companies[0]!], null), companies[0]!.id);
  assert.equal(resolveCompanySelection(companies, null), null);
});

test("preserves a valid explicit Company and never picks an arbitrary one", () => {
  assert.equal(
    resolveCompanySelection(companies, companies[1]!.id),
    companies[1]!.id,
  );
  assert.equal(resolveCompanySelection(companies, "missing"), null);
});

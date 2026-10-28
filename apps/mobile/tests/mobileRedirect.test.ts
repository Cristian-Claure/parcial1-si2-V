import assert from "node:assert/strict";
import test from "node:test";
import { mobileGroupForRole, mobileHomePath } from "@velora/contracts";
import { resolveStorefront } from "../src/core/company/storefrontSelection.ts";

const base = { status: "authenticated" as const, hasStore: false, ownerCompanySelected: false };

test("redirección por rol (función compartida con la web)", () => {
  assert.equal(mobileHomePath({ ...base, status: "anonymous", role: null }), "/login");
  assert.equal(mobileHomePath({ ...base, role: "CUSTOMER" }), "/stores");
  assert.equal(mobileHomePath({ ...base, role: "CUSTOMER", hasStore: true }), "/home");
  assert.equal(mobileHomePath({ ...base, role: "ADMIN" }), "/owner/companies");
  assert.equal(mobileHomePath({ ...base, role: "ADMIN", ownerCompanySelected: true }), "/owner/dashboard");
  assert.equal(mobileHomePath({ ...base, role: "STORE_MANAGER" }), "/operations");
  assert.equal(mobileHomePath({ ...base, role: "PLATFORM_ADMIN" }), "/platform-only");
  assert.equal(mobileGroupForRole("ADMIN"), "owner");
  assert.equal(mobileGroupForRole("STORE_MANAGER"), "manager");
});

test("sin pin siempre se muestra el selector; con pin válido manda el pin", () => {
  const companies = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(resolveStorefront(companies, null, null), { companyId: null, pinned: false });
  assert.deepEqual(resolveStorefront(companies, "b", "a"), { companyId: "b", pinned: true });
  assert.deepEqual(resolveStorefront(companies, "zzz", "a"), { companyId: "a", pinned: false });
});

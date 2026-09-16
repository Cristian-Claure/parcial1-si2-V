import { describe, expect, it } from "vitest";
import type { CompanyResponse } from "@velora/contracts";
import { resolveCompanySelection } from "./companySelection";
const company = (id: string): CompanyResponse => ({ id, code: id.slice(0, 3), name: id, description: null, active: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
describe("resolveCompanySelection", () => {
  it("no escoge arbitrariamente cuando existen varias compañías", () => { expect(resolveCompanySelection([company("10000000-0000-4000-8000-000000000001"), company("20000000-0000-4000-8000-000000000002")], null)).toBeNull(); });
  it("conserva una selección explícita válida", () => { const id = "10000000-0000-4000-8000-000000000001"; expect(resolveCompanySelection([company(id)], id)).toBe(id); });
});

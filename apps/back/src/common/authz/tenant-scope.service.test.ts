import { describe, expect, it } from "vitest";
import {
  assertCompanyAccess, assertStoreAccess, canAccessCompany, canAccessStore, companyFilter, type ActorAccessContext,
} from "./tenant-scope.service.js";

const owner: ActorAccessContext = { userId: "u1", role: "ADMIN", storeId: null, companyId: null, ownedCompanyIds: ["c1", "c2"], ownedStoreIds: ["s1"] };
const manager: ActorAccessContext = { userId: "u2", role: "STORE_MANAGER", storeId: "s1", companyId: "c1", ownedCompanyIds: ["c1"], ownedStoreIds: ["s1"] };
const platform: ActorAccessContext = { userId: "u3", role: "PLATFORM_ADMIN", storeId: null, companyId: null, ownedCompanyIds: [], ownedStoreIds: [] };
const customer: ActorAccessContext = { userId: "u4", role: "CUSTOMER", storeId: null, companyId: null, ownedCompanyIds: [], ownedStoreIds: [] };

describe("TenantScope helpers", () => {
  it("un propietario solo accede a sus compañías y sucursales", () => {
    expect(canAccessCompany(owner, "c2")).toBe(true);
    expect(canAccessCompany(owner, "cX")).toBe(false);
    expect(canAccessStore(owner, "s1")).toBe(true);
    expect(canAccessStore(owner, "sX")).toBe(false);
    expect(companyFilter(owner)).toEqual(["c1", "c2"]);
  });

  it("fuera de alcance: 404 para propietarios (no revela existencia) y 403 para encargados", () => {
    expect(() => assertCompanyAccess(owner, "cX")).toThrow(expect.objectContaining({ status: 404 }));
    expect(() => assertStoreAccess(owner, "sX")).toThrow(expect.objectContaining({ status: 404 }));
    expect(() => assertCompanyAccess(manager, "c2")).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => assertStoreAccess(manager, "s2")).toThrow(expect.objectContaining({ status: 403 }));
  });

  it("PLATFORM_ADMIN no tiene restricción y CUSTOMER no administra nada", () => {
    expect(canAccessCompany(platform, "cualquiera")).toBe(true);
    expect(companyFilter(platform)).toBeNull();
    expect(canAccessCompany(customer, "c1")).toBe(false);
    expect(companyFilter(customer)).toEqual([]);
  });

  it("un ADMIN sin datos de alcance (contexto incompleto) no accede a nada", () => {
    const incomplete = { userId: "u5", role: "ADMIN", storeId: null, companyId: null } as unknown as ActorAccessContext;
    expect(canAccessCompany(incomplete, "c1")).toBe(false);
    expect(canAccessStore(incomplete, "s1")).toBe(false);
  });
});

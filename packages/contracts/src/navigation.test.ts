import { describe, expect, it } from "vitest";
import { afterCompanyChoicePath, canRoleOpen, chooseCompanyPath, equivalentOwnerPath, guardRoute, mobileHomePath, postLoginPath, safeReturnPath } from "./navigation.js";

describe("postLoginPath", () => {
  it("cliente: ruta pedida, última tienda o directorio", () => {
    expect(postLoginPath({ role: "CUSTOMER", lastStoreSlug: null, adminCompanyCount: 0 })).toBe("/tiendas");
    expect(postLoginPath({ role: "CUSTOMER", lastStoreSlug: "casa-montalvo", adminCompanyCount: 0 })).toBe("/t/casa-montalvo");
    expect(postLoginPath({ role: "CUSTOMER", lastStoreSlug: "solana", adminCompanyCount: 0, requested: "/bolsa" })).toBe("/bolsa");
    expect(postLoginPath({ role: "CUSTOMER", lastStoreSlug: "solana", adminCompanyCount: 0, requested: "//evil.example" })).toBe("/t/solana");
    expect(postLoginPath({ role: "CUSTOMER", lastStoreSlug: null, adminCompanyCount: 0, requested: "/login" })).toBe("/tiendas");
  });

  it("vuelve a la ruta pedida solo si el rol la puede abrir", () => {
    expect(postLoginPath({ role: "ADMIN", lastStoreSlug: null, adminCompanyCount: 1, requested: "/admin/inventario" })).toBe("/admin/inventario");
    expect(postLoginPath({ role: "CUSTOMER", lastStoreSlug: null, adminCompanyCount: 0, requested: "/admin/inventario" })).toBe("/tiendas");
    expect(postLoginPath({ role: "STORE_MANAGER", lastStoreSlug: null, adminCompanyCount: 0, requested: "/sucursal/pedidos" })).toBe("/sucursal/pedidos");
    expect(postLoginPath({ role: "STORE_MANAGER", lastStoreSlug: null, adminCompanyCount: 0, requested: "/admin" })).toBe("/sucursal");
  });

  it("propietario con 2 o más empresas pasa por /elegir-empresa recordando el destino", () => {
    expect(postLoginPath({ role: "ADMIN", lastStoreSlug: null, adminCompanyCount: 2 })).toBe("/elegir-empresa");
    expect(postLoginPath({ role: "ADMIN", lastStoreSlug: null, adminCompanyCount: 2, requested: "/admin/pedidos" })).toBe("/elegir-empresa?from=%2Fadmin%2Fpedidos");
    expect(postLoginPath({ role: "ADMIN", lastStoreSlug: "solana", adminCompanyCount: 0 })).toBe("/admin");
  });

  it("encargado y plataforma", () => {
    expect(postLoginPath({ role: "STORE_MANAGER", lastStoreSlug: "solana", adminCompanyCount: 0 })).toBe("/sucursal");
    expect(postLoginPath({ role: "PLATFORM_ADMIN", lastStoreSlug: null, adminCompanyCount: 0 })).toBe("/plataforma");
  });
});

describe("guardRoute", () => {
  it("sin sesión → login con from; esperando → wait", () => {
    expect(guardRoute({ status: "checking", role: null, path: "/admin", roles: ["ADMIN"] })).toEqual({ kind: "wait" });
    expect(guardRoute({ status: "anonymous", role: null, path: "/bolsa?x=1", roles: ["CUSTOMER"], expired: true })).toEqual({ kind: "login", to: "/login", from: "/bolsa?x=1", expired: true });
  });
  it("cliente en /admin → /tiendas; encargado en /admin → /sucursal", () => {
    expect(guardRoute({ status: "authenticated", role: "CUSTOMER", path: "/admin", roles: ["ADMIN"] })).toEqual({ kind: "redirect", to: "/tiendas" });
    expect(guardRoute({ status: "authenticated", role: "STORE_MANAGER", path: "/admin", roles: ["ADMIN"] })).toEqual({ kind: "redirect", to: "/sucursal" });
    expect(guardRoute({ status: "authenticated", role: "ADMIN", path: "/admin", roles: ["ADMIN"] })).toEqual({ kind: "allow" });
  });
});

describe("empresas del propietario", () => {
  it("elegir empresa y volver", () => {
    expect(chooseCompanyPath("/admin/inventario")).toBe("/elegir-empresa?from=%2Fadmin%2Finventario");
    expect(chooseCompanyPath("/tiendas")).toBe("/elegir-empresa");
    expect(afterCompanyChoicePath("/admin/inventario")).toBe("/admin/inventario");
    expect(afterCompanyChoicePath("https://evil.example")).toBe("/admin");
    expect(afterCompanyChoicePath(null)).toBe("/admin");
  });
  it("cambiar de empresa conserva la sección", () => {
    expect(equivalentOwnerPath("/admin/inventario?warehouse=abc")).toBe("/admin/inventario");
    expect(equivalentOwnerPath("/admin/reportes/constructor")).toBe("/admin/reportes/constructor");
    expect(equivalentOwnerPath("/admin")).toBe("/admin");
    expect(equivalentOwnerPath("/tiendas")).toBe("/admin");
  });
  it("rutas públicas y protegidas", () => {
    expect(canRoleOpen("CUSTOMER", "/t/solana/catalogo")).toBe(true);
    expect(canRoleOpen("ADMIN", "/mis-pedidos")).toBe(false);
    expect(safeReturnPath("/registro")).toBeNull();
  });
});

describe("mobileHomePath", () => {
  it("por rol", () => {
    const base = { status: "authenticated" as const, hasStore: false, ownerCompanySelected: false };
    expect(mobileHomePath({ ...base, status: "checking", role: null })).toBeNull();
    expect(mobileHomePath({ ...base, status: "anonymous", role: null })).toBe("/login");
    expect(mobileHomePath({ ...base, role: "CUSTOMER" })).toBe("/stores");
    expect(mobileHomePath({ ...base, role: "CUSTOMER", hasStore: true })).toBe("/home");
    expect(mobileHomePath({ ...base, role: "ADMIN" })).toBe("/owner/companies");
    expect(mobileHomePath({ ...base, role: "ADMIN", ownerCompanySelected: true })).toBe("/owner/dashboard");
    expect(mobileHomePath({ ...base, role: "STORE_MANAGER" })).toBe("/operations");
    expect(mobileHomePath({ ...base, role: "PLATFORM_ADMIN" })).toBe("/platform-only");
  });
});

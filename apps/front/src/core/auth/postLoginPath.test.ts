import { describe, expect, it } from "vitest";
import { postLoginPath } from "./postLoginPath";

describe("postLoginPath", () => {
  it("cliente: ruta pedida, última tienda o directorio", () => {
    expect(postLoginPath({ role: "CUSTOMER", lastStoreSlug: null, adminCompanyCount: 0 })).toBe("/tiendas");
    expect(postLoginPath({ role: "CUSTOMER", lastStoreSlug: "casa-montalvo", adminCompanyCount: 0 })).toBe("/t/casa-montalvo");
    expect(postLoginPath({ role: "CUSTOMER", lastStoreSlug: "solana", adminCompanyCount: 0, requested: "/bolsa" })).toBe("/bolsa");
    expect(postLoginPath({ role: "CUSTOMER", lastStoreSlug: "solana", adminCompanyCount: 0, requested: "//evil.example" })).toBe("/t/solana");
    expect(postLoginPath({ role: "CUSTOMER", lastStoreSlug: null, adminCompanyCount: 0, requested: "/login" })).toBe("/tiendas");
  });

  it("propietario: panel con una empresa, selector con dos o más", () => {
    expect(postLoginPath({ role: "ADMIN", lastStoreSlug: "solana", adminCompanyCount: 1 })).toBe("/admin");
    expect(postLoginPath({ role: "ADMIN", lastStoreSlug: null, adminCompanyCount: 0 })).toBe("/admin");
    expect(postLoginPath({ role: "ADMIN", lastStoreSlug: null, adminCompanyCount: 2 })).toBe("/elegir-empresa");
  });

  it("encargado y plataforma", () => {
    expect(postLoginPath({ role: "STORE_MANAGER", lastStoreSlug: "solana", adminCompanyCount: 0 })).toBe("/sucursal");
    expect(postLoginPath({ role: "PLATFORM_ADMIN", lastStoreSlug: null, adminCompanyCount: 0 })).toBe("/plataforma");
  });
});

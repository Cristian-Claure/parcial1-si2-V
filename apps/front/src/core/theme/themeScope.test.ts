import { afterEach, describe, expect, it } from "vitest";
import { applyCachedThemeBeforePaint, applyStoreTheme, brandVariables, resetStoreTheme, themeAreaForPath } from "./themeScope";

const root = () => document.documentElement;
afterEach(() => { resetStoreTheme(); });

describe("ThemeScope", () => {
  it("ámbitos: tienda, panel, sucursal y plataforma", () => {
    expect(themeAreaForPath("/t/solana")).toBe("storefront");
    expect(themeAreaForPath("/catalogo/abrigo")).toBe("storefront");
    expect(themeAreaForPath("/bolsa")).toBe("storefront");
    expect(themeAreaForPath("/admin/inventario")).toBe("owner");
    expect(themeAreaForPath("/sucursal")).toBe("manager");
    for (const path of ["/", "/login", "/tiendas", "/planes", "/elegir-empresa", "/plataforma"]) expect(themeAreaForPath(path)).toBe("platform");
  });

  it("aplica todas las variables en <html> (cubre modales y portales) y las quita en la plataforma", () => {
    const vars = brandVariables({ tier: "FULL", palette: { accent: "#0B7A5C", paper: "#F2F5F3", ink: "#0F1611", primary: "#183A1E" } as never });
    applyStoreTheme({ slug: "urbano-boutique", vars });
    expect(root().style.getPropertyValue("--sidebar-bg")).toBe(vars["--sidebar-bg"]);
    expect(root().getAttribute("data-store-theme")).toBe("urbano-boutique");
    applyStoreTheme(null, false);
    expect(root().style.getPropertyValue("--sidebar-bg")).toBe("");
    expect(root().hasAttribute("data-store-theme")).toBe(false);
  });

  it("plan FREE: el tema sale solo del acento (la paleta resuelta trae fondo arena por defecto)", () => {
    const free = brandVariables({ tier: "BASIC", palette: { accent: "#7238CF", paper: "#FAF6F0", ink: "#17130F", primary: "#17130F" } as never });
    expect(free["--paper"]).not.toBe("#FAF6F0");
    expect(free["--sidebar-bg"]).not.toBe("#17130F");
  });

  it("antes de pintar aplica la última tienda solo en rutas de tienda o panel; el logout la olvida", () => {
    applyStoreTheme({ slug: "solana", vars: { "--accent": "#B8432F" } });
    applyStoreTheme(null, false);
    applyCachedThemeBeforePaint("/tiendas");
    expect(root().style.getPropertyValue("--accent")).toBe("");
    applyCachedThemeBeforePaint("/admin");
    expect(root().style.getPropertyValue("--accent")).toBe("#B8432F");
    resetStoreTheme();
    applyCachedThemeBeforePaint("/admin");
    expect(root().style.getPropertyValue("--accent")).toBe("");
  });
});

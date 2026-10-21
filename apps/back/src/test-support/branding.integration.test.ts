import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AdminBrandingResponse, ApiError, CompanyBrand, CompanyResponse } from "@velora/contracts";
import { createMigratedDatabase, integrationDatabaseAvailable, type TestDatabase } from "./integration-database.js";
import { http, login, seedTenant, startTestApp, type SeededTenant, type TestApp } from "./integration-app.js";

const available = await integrationDatabaseAvailable();
/** PNG 1x1 válido. */
export const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

export async function uploadBrandAsset(baseUrl: string, token: string, companyId: string, kind: "logo" | "banner") {
  const form = new FormData();
  form.append("file", new Blob([TINY_PNG], { type: "image/png" }), `${kind}.png`);
  const response = await fetch(`${baseUrl}/api/admin/companies/${companyId}/branding/${kind}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: response.status, body: await response.json() as AdminBrandingResponse & ApiError };
}

describe.skipIf(!available)("marca por empresa (integración)", () => {
  let db: TestDatabase;
  let server: TestApp;
  let free: SeededTenant;
  let plus: SeededTenant;
  let max: SeededTenant;
  const tokens: Record<string, string> = {};
  const patch = <T>(token: string, tenant: SeededTenant, body: unknown) => http<T>(server.baseUrl, "PATCH", `/api/admin/companies/${tenant.companyId}/branding`, { token, body });

  beforeAll(async () => {
    db = await createMigratedDatabase("branding");
    free = await seedTenant(db, "BF", { planCode: "FREE" });
    plus = await seedTenant(db, "BP", { planCode: "PLUS" });
    max = await seedTenant(db, "BM", { planCode: "MAX" });
    server = await startTestApp(db);
    for (const tenant of [free, plus, max]) tokens[tenant.label] = await login(server.baseUrl, tenant.ownerEmail);
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  it("FREE (marca básica): nombre, enlace, logo y 1 color; el resto devuelve PLAN_LIMIT_BRANDING", async () => {
    const ok = await patch<AdminBrandingResponse>(tokens.BF!, free, { displayName: "Bella Free", palette: { accent: "#1F4E79" } });
    expect(ok.status, ok.text).toBe(200);
    expect(ok.body.brand).toMatchObject({ name: "Bella Free", tier: "BASIC", palette: { accent: "#1F4E79" } });
    expect(ok.body.allowed).toEqual(["displayName", "slug", "logo", "accent"]);
    const paper = await patch<ApiError>(tokens.BF!, free, { palette: { accent: "#1F4E79", paper: "#FFFFFF" } });
    expect(paper.body).toMatchObject({ code: "PLAN_LIMIT_BRANDING", details: { feature: "fullPalette", requiredPlan: "PLUS" } });
    const tagline = await patch<ApiError>(tokens.BF!, free, { tagline: "Hola" });
    expect(tagline.body).toMatchObject({ code: "PLAN_LIMIT_BRANDING", details: { feature: "tagline", requiredPlan: "MAX" } });
    const banner = await uploadBrandAsset(server.baseUrl, tokens.BF!, free.companyId, "banner");
    expect(banner.body).toMatchObject({ code: "PLAN_LIMIT_BRANDING", details: { feature: "banner" } });
    const logo = await uploadBrandAsset(server.baseUrl, tokens.BF!, free.companyId, "logo");
    expect(logo.status).toBe(201);
    expect(logo.body.brand.logoUrl).toMatch(/\/api\/companies\/assets\/[0-9a-f-]{36}\.png$/);
    const asset = await fetch(`${server.baseUrl}${new URL(logo.body.brand.logoUrl!).pathname}`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toBe("image/png");
  });

  it("valida contraste WCAG AA y genera derivados (accent-deep / accent-soft)", async () => {
    const lowContrast = await patch<ApiError>(tokens.BP!, plus, { palette: { accent: "#1F4E79", paper: "#FFFFFF", ink: "#BBBBBB" } });
    expect(lowContrast.status).toBe(400);
    expect(lowContrast.body.code).toBe("BRAND_CONTRAST");
    const full = await patch<AdminBrandingResponse>(tokens.BP!, plus, { palette: { accent: "#7A1F3D", paper: "#FFF8F3", ink: "#1B1B1F", primary: "#1B1B1F" } });
    expect(full.status, full.text).toBe(200);
    expect(full.body.brand.palette).toMatchObject({ accent: "#7A1F3D", paper: "#FFF8F3", ink: "#1B1B1F" });
    expect(full.body.brand.palette.accentDeep).not.toBe("#7A1F3D");
    expect(full.body.brand.palette.accentSoft).not.toBe("#FFF8F3");
  });

  it("MAX (marca completa): frase, contacto y banner; /t/:slug devuelve la marca y al cambiar el enlace el anterior deja de existir", async () => {
    const result = await patch<AdminBrandingResponse>(tokens.BM!, max, { tagline: "Moda que se queda", contact: { phone: "+591 70000000", email: "hola@max.test", socials: { instagram: "@max" } }, slug: "max-moda" });
    expect(result.status, result.text).toBe(200);
    expect((await uploadBrandAsset(server.baseUrl, tokens.BM!, max.companyId, "banner")).status).toBe(201);
    const publicBrand = await http<CompanyBrand>(server.baseUrl, "GET", "/api/companies/by-slug/max-moda");
    expect(publicBrand.body).toMatchObject({ slug: "max-moda", tagline: "Moda que se queda", tier: "FULL", isPlatformBrand: false, contact: { phone: "+591 70000000" } });
    expect(publicBrand.body.bannerUrl).toBeTruthy();
    expect((await http(server.baseUrl, "GET", `/api/companies/by-slug/${max.label.toLowerCase()}`)).status).toBe(404);
    const taken = await patch<ApiError>(tokens.BP!, plus, { slug: "max-moda" });
    expect(taken.body.code).toBe("SLUG_TAKEN");
  });

  it("al bajar de plan no se borra la marca guardada, pero la pública se limita al nivel vigente", async () => {
    await db.query("update subscriptions set plan_id = (select id from plans where code = 'FREE') where owner_user_id = $1", [max.ownerId]);
    const publicBrand = await http<CompanyBrand>(server.baseUrl, "GET", "/api/companies/by-slug/max-moda");
    expect(publicBrand.body).toMatchObject({ tier: "BASIC", tagline: null, bannerUrl: null, contact: null });
    const [stored] = await db.query<{ tagline: string; banner_storage_key: string | null }>("select tagline, banner_storage_key from companies where id = $1", [max.companyId]);
    expect(stored?.tagline).toBe("Moda que se queda");
    expect(stored?.banner_storage_key).toBeTruthy();
  });

  it("los listados de compañías incluyen la marca efectiva y VÉLORA es la marca de la plataforma", async () => {
    const list = await http<CompanyResponse[]>(server.baseUrl, "GET", "/api/companies");
    const velora = list.body.find((company) => company.code === "VELORA");
    expect(velora?.brand).toMatchObject({ isPlatformBrand: true, slug: "velora", palette: { accent: "#8B6A34" } });
    const mine = await http<CompanyResponse[]>(server.baseUrl, "GET", "/api/admin/companies", { token: tokens.BF });
    expect(mine.body[0]?.brand?.name).toBe("Bella Free");
  });
});

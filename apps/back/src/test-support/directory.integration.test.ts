import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DirectoryEntry } from "@velora/contracts";
import { createMigratedDatabase, integrationDatabaseAvailable, type TestDatabase } from "./integration-database.js";
import { http, login, seedTenant, startTestApp, type SeededTenant, type TestApp } from "./integration-app.js";

const available = await integrationDatabaseAvailable();

/**
 * Fase 4B · Directorio público (/api/companies/directory): solo empresas activas y listadas, sin
 * las de las demos automáticas, y SOLO campos de marca (nada privado del propietario ni del plan).
 */
describe.skipIf(!available)("directorio público de tiendas (integración)", () => {
  let db: TestDatabase;
  let server: TestApp;
  let a: SeededTenant;
  let b: SeededTenant;
  const hidden = { demo: randomUUID(), unlisted: randomUUID(), inactive: randomUUID() };
  const tokens: Record<string, string> = {};
  const directory = (query = "") => http<DirectoryEntry[]>(server.baseUrl, "GET", `/api/companies/directory${query}`);

  beforeAll(async () => {
    db = await createMigratedDatabase("directory");
    a = await seedTenant(db, "A", { planCode: "MAX" });
    b = await seedTenant(db, "B", { planCode: "FREE" });
    for (const [id, slug, listed, active] of [[hidden.demo, "demo-max-20261022", true, true], [hidden.unlisted, "oculta", false, true], [hidden.inactive, "cerrada", true, false]] as const) {
      await db.query("insert into companies (id, code, name, slug, active, listed, owner_user_id, created_at, updated_at) values ($1, $2, $3, $4, $5, $6, $7, now(), now())",
        [id, slug.toUpperCase().replace(/-/g, "_").slice(0, 20), `Tienda ${slug}`, slug, active, listed, a.ownerId]);
    }
    server = await startTestApp(db);
    tokens.ownerA = await login(server.baseUrl, a.ownerEmail);
    tokens.ownerB = await login(server.baseUrl, b.ownerEmail);
    const patch = await http(server.baseUrl, "PATCH", `/api/admin/companies/${a.companyId}/branding`, {
      token: tokens.ownerA,
      body: { tagline: "Sastrería contemporánea", segment: "HOMBRE", contact: { email: "privado-a@test.local", phone: "+59170000001", address: "Calle secreta 123" } },
    });
    expect(patch.status, patch.text).toBe(200);
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  it("lista solo tiendas activas y listadas, sin las demos automáticas", async () => {
    const result = await directory();
    expect(result.status, result.text).toBe(200);
    const slugs = result.body.map((entry) => entry.slug);
    expect(slugs).toEqual(expect.arrayContaining(["compania-a", "compania-b"]));
    expect(slugs).not.toEqual(expect.arrayContaining(["demo-max-20261022"]));
    expect(slugs).not.toContain("oculta");
    expect(slugs).not.toContain("cerrada");
  });

  it("expone solo campos de marca: nada de ids, propietario, plan ni contacto", async () => {
    const result = await directory();
    for (const entry of result.body) expect(Object.keys(entry).sort()).toEqual(["bannerUrl", "logoUrl", "name", "palette", "segment", "slug", "tagline"]);
    for (const secret of [a.companyId, b.companyId, a.ownerId, b.ownerId, a.ownerEmail, b.ownerEmail, "privado-a@test.local", "+59170000001", "Calle secreta", "CO_A", "MAX", "FREE", a.storeId]) {
      expect(result.text).not.toContain(secret);
    }
    expect(result.body.find((entry) => entry.slug === "compania-a")).toMatchObject({ tagline: "Sastrería contemporánea", segment: "HOMBRE" });
  });

  it("busca por texto (literal, sin comodines) y filtra por segmento", async () => {
    expect((await directory("?q=sastrer")).body.map((entry) => entry.slug)).toEqual(["compania-a"]);
    expect((await directory("?q=%25")).body).toEqual([]);
    expect((await directory("?q=_")).body).toEqual([]);
    expect((await directory("?segment=HOMBRE")).body.map((entry) => entry.slug)).toEqual(["compania-a"]);
    expect((await directory("?segment=ROBOTS")).status).toBe(400);
  });

  it("el segmento solo lo cambia el propietario de la tienda (A/B)", async () => {
    const intruder = await http(server.baseUrl, "PATCH", `/api/admin/companies/${a.companyId}/branding`, { token: tokens.ownerB, body: { segment: "INFANTIL" } });
    expect(intruder.status).toBe(404);
    expect((await directory("?segment=INFANTIL")).body).toEqual([]);
    const own = await http<{ stored: { segment: string } }>(server.baseUrl, "PATCH", `/api/admin/companies/${b.companyId}/branding`, { token: tokens.ownerB, body: { segment: "INFANTIL" } });
    expect(own.status, own.text).toBe(200);
    expect(own.body.stored.segment).toBe("INFANTIL");
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AdminPlanResponse, PlatformCompany, PlatformOwner, PlatformSubscription } from "@velora/contracts";
import { createMigratedDatabase, integrationDatabaseAvailable, type TestDatabase } from "./integration-database.js";
import { http, insertUser, listRoutes, login, seedTenant, startTestApp, type SeededTenant, type TestApp } from "./integration-app.js";

const available = await integrationDatabaseAvailable();

describe.skipIf(!available)("área de plataforma (integración)", () => {
  let db: TestDatabase;
  let server: TestApp;
  let owner: SeededTenant;
  let platformToken: string;
  let ownerToken: string;
  let managerToken: string;

  beforeAll(async () => {
    db = await createMigratedDatabase("platform");
    owner = await seedTenant(db, "Q", { planCode: "PLUS" });
    await insertUser(db, { email: "nuevo-dueno@test.local", role: "ADMIN" });
    await insertUser(db, { email: "plataforma@test.local", role: "PLATFORM_ADMIN" });
    server = await startTestApp(db);
    platformToken = await login(server.baseUrl, "plataforma@test.local");
    ownerToken = await login(server.baseUrl, owner.ownerEmail);
    managerToken = await login(server.baseUrl, owner.managerEmail);
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  it("toda ruta /api/platform rechaza a ADMIN y STORE_MANAGER (403)", async () => {
    const routes = listRoutes(server.app).filter((route) => route.path.startsWith("/api/platform"));
    expect(routes.length).toBeGreaterThanOrEqual(6);
    expect(routes.every((route) => route.roles.length === 1 && route.roles[0] === "PLATFORM_ADMIN")).toBe(true);
    for (const route of routes) {
      const path = route.path.replace(/:[A-Za-z]+/g, owner.companyId);
      for (const token of [ownerToken, managerToken]) {
        const result = await http(server.baseUrl, route.method, path, { token, body: route.method === "GET" ? undefined : {} });
        expect(result.status, `${route.method} ${path}`).toBe(403);
      }
    }
  });

  it("lista propietarios, compañías y suscripciones", async () => {
    const owners = await http<PlatformOwner[]>(server.baseUrl, "GET", "/api/platform/owners", { token: platformToken });
    expect(owners.body.find((row) => row.email === owner.ownerEmail)).toMatchObject({ companies: 1, planCode: "PLUS", subscriptionStatus: "ACTIVE" });
    const companies = await http<PlatformCompany[]>(server.baseUrl, "GET", "/api/platform/companies", { token: platformToken });
    expect(companies.body.find((row) => row.id === owner.companyId)).toMatchObject({ ownerEmail: owner.ownerEmail, stores: 1, products: 1 });
    const subscriptions = await http<PlatformSubscription[]>(server.baseUrl, "GET", "/api/platform/subscriptions", { token: platformToken });
    expect(subscriptions.body.some((row) => row.ownerEmail === owner.ownerEmail && row.planCode === "PLUS")).toBe(true);
  });

  it("ajusta fechas para demostrar un vencimiento (D6) y el plan efectivo cae a FREE", async () => {
    const [subscription] = await db.query<{ id: string }>("select id from subscriptions where owner_user_id = $1", [owner.ownerId]);
    const past = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const adjusted = await http<PlatformSubscription>(server.baseUrl, "PATCH", `/api/platform/subscriptions/${subscription!.id}`, {
      token: platformToken, body: { currentPeriodStart: new Date(Date.now() - 40 * 86_400_000).toISOString(), currentPeriodEnd: past },
    });
    expect(adjusted.status, adjusted.text).toBe(200);
    const plan = await http<AdminPlanResponse>(server.baseUrl, "GET", "/api/admin/plan", { token: ownerToken });
    expect(plan.body).toMatchObject({ restricted: true, effectivePlan: { code: "FREE" }, subscription: { status: "PAST_DUE" } });
    const invalid = await http(server.baseUrl, "PATCH", `/api/platform/subscriptions/${subscription!.id}`, { token: platformToken, body: { currentPeriodEnd: new Date(Date.now() - 90 * 86_400_000).toISOString() } });
    expect(invalid.status).toBe(400);
  });

  it("cambia el plan de un propietario y transfiere la propiedad sin tocar contraseñas", async () => {
    const changed = await http<AdminPlanResponse>(server.baseUrl, "POST", `/api/platform/owners/${owner.ownerId}/plan`, { token: platformToken, body: { planCode: "MAX" } });
    expect(changed.status, changed.text).toBe(200);
    expect(changed.body).toMatchObject({ effectivePlan: { code: "MAX" }, restricted: false });

    const [before] = await db.query<{ password_hash: string }>("select password_hash from app_users where email = 'nuevo-dueno@test.local'");
    const transfer = await http<PlatformCompany>(server.baseUrl, "PUT", `/api/platform/companies/${owner.companyId}/owner`, { token: platformToken, body: { ownerEmail: "nuevo-dueno@test.local" } });
    expect(transfer.status, transfer.text).toBe(200);
    expect(transfer.body.ownerEmail).toBe("nuevo-dueno@test.local");
    const [after] = await db.query<{ password_hash: string }>("select password_hash from app_users where email = 'nuevo-dueno@test.local'");
    expect(after?.password_hash).toBe(before?.password_hash);
    const newOwner = await login(server.baseUrl, "nuevo-dueno@test.local");
    const visible = await http<{ id: string }[]>(server.baseUrl, "GET", "/api/admin/companies", { token: newOwner });
    expect(visible.body.map((company) => company.id)).toEqual([owner.companyId]);
    const previous = await http<{ id: string }[]>(server.baseUrl, "GET", "/api/admin/companies", { token: ownerToken });
    expect(previous.body).toEqual([]);

    const toCustomer = await http(server.baseUrl, "PUT", `/api/platform/companies/${owner.companyId}/owner`, { token: platformToken, body: { ownerEmail: owner.managerEmail } });
    expect(toCustomer.status).toBe(409);
  });
});



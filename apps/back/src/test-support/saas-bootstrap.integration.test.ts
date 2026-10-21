import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMigratedDatabase, integrationDatabaseAvailable, type TestDatabase } from "./integration-database.js";
import { http, insertUser, login, startTestApp, type TestApp } from "./integration-app.js";

const available = await integrationDatabaseAvailable();
const VELORA = "10000000-0000-0000-0000-000000000001";

const bootstrapEnv = {
  BOOTSTRAP_ADMIN_ENABLED: "true",
  BOOTSTRAP_ADMIN_EMAIL: "Owner.Velora@Test.Local",
  BOOTSTRAP_ADMIN_PASSWORD: "Owner1234",
  BOOTSTRAP_PLATFORM_ADMIN_ENABLED: "true",
  BOOTSTRAP_PLATFORM_ADMIN_EMAIL: "platform@test.local",
  BOOTSTRAP_PLATFORM_ADMIN_PASSWORD: "Platform1234",
};

describe.skipIf(!available)("bootstrap SaaS (integración)", () => {
  let db: TestDatabase;
  let server: TestApp;

  beforeAll(async () => {
    db = await createMigratedDatabase("bootstrap");
    // Un ADMIN preexistente (más antiguo) NO debe quedarse con VÉLORA: manda la cuenta del bootstrap.
    await insertUser(db, { email: "legacy-admin@test.local", role: "ADMIN" });
    server = await startTestApp(db, bootstrapEnv);
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  it("asigna VÉLORA a la cuenta BOOTSTRAP_ADMIN con plan MAX sin vencimiento", async () => {
    const [company] = await db.query<{ email: string; role: string }>(
      "select u.email, u.role from companies c join app_users u on u.id = c.owner_user_id where c.id = $1", [VELORA],
    );
    expect(company).toEqual({ email: "owner.velora@test.local", role: "ADMIN" });
    const subscriptions = await db.query<{ code: string; status: string; current_period_end: Date | null; grandfathered: boolean }>(
      `select p.code, s.status, s.current_period_end, s.grandfathered from subscriptions s join plans p on p.id = s.plan_id
       join companies c on c.owner_user_id = s.owner_user_id where c.id = $1`, [VELORA],
    );
    expect(subscriptions).toEqual([{ code: "MAX", status: "ACTIVE", current_period_end: null, grandfathered: true }]);
  });

  it("crea un PLATFORM_ADMIN distinto del propietario", async () => {
    const rows = await db.query<{ role: string }>("select role from app_users where email = 'platform@test.local'");
    expect(rows).toEqual([{ role: "PLATFORM_ADMIN" }]);
    await expect(login(server.baseUrl, "platform@test.local", "Platform1234")).resolves.toBeTruthy();
  });

  it("el propietario de VÉLORA ve VÉLORA; un ADMIN sin compañías no ve ninguna", async () => {
    const owner = await login(server.baseUrl, "owner.velora@test.local", "Owner1234");
    const own = await http<{ id: string; slug: string }[]>(server.baseUrl, "GET", "/api/admin/companies", { token: owner });
    expect(own.body.map((company) => [company.id, company.slug])).toEqual([[VELORA, "velora"]]);
    const legacy = await login(server.baseUrl, "legacy-admin@test.local");
    const none = await http<unknown[]>(server.baseUrl, "GET", "/api/admin/companies", { token: legacy });
    expect(none.body).toEqual([]);
  });

  it("es idempotente: un segundo arranque no duplica suscripciones ni cambia el propietario", async () => {
    await server.close();
    server = await startTestApp(db, bootstrapEnv);
    const [count] = await db.query<{ total: string }>("select count(*)::text as total from subscriptions");
    expect(count?.total).toBe("1");
    const users = await db.query<{ total: string }>("select count(*)::text as total from app_users where email in ('owner.velora@test.local', 'platform@test.local')");
    expect(users[0]?.total).toBe("2");
  });

  it("D7: registrarse como cliente con el correo de un propietario da un error claro", async () => {
    const result = await http<{ message: string }>(server.baseUrl, "POST", "/api/auth/register", {
      body: { firstName: "Otro", lastName: "Cliente", email: "owner.velora@test.local", password: "Cliente123" },
    });
    expect(result.status).toBe(409);
    expect(result.text).toContain("propietario");
  });
});

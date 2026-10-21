import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AdminPlanResponse, ApiError, CompanyResponse, OnboardingResponse, ReportOverview, SlugAvailabilityResponse } from "@velora/contracts";
import { createMigratedDatabase, integrationDatabaseAvailable, type TestDatabase } from "./integration-database.js";
import { http, insertUser, startTestApp, type TestApp } from "./integration-app.js";

const available = await integrationDatabaseAvailable();
const GOOD_CARD = { cardNumber: "4242 4242 4242 4242", holderName: "Titular Demo" };
const DECLINED_CARD = { cardNumber: "4000 0000 0000 0002", holderName: "Titular Demo" };

function registration(label: string, planCode: string, overrides: Record<string, unknown> = {}) {
  const tag = `${label}-${randomUUID().slice(0, 6)}`;
  return {
    owner: { firstName: "Duena", lastName: label, email: `duena-${tag}@test.local`, password: "Tienda1234" },
    company: { name: `Tienda ${label}`, slug: `tienda-${tag}`, tagline: "Moda local", accentColor: "#1F4E79" },
    planCode,
    ...overrides,
  };
}

describe.skipIf(!available)("onboarding y provisioning (integración)", () => {
  let db: TestDatabase;
  let server: TestApp;
  const post = <T>(path: string, body: unknown, token?: string) => http<T>(server.baseUrl, "POST", path, { body, token });
  const get = <T>(path: string, token?: string) => http<T>(server.baseUrl, "GET", path, { token });

  beforeAll(async () => {
    db = await createMigratedDatabase("onboarding");
    await insertUser(db, { email: "cliente-existente@test.local", role: "CUSTOMER" });
    server = await startTestApp(db);
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  it("informa la disponibilidad del enlace y sugiere alternativas", async () => {
    const taken = await get<SlugAvailabilityResponse>("/api/onboarding/slug-availability?slug=velora");
    expect(taken.body).toMatchObject({ available: false, suggestion: "velora-2" });
    const free = await get<SlugAvailabilityResponse>("/api/onboarding/slug-availability?slug=mi-tienda-nueva");
    expect(free.body.available).toBe(true);
    const invalid = await get<SlugAvailabilityResponse>("/api/onboarding/slug-availability?slug=-Mal");
    expect(invalid.body.available).toBe(false);
  });

  it("FREE: crea propietario, tienda, sucursal principal, almacén por defecto, categorías y suscripción en una transacción", async () => {
    const request = registration("free", "FREE");
    const result = await post<OnboardingResponse>("/api/onboarding/store", request);
    expect(result.status, result.text).toBe(201);
    expect(result.body).toMatchObject({ company: { slug: request.company.slug }, subscription: { planCode: "FREE", status: "ACTIVE", currentPeriodEnd: null }, auth: { user: { role: "ADMIN" } } });
    const companyId = result.body.company.id;
    const [counts] = await db.query<{ stores: number; warehouses: number; defaults: number; categories: number }>(`
      select (select count(*)::int from stores where company_id = $1) as stores,
             (select count(*)::int from warehouses w join stores s on s.id = w.store_id where s.company_id = $1) as warehouses,
             (select count(*)::int from warehouses w join stores s on s.id = w.store_id where s.company_id = $1 and w.default_warehouse) as defaults,
             (select count(*)::int from categories where company_id = $1) as categories`, [companyId]);
    expect(counts).toEqual({ stores: 1, warehouses: 1, defaults: 1, categories: 5 });
    const mine = await get<CompanyResponse[]>("/api/admin/companies", result.body.auth.accessToken);
    expect(mine.body.map((company) => company.id)).toEqual([companyId]);
    const [palette] = await db.query<{ brand_palette: { accent: string } }>("select brand_palette from companies where id = $1", [companyId]);
    expect(palette?.brand_palette.accent).toBe("#1F4E79");
  });

  it("PLUS y MAX empiezan con TRIAL de 14 días (D6)", async () => {
    const result = await post<OnboardingResponse>("/api/onboarding/store", registration("plus", "PLUS"));
    expect(result.status, result.text).toBe(201);
    expect(result.body.subscription.status).toBe("TRIAL");
    const days = (new Date(result.body.subscription.currentPeriodEnd!).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(14);
  });

  it("D7: un correo ya usado (propietario o cliente) da un error claro y no crea nada", async () => {
    const first = registration("dup", "FREE");
    expect((await post("/api/onboarding/store", first)).status).toBe(201);
    const again = await post<ApiError>("/api/onboarding/store", { ...registration("dup2", "FREE"), owner: first.owner });
    expect(again.status).toBe(409);
    expect(again.body.message).toContain("cuenta propietaria");
    const customer = await post<ApiError>("/api/onboarding/store", { ...registration("dup3", "FREE"), owner: { ...first.owner, email: "cliente-existente@test.local" } });
    expect(customer.status).toBe(409);
    expect(customer.body.message).toContain("otro rol");
    const taken = await post<ApiError>("/api/onboarding/store", { ...registration("dup4", "FREE"), company: { ...first.company } });
    expect(taken.body).toMatchObject({ code: "SLUG_TAKEN" });
  });

  it("es transaccional: si falla a mitad del provisioning no queda ni la cuenta ni la tienda", async () => {
    await db.query(`
      create or replace function test_fail_categories() returns trigger language plpgsql as $$
      begin
        if new.slug = 'calzado' and exists (select 1 from companies c where c.id = new.company_id and c.name = 'Tienda falla') then
          raise exception 'falla simulada';
        end if;
        return new;
      end $$;
      create trigger test_fail_categories before insert on categories for each row execute function test_fail_categories();`);
    const request = registration("falla", "FREE", {});
    request.company.name = "Tienda falla";
    const result = await post("/api/onboarding/store", request);
    expect(result.status).toBe(500);
    const [leftovers] = await db.query<{ users: number; companies: number }>(
      "select (select count(*)::int from app_users where email = $1) as users, (select count(*)::int from companies where slug = $2) as companies",
      [request.owner.email, request.company.slug],
    );
    expect(leftovers).toEqual({ users: 0, companies: 0 });
    await db.query("drop trigger test_fail_categories on categories");
  });

  it("crear empresa respeta max_companies: FREE 1; PLUS (en TRIAL) 2", async () => {
    const free = await post<OnboardingResponse>("/api/onboarding/store", registration("lim-free", "FREE"));
    const blocked = await post<ApiError>("/api/admin/companies", { name: "Segunda", slug: `segunda-${randomUUID().slice(0, 6)}` }, free.body.auth.accessToken);
    expect(blocked.status).toBe(402);
    expect(blocked.body).toMatchObject({ code: "PLAN_LIMIT_COMPANIES", details: { limit: 1, used: 1, requiredPlan: "PLUS" } });

    const plus = await post<OnboardingResponse>("/api/onboarding/store", registration("lim-plus", "PLUS"));
    const token = plus.body.auth.accessToken;
    const second = await post<CompanyResponse>("/api/admin/companies", { name: "Segunda Plus", slug: `segunda-plus-${randomUUID().slice(0, 6)}` }, token);
    expect(second.status, second.text).toBe(201);
    const third = await post<ApiError>("/api/admin/companies", { name: "Tercera", slug: `tercera-${randomUUID().slice(0, 6)}` }, token);
    expect(third.body).toMatchObject({ code: "PLAN_LIMIT_COMPANIES", details: { limit: 2, requiredPlan: "MAX" } });
    const companies = await get<CompanyResponse[]>("/api/admin/companies", token);
    expect(companies.body).toHaveLength(2);

    const store = await post<{ id: string }>("/api/admin/stores", { companyId: second.body.id, code: "NORTE", name: "Sucursal Norte" }, token);
    expect(store.status, store.text).toBeLessThan(300);
    const [warehouse] = await db.query<{ default_warehouse: boolean }>("select default_warehouse from warehouses where store_id = $1", [store.body.id]);
    expect(warehouse?.default_warehouse).toBe(true);
  });

  it("upgrade con pasarela DEMO: exige tarjeta, rechaza la de prueba y registra el pago de suscripción (fuera de las ventas)", async () => {
    const owner = await post<OnboardingResponse>("/api/onboarding/store", registration("pay", "FREE"));
    const token = owner.body.auth.accessToken;
    const noCard = await post<ApiError>("/api/admin/plan/change", { planCode: "MAX" }, token);
    expect(noCard.body).toMatchObject({ code: "PAYMENT_REQUIRED" });
    const declined = await post<ApiError>("/api/admin/plan/change", { planCode: "MAX", card: DECLINED_CARD }, token);
    expect(declined.body).toMatchObject({ code: "PAYMENT_DECLINED", details: { cardLast4: "0002" } });
    const unchanged = await get<AdminPlanResponse>("/api/admin/plan", token);
    expect(unchanged.body.effectivePlan.code).toBe("FREE");

    const paid = await post<AdminPlanResponse>("/api/admin/plan/change", { planCode: "MAX", card: GOOD_CARD }, token);
    expect(paid.status, paid.text).toBe(200);
    expect(paid.body).toMatchObject({ effectivePlan: { code: "MAX" }, subscription: { status: "ACTIVE" } });
    const payments = await db.query<{ order_id: string | null; subscription_id: string | null; amount: string; provider: string; notes: string }>(
      "select order_id, subscription_id, amount, provider, notes from payments where created_by = $1", [owner.body.auth.user.id],
    );
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ order_id: null, provider: "DEMO", amount: "249.00" });
    expect(payments[0]?.subscription_id).toBeTruthy();
    expect(payments[0]?.notes).toContain("4242");
    expect(payments[0]?.notes).not.toContain("4242 4242");

    const overview = await get<ReportOverview>(`/api/admin/reports/overview?companyId=${owner.body.company.id}`, token);
    expect(overview.body.kpis.find((kpi) => kpi.key === "GROSS_SALES")?.value).toBe(0);
  });
});

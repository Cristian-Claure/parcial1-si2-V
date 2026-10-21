import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createMigratedDatabase, integrationDatabaseAvailable, type TestDatabase } from "./integration-database.js";

const available = await integrationDatabaseAvailable();
const VELORA = "10000000-0000-0000-0000-000000000001";

describe.skipIf(!available)("migraciones V26+ (integración)", () => {
  const databases: TestDatabase[] = [];
  afterAll(async () => { await Promise.all(databases.map((database) => database.drop())); });

  it("aplica V1-Vn sobre una base vacía y siembra planes, slug y marca de VÉLORA", async () => {
    const db = await createMigratedDatabase("fresh");
    databases.push(db);

    const plans = await db.query<{ code: string; max_companies: number; max_stores_per_company: number; max_products_per_company: number | null; try_on_monthly_per_customer: number | null; report_tier: string; report_history_days: number | null; trial_days: number; loyalty_discounts: unknown }>(
      "select code, max_companies, max_stores_per_company, max_products_per_company, try_on_monthly_per_customer, report_tier, report_history_days, trial_days, loyalty_discounts from plans order by sort_order",
    );
    expect(plans.map((plan) => [plan.code, plan.max_companies, plan.max_stores_per_company, plan.max_products_per_company, plan.try_on_monthly_per_customer, plan.report_tier, plan.report_history_days, plan.trial_days])).toEqual([
      ["FREE", 1, 1, 25, 3, "BASIC", 30, 0],
      ["PLUS", 2, 3, 200, 20, "STANDARD", 365, 14],
      ["MAX", 5, 10, null, null, "ADVANCED", null, 14],
    ]);
    expect(plans[2]?.loyalty_discounts).toMatchObject({ basis: "FULFILLED_AMOUNT", windowDays: 365, tiers: [{ minAmount: 1500, percent: 5 }, { minAmount: 4000, percent: 10 }, { minAmount: 8000, percent: 15 }] });
    expect(plans[0]?.loyalty_discounts).toBeNull();

    const [velora] = await db.query<{ slug: string; owner_user_id: string | null; display_name: string; brand_palette: { accent: string } }>(
      "select slug, owner_user_id, display_name, brand_palette from companies where id = $1", [VELORA],
    );
    expect(velora).toMatchObject({ slug: "velora", owner_user_id: null, display_name: "VÉLORA", brand_palette: { accent: "#8B6A34" } });

    await expect(db.query("insert into app_users (id, first_name, last_name, email, password_hash, role, status, created_at, updated_at) values ($1, 'P', 'A', 'platform@test.local', 'x', 'PLATFORM_ADMIN', 'ACTIVE', now(), now())", [randomUUID()])).resolves.toBeDefined();
  });

  it("deja un solo encargado activo por sucursal, conservando el de actividad más reciente y auditando el cambio", async () => {
    const db = await createMigratedDatabase("backfill", { upTo: 25 });
    databases.push(db);
    const store = randomUUID();
    const recentActivity = randomUUID();
    const newerButIdle = randomUUID();
    await db.query("insert into stores (id, code, name, active, company_id, created_at, updated_at) values ($1, 'S1', 'Sucursal 1', true, $2, now(), now())", [store, VELORA]);
    await db.query(
      `insert into app_users (id, first_name, last_name, email, password_hash, role, status, store_id, created_at, updated_at) values
       ($1, 'A', 'A', 'a@test.local', 'x', 'STORE_MANAGER', 'ACTIVE', $3, now() - interval '30 days', now() - interval '30 days'),
       ($2, 'B', 'B', 'b@test.local', 'x', 'STORE_MANAGER', 'ACTIVE', $3, now() - interval '1 day', now() - interval '1 day')`,
      [recentActivity, newerButIdle, store],
    );
    await db.query(
      "insert into audit_events (id, occurred_at, actor_user_id, actor_role, category, http_method, route_pattern, request_path, status_code, success) values ($1, now(), $2, 'STORE_MANAGER', 'POS', 'POST', '/x', '/x', 200, true)",
      [randomUUID(), recentActivity],
    );

    await db.migrateAfter(25);

    const managers = await db.query<{ id: string; status: string }>("select id, status from app_users where store_id = $1 order by email", [store]);
    expect(managers).toEqual([{ id: recentActivity, status: "ACTIVE" }, { id: newerButIdle, status: "INACTIVE" }]);
    const audit = await db.query<{ request_path: string }>("select request_path from audit_events where request_id = 'migration-v27'");
    expect(audit).toHaveLength(1);
    expect(audit[0]?.request_path).toContain(newerButIdle);

    await expect(db.query("update app_users set status = 'ACTIVE' where id = $1", [newerButIdle])).rejects.toThrow(/uq_app_users_active_manager_per_store/);
  });

  it("exige total = subtotal - descuento en pedidos", async () => {
    const db = await createMigratedDatabase("discount");
    databases.push(db);
    const [constraint] = await db.query<{ definition: string }>("select pg_get_constraintdef(oid) as definition from pg_constraint where conname = 'ck_orders_discount'");
    expect(constraint?.definition).toContain("total = (subtotal - discount_amount)");
  });
});

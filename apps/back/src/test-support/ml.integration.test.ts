import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { MlForecast, MlOverview, MlRun, MlSegments, StartMlRunsResponse } from "@velora/contracts";
import { MlClient } from "../ml/ml-client.js";
import { createMigratedDatabase, integrationDatabaseAvailable, type TestDatabase } from "./integration-database.js";
import { http, insertUser, login, seedTenant, startTestApp, type SeededTenant, type TestApp } from "./integration-app.js";

const available = await integrationDatabaseAvailable();

/**
 * Fase 4 · Endpoints de ML: control de plan (solo MAX), roles, aislamiento entre compañías,
 * ciclo de corrida con un DOBLE del cliente ML (sin Python), 409 por concurrencia y servicio caído.
 */
describe.skipIf(!available)("ML: dashboards y corridas (integración)", () => {
  let db: TestDatabase;
  let server: TestApp;
  let free: SeededTenant;
  let plus: SeededTenant;
  let max: SeededTenant;
  let other: SeededTenant;
  let client: MlClient;
  const tokens: Record<string, string> = {};
  const savedRuns: Record<string, string> = {};

  const call = <T = unknown>(token: string | undefined, method: string, path: string, body?: unknown) => http<T>(server.baseUrl, method, path, { token, body });

  /** Resultado "anterior" guardado, como si Python ya hubiera entrenado. */
  async function seedResults(tenant: SeededTenant, customerId: string) {
    const runs = { forecast: randomUUID(), segments: randomUUID(), anomalies: randomUUID(), risk: randomUUID() };
    const insert = (id: string, model: string, metrics: object) =>
      db.query("insert into ml_runs (id, company_id, model_key, status, rows_used, metrics, created_at, finished_at) values ($1, $2, $3, 'SUCCEEDED', 100, $4, now() - interval '1 day', now() - interval '1 day')", [id, tenant.companyId, model, JSON.stringify(metrics)]);
    await insert(runs.forecast, "SALES_FORECAST", { test: { model: { mae: 10 } } });
    await insert(runs.segments, "CUSTOMER_SEGMENTS", { k: 2 });
    await insert(runs.anomalies, "SALES_ANOMALIES", { anomalies: 1 });
    await insert(runs.risk, "CANCEL_RISK", { test: { model: { roc_auc: 0.7 } } });
    await db.query("insert into ml_forecasts (run_id, company_id, day, kind, actual, predicted, lower_bound, upper_bound) values ($1, $2, '2026-10-01', 'BACKTEST', 100, 90, 80, 110), ($1, $2, '2026-10-30', 'FORECAST', null, 120, 100, 140)", [runs.forecast, tenant.companyId]);
    await db.query("insert into ml_customer_segments (run_id, company_id, customer_id, segment, segment_name, recency_days, frequency, monetary, pc1, pc2) values ($1, $2, $3, 0, 'Leales', 5, 10, 900, 0.5, -0.2)", [runs.segments, tenant.companyId, customerId]);
    await db.query("insert into ml_anomalies (run_id, company_id, day, actual, expected, score, is_anomaly, direction, explanation) values ($1, $2, '2025-11-28', 500, 200, 4.2, true, 'ALZA', 'Black Friday')", [runs.anomalies, tenant.companyId]);
    return runs;
  }

  beforeAll(async () => {
    db = await createMigratedDatabase("ml");
    free = await seedTenant(db, "F", { planCode: "FREE" });
    plus = await seedTenant(db, "P", { planCode: "PLUS" });
    max = await seedTenant(db, "M", { planCode: "MAX" });
    other = await seedTenant(db, "X", { planCode: "MAX" });
    const customerM = await insertUser(db, { email: "cliente-ml-m@test.local", role: "CUSTOMER" });
    const customerX = await insertUser(db, { email: "cliente-ml-x@test.local", role: "CUSTOMER" });
    await insertUser(db, { email: "plataforma-ml@test.local", role: "PLATFORM_ADMIN" });
    Object.assign(savedRuns, await seedResults(max, customerM));
    savedRuns.otherForecast = (await seedResults(other, customerX)).forecast;
    server = await startTestApp(db);
    client = server.app.get(MlClient);
    for (const tenant of [free, plus, max, other]) {
      tokens[`owner${tenant.label}`] = await login(server.baseUrl, tenant.ownerEmail);
      tokens[`manager${tenant.label}`] = await login(server.baseUrl, tenant.managerEmail);
    }
    tokens.platform = await login(server.baseUrl, "plataforma-ml@test.local");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.query("delete from ml_runs where status in ('QUEUED', 'RUNNING')");
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  const reads = (companyId: string) => ["overview", "forecast", "segments", "cancel-risk", "anomalies"].map((path) => `/api/admin/ml/${path}?companyId=${companyId}`);

  it("MAX lee sus resultados guardados aunque el servicio ML esté caído", async () => {
    const overview = await call<MlOverview>(tokens.ownerM, "GET", `/api/admin/ml/overview?companyId=${max.companyId}`);
    expect(overview.status, overview.text).toBe(200);
    expect(overview.body.service.available).toBe(false);
    expect(overview.body.models.map((model) => model.modelKey)).toEqual(["SALES_FORECAST", "CANCEL_RISK", "CUSTOMER_SEGMENTS", "SALES_ANOMALIES"]);
    expect(overview.body.models.every((model) => model.lastSuccess?.status === "SUCCEEDED")).toBe(true);
    const forecast = await call<MlForecast>(tokens.ownerM, "GET", `/api/admin/ml/forecast?companyId=${max.companyId}`);
    expect(forecast.body.run?.id).toBe(savedRuns.forecast);
    expect(forecast.body.points.map((point) => point.kind)).toEqual(["BACKTEST", "FORECAST"]);
    const segments = await call<MlSegments>(tokens.ownerM, "GET", `/api/admin/ml/segments?companyId=${max.companyId}`);
    expect(segments.body.customers).toHaveLength(1);
    expect(segments.text).not.toContain("cliente-ml-x");
  });

  it("FREE y PLUS reciben 403 PLAN_LIMIT_REPORT_FEATURE en todas las rutas; el encargado no entra", async () => {
    for (const [token, tenant] of [[tokens.ownerF, free], [tokens.ownerP, plus]] as const) {
      for (const path of reads(tenant.companyId)) {
        const result = await call(token, "GET", path);
        expect(result.status, `${path} ${result.text}`).toBe(403);
        expect((result.body as { code?: string }).code).toBe("PLAN_LIMIT_REPORT_FEATURE");
      }
      const start = await call(token, "POST", "/api/admin/ml/runs", { companyId: tenant.companyId });
      expect(start.status).toBe(403);
      expect(start.text).toContain("MAX");
    }
    for (const path of reads(max.companyId)) expect((await call(tokens.managerM, "GET", path)).status).toBe(403);
  });

  it("aislamiento: MAX no lee ni entrena otra compañía MAX; PLATFORM_ADMIN sí accede", async () => {
    for (const path of reads(other.companyId)) {
      const result = await call(tokens.ownerM, "GET", path);
      expect(result.status, path).toBe(404);
      expect(result.text).not.toContain(savedRuns.otherForecast);
    }
    expect((await call(tokens.ownerM, "GET", `/api/admin/ml/runs/${savedRuns.otherForecast}?companyId=${max.companyId}`)).status).toBe(404);
    expect((await call(tokens.ownerM, "GET", `/api/admin/ml/runs/${savedRuns.otherForecast}?companyId=${other.companyId}`)).status).toBe(404);
    expect((await call(tokens.ownerM, "POST", "/api/admin/ml/runs", { companyId: other.companyId })).status).toBe(404);
    const platform = await call<MlOverview>(tokens.platform, "GET", `/api/admin/ml/overview?companyId=${other.companyId}`);
    expect(platform.status, platform.text).toBe(200);
  });

  it("ciclo de corrida con un doble del servicio ML: 202 → QUEUED → RUNNING → SUCCEEDED y resultados nuevos", async () => {
    let received: Record<string, string> = {};
    vi.spyOn(client, "train").mockImplementation(async (companyId, runs) => {
      received = runs as Record<string, string>;
      expect(companyId).toBe(max.companyId);
      return "ACCEPTED";
    });
    const started = await call<StartMlRunsResponse>(tokens.ownerM, "POST", "/api/admin/ml/runs", { companyId: max.companyId, models: ["SALES_FORECAST"] });
    expect(started.status, started.text).toBe(202);
    const runId = started.body.runIds.SALES_FORECAST!;
    expect(received).toEqual({ SALES_FORECAST: runId });
    expect((await call<MlRun>(tokens.ownerM, "GET", `/api/admin/ml/runs/${runId}?companyId=${max.companyId}`)).body.status).toBe("QUEUED");
    expect((await call<MlOverview>(tokens.ownerM, "GET", `/api/admin/ml/overview?companyId=${max.companyId}`)).body.training).toBe(true);

    // Lo que haría Python: RUNNING, resultados y SUCCEEDED.
    await db.query("update ml_runs set status = 'RUNNING', started_at = now() where id = $1", [runId]);
    expect((await call<MlRun>(tokens.ownerM, "GET", `/api/admin/ml/runs/${runId}?companyId=${max.companyId}`)).body.status).toBe("RUNNING");
    await db.query("insert into ml_forecasts (run_id, company_id, day, kind, actual, predicted) values ($1, $2, '2026-11-01', 'FORECAST', null, 321)", [runId, max.companyId]);
    await db.query("update ml_runs set status = 'SUCCEEDED', finished_at = now(), metrics = '{\"test\":{\"model\":{\"mae\":5}}}' where id = $1", [runId]);
    const forecast = await call<MlForecast>(tokens.ownerM, "GET", `/api/admin/ml/forecast?companyId=${max.companyId}`);
    expect(forecast.body.run?.id).toBe(runId);
    expect(forecast.body.points).toEqual([{ day: "2026-11-01", kind: "FORECAST", actual: null, predicted: 321, lower: null, upper: null }]);
  });

  it("409 si ya hay una corrida activa en la tienda o si el servicio está ocupado; las abandonadas no bloquean", async () => {
    vi.spyOn(client, "train").mockResolvedValue("ACCEPTED");
    expect((await call(tokens.ownerM, "POST", "/api/admin/ml/runs", { companyId: max.companyId })).status).toBe(202);
    const again = await call(tokens.ownerM, "POST", "/api/admin/ml/runs", { companyId: max.companyId });
    expect(again.status).toBe(409);
    expect((again.body as { code?: string }).code).toBe("ML_RUN_IN_PROGRESS");

    await db.query("update ml_runs set created_at = now() - interval '2 hours' where status in ('QUEUED', 'RUNNING')");
    vi.spyOn(client, "train").mockResolvedValue("BUSY");
    const busy = await call(tokens.ownerM, "POST", "/api/admin/ml/runs", { companyId: max.companyId });
    expect(busy.status).toBe(409);
    const [{ queued, abandoned }] = await db.query<{ queued: string; abandoned: string }>(
      "select count(*) filter (where status = 'QUEUED') queued, count(*) filter (where status = 'FAILED' and error like 'Corrida abandonada%') abandoned from ml_runs where company_id = $1", [max.companyId]) as [{ queued: string; abandoned: string }];
    expect(Number(queued)).toBe(0);
    expect(Number(abandoned)).toBe(4);
  });

  it("servicio ML caído: 503 ML_SERVICE_UNAVAILABLE, sin corridas colgadas y con los resultados previos visibles", async () => {
    const down = await call(tokens.ownerM, "POST", "/api/admin/ml/runs", { companyId: max.companyId });
    expect(down.status, down.text).toBe(503);
    expect((down.body as { code?: string }).code).toBe("ML_SERVICE_UNAVAILABLE");
    expect(Number((await db.query<{ n: string }>("select count(*) n from ml_runs where company_id = $1 and status = 'QUEUED'", [max.companyId]))[0]!.n)).toBe(0);
    const forecast = await call<MlForecast>(tokens.ownerM, "GET", `/api/admin/ml/forecast?companyId=${max.companyId}`);
    expect(forecast.status).toBe(200);
    expect(forecast.body.run?.status).toBe("SUCCEEDED");
  });

  it("valida entradas: companyId malformado, modelo inventado y campos extra", async () => {
    expect((await call(tokens.ownerM, "GET", "/api/admin/ml/overview?companyId=abc")).status).toBe(400);
    expect((await call(tokens.ownerM, "POST", "/api/admin/ml/runs", { companyId: max.companyId, models: ["DROP_TABLE"] })).status).toBe(400);
    expect((await call(tokens.ownerM, "POST", "/api/admin/ml/runs", { companyId: max.companyId, sql: "x" })).status).toBe(400);
    expect((await call(tokens.ownerM, "GET", `/api/admin/ml/runs/not-a-uuid?companyId=${max.companyId}`)).status).toBe(400);
  });
});

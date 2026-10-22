import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { sql, type SQL } from "drizzle-orm";
import type { MlAnomalies, MlCancelRisk, MlForecast, MlModelKey, MlRun, MlSegments } from "@velora/contracts";
import { DatabaseService } from "../database/database.service.js";

type Row = Record<string, unknown>;

/** Corridas en cola o en curso por más de este tiempo se consideran abandonadas (servicio caído). */
export const STALE_RUN_MINUTES = 30;

const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : null);
const day = (value: unknown) => (value ? (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)) : null);
const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/** Lecturas y escrituras de ml_*: TODA consulta filtra por company_id. */
@Injectable()
export class MlRepository {
  constructor(private readonly database: DatabaseService) {}

  private async rows(query: SQL): Promise<Row[]> {
    return (await this.database.db.execute(query)).rows as Row[];
  }

  private toRun(row: Row): MlRun {
    return {
      id: String(row.id), companyId: String(row.company_id), modelKey: row.model_key as MlModelKey, status: row.status as MlRun["status"],
      rowsUsed: num(row.rows_used), dataFrom: day(row.data_from), dataTo: day(row.data_to),
      metrics: (row.metrics ?? {}) as Record<string, unknown>, params: (row.params ?? {}) as Record<string, unknown>,
      artifactVersion: (row.artifact_version as string | null) ?? null, error: (row.error as string | null) ?? null,
      createdAt: iso(row.created_at)!, startedAt: iso(row.started_at), finishedAt: iso(row.finished_at),
    };
  }

  /** Marca como FAILED las corridas abandonadas (en cola o en curso hace más de 30 minutos). */
  async failStale(companyId: string): Promise<void> {
    await this.database.db.execute(sql`
      update ml_runs set status = 'FAILED', error = 'Corrida abandonada: el servicio ML no la terminó.', finished_at = now()
      where company_id = ${companyId}::uuid and status in ('QUEUED', 'RUNNING') and created_at < now() - make_interval(mins => ${STALE_RUN_MINUTES})`);
  }

  async activeRuns(companyId: string): Promise<MlRun[]> {
    return (await this.rows(sql`select * from ml_runs where company_id = ${companyId}::uuid and status in ('QUEUED', 'RUNNING') order by created_at`)).map((row) => this.toRun(row));
  }

  async createRuns(companyId: string, models: MlModelKey[], requestedBy: string): Promise<Record<string, string>> {
    const runs = Object.fromEntries(models.map((model) => [model, randomUUID()]));
    for (const [model, id] of Object.entries(runs)) {
      await this.database.db.execute(sql`insert into ml_runs (id, company_id, model_key, status, requested_by) values (${id}::uuid, ${companyId}::uuid, ${model}, 'QUEUED', ${requestedBy}::uuid)`);
    }
    return runs;
  }

  async deleteQueued(companyId: string, ids: string[]): Promise<void> {
    await this.database.db.execute(sql`delete from ml_runs where company_id = ${companyId}::uuid and status = 'QUEUED' and id::text = any(${sql.param(ids)}::text[])`);
  }

  async run(companyId: string, id: string): Promise<MlRun | null> {
    const [row] = await this.rows(sql`select * from ml_runs where company_id = ${companyId}::uuid and id = ${id}::uuid`);
    return row ? this.toRun(row) : null;
  }

  /** Por modelo: la corrida más reciente y la última exitosa. */
  async latestByModel(companyId: string): Promise<Map<MlModelKey, { latest: MlRun | null; lastSuccess: MlRun | null }>> {
    const rows = await this.rows(sql`
      select distinct on (model_key, kind) * from (
        select r.*, 'latest' kind from ml_runs r where r.company_id = ${companyId}::uuid
        union all
        select r.*, 'success' kind from ml_runs r where r.company_id = ${companyId}::uuid and r.status = 'SUCCEEDED'
      ) x order by model_key, kind, created_at desc`);
    const result = new Map<MlModelKey, { latest: MlRun | null; lastSuccess: MlRun | null }>();
    for (const row of rows) {
      const entry = result.get(row.model_key as MlModelKey) ?? { latest: null, lastSuccess: null };
      if (row.kind === "latest") entry.latest = this.toRun(row); else entry.lastSuccess = this.toRun(row);
      result.set(row.model_key as MlModelKey, entry);
    }
    return result;
  }

  /** Última corrida TERMINADA con resultado mostrable (exitosa o sin datos suficientes). */
  async lastFinished(companyId: string, model: MlModelKey): Promise<MlRun | null> {
    const [row] = await this.rows(sql`select * from ml_runs where company_id = ${companyId}::uuid and model_key = ${model} and status in ('SUCCEEDED', 'INSUFFICIENT_DATA') order by created_at desc limit 1`);
    return row ? this.toRun(row) : null;
  }

  async forecastPoints(companyId: string, runId: string): Promise<MlForecast["points"]> {
    return (await this.rows(sql`select day, kind, actual, predicted, lower_bound, upper_bound from ml_forecasts where company_id = ${companyId}::uuid and run_id = ${runId}::uuid order by day`))
      .map((row) => ({ day: day(row.day)!, kind: row.kind as "BACKTEST" | "FORECAST", actual: num(row.actual), predicted: Number(row.predicted), lower: num(row.lower_bound), upper: num(row.upper_bound) }));
  }

  async segmentCustomers(companyId: string, runId: string): Promise<MlSegments["customers"]> {
    return (await this.rows(sql`
      select m.customer_id, coalesce(nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email, 'Cliente') as name, m.segment, m.segment_name,
             m.recency_days, m.frequency, m.monetary, m.pc1, m.pc2
      from ml_customer_segments m join app_users u on u.id = m.customer_id
      where m.company_id = ${companyId}::uuid and m.run_id = ${runId}::uuid order by m.monetary desc`))
      .map((row) => ({ customerId: String(row.customer_id), name: String(row.name), segment: Number(row.segment), segmentName: String(row.segment_name), recencyDays: Number(row.recency_days), frequency: Number(row.frequency), monetary: Number(row.monetary), pc1: Number(row.pc1), pc2: Number(row.pc2) }));
  }

  async riskOrders(companyId: string, runId: string): Promise<MlCancelRisk["orders"]> {
    return (await this.rows(sql`
      select r.order_id, o.order_number, o.created_at, o.total, r.probability, r.risk_level, r.features
      from ml_order_risk r join orders o on o.id = r.order_id
      where r.company_id = ${companyId}::uuid and r.run_id = ${runId}::uuid order by r.probability desc limit 100`))
      .map((row) => ({ orderId: String(row.order_id), orderNumber: String(row.order_number), createdAt: iso(row.created_at)!, total: Number(row.total), probability: Number(row.probability), riskLevel: row.risk_level as "ALTO" | "MEDIO" | "BAJO", features: (row.features ?? {}) as Record<string, unknown> }));
  }

  async anomalyDays(companyId: string, runId: string): Promise<MlAnomalies["days"]> {
    return (await this.rows(sql`select day, actual, expected, score, is_anomaly, direction, explanation from ml_anomalies where company_id = ${companyId}::uuid and run_id = ${runId}::uuid order by day`))
      .map((row) => ({ day: day(row.day)!, actual: Number(row.actual), expected: Number(row.expected), score: Number(row.score), isAnomaly: Boolean(row.is_anomaly), direction: (row.direction as "ALZA" | "BAJA" | null) ?? null, explanation: (row.explanation as string | null) ?? null }));
  }
}

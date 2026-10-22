import { Injectable } from "@nestjs/common";
import {
  ML_MODEL_LABELS, mlModelKeySchema,
  type MlAnomalies, type MlCancelRisk, type MlForecast, type MlModelKey, type MlOverview, type MlRun, type MlSegments, type StartMlRunsResponse,
} from "@velora/contracts";
import type { AuthPrincipal } from "../auth/security.js";
import { TenantScopeService } from "../common/authz/tenant-scope.service.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { PlanLimitsService } from "../plans/plan-limits.service.js";
import { MlClient, MlServiceUnavailableError } from "./ml-client.js";
import { MlRepository } from "./ml.repository.js";

const MODELS = mlModelKeySchema.options;

/**
 * Dashboards de ML (solo MAX). Orden de controles: alcance de la compañía (TenantScopeService:
 * ajena → 404) y luego plan (PlanLimitsService, ML_DASHBOARDS → 403 PLAN_LIMIT_REPORT_FEATURE).
 * Las lecturas no dependen del servicio Python: muestran lo último guardado.
 */
@Injectable()
export class MlService {
  constructor(
    private readonly tenants: TenantScopeService,
    private readonly limits: PlanLimitsService,
    private readonly repository: MlRepository,
    private readonly client: MlClient,
  ) {}

  private async access(principal: AuthPrincipal, companyId: string) {
    const actor = await this.tenants.requireCompany(principal, companyId);
    await this.limits.assertReportFeature(companyId, "ML_DASHBOARDS", 403);
    return actor;
  }

  async overview(principal: AuthPrincipal, companyId: string): Promise<MlOverview> {
    await this.access(principal, companyId);
    await this.repository.failStale(companyId);
    const [service, latest, active] = await Promise.all([this.client.health(), this.repository.latestByModel(companyId), this.repository.activeRuns(companyId)]);
    return {
      companyId, service, training: active.length > 0,
      models: MODELS.map((modelKey) => ({ modelKey, label: ML_MODEL_LABELS[modelKey], latest: latest.get(modelKey)?.latest ?? null, lastSuccess: latest.get(modelKey)?.lastSuccess ?? null })),
    };
  }

  async start(principal: AuthPrincipal, companyId: string, models: MlModelKey[] | undefined): Promise<StartMlRunsResponse> {
    const actor = await this.access(principal, companyId);
    await this.repository.failStale(companyId);
    if ((await this.repository.activeRuns(companyId)).length > 0) {
      throw ApiHttpError.coded(409, "ML_RUN_IN_PROGRESS", "Ya hay un entrenamiento en curso para esta tienda. Espera a que termine.");
    }
    const runIds = await this.repository.createRuns(companyId, [...new Set(models ?? MODELS)], actor.userId);
    let outcome;
    try {
      outcome = await this.client.train(companyId, runIds);
    } catch (error) {
      await this.repository.deleteQueued(companyId, Object.values(runIds));
      if (error instanceof MlServiceUnavailableError) {
        throw ApiHttpError.coded(503, "ML_SERVICE_UNAVAILABLE", "El servicio de Machine Learning no está disponible. Se muestran los últimos resultados guardados; inténtalo más tarde.", { reason: error.message });
      }
      throw error;
    }
    if (outcome === "BUSY") {
      await this.repository.deleteQueued(companyId, Object.values(runIds));
      throw ApiHttpError.coded(409, "ML_RUN_IN_PROGRESS", "El servicio de Machine Learning está entrenando otra tienda. Inténtalo en unos minutos.");
    }
    return { runIds };
  }

  async run(principal: AuthPrincipal, companyId: string, id: string): Promise<MlRun> {
    await this.access(principal, companyId);
    const run = await this.repository.run(companyId, id);
    if (!run) throw new ApiHttpError(404, "Corrida no encontrada.");
    return run;
  }

  private async finished(principal: AuthPrincipal, companyId: string, model: MlModelKey): Promise<MlRun | null> {
    await this.access(principal, companyId);
    return this.repository.lastFinished(companyId, model);
  }

  async forecast(principal: AuthPrincipal, companyId: string): Promise<MlForecast> {
    const run = await this.finished(principal, companyId, "SALES_FORECAST");
    return { run, points: run?.status === "SUCCEEDED" ? await this.repository.forecastPoints(companyId, run.id) : [] };
  }

  async segments(principal: AuthPrincipal, companyId: string): Promise<MlSegments> {
    const run = await this.finished(principal, companyId, "CUSTOMER_SEGMENTS");
    return { run, customers: run?.status === "SUCCEEDED" ? await this.repository.segmentCustomers(companyId, run.id) : [] };
  }

  async cancelRisk(principal: AuthPrincipal, companyId: string): Promise<MlCancelRisk> {
    const run = await this.finished(principal, companyId, "CANCEL_RISK");
    return { run, orders: run?.status === "SUCCEEDED" ? await this.repository.riskOrders(companyId, run.id) : [] };
  }

  async anomalies(principal: AuthPrincipal, companyId: string): Promise<MlAnomalies> {
    const run = await this.finished(principal, companyId, "SALES_ANOMALIES");
    return { run, days: run?.status === "SUCCEEDED" ? await this.repository.anomalyDays(companyId, run.id) : [] };
  }
}

import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { reportDefinitions, type ReportDefinitionRow } from "@velora/database";
import {
  reportBuilderDefinitionSchema, type CreateReportDefinitionRequest, type ReportBuilderDefinition, type ReportDefinition, type UpdateReportDefinitionRequest,
} from "@velora/contracts";
import type { AuthPrincipal } from "../../auth/security.js";
import { assertCompanyAccess, TenantScopeService } from "../../common/authz/tenant-scope.service.js";
import { ApiHttpError } from "../../common/http/api-http.error.js";
import { DatabaseService } from "../../database/database.service.js";
import { PlanLimitsService } from "../../plans/plan-limits.service.js";
import { ReportBuilderService } from "./report-builder.service.js";

/**
 * Definiciones guardadas del constructor (V32). Alcance por propietario: solo las compañías
 * del ADMIN (TenantScopeService); una definición de otra compañía responde 404 sin revelarla.
 */
@Injectable()
export class ReportDefinitionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenants: TenantScopeService,
    private readonly limits: PlanLimitsService,
    private readonly builder: ReportBuilderService,
  ) {}

  async list(principal: AuthPrincipal, companyId: string): Promise<ReportDefinition[]> {
    await this.tenants.requireCompany(principal, companyId);
    await this.limits.assertReportFeature(companyId, "DYNAMIC_REPORTS", 403);
    const rows = await this.database.db.select().from(reportDefinitions).where(eq(reportDefinitions.companyId, companyId)).orderBy(asc(reportDefinitions.name));
    return rows.map((row) => this.toContract(row));
  }

  async create(principal: AuthPrincipal, request: CreateReportDefinitionRequest): Promise<ReportDefinition> {
    const actor = await this.tenants.requireCompany(principal, request.companyId);
    await this.assertDefinition(request.companyId, request.definition);
    const now = new Date();
    try {
      const [row] = await this.database.db.insert(reportDefinitions).values({
        id: randomUUID(), companyId: request.companyId, createdBy: actor.userId, name: request.name.trim(),
        definition: request.definition as unknown as Record<string, unknown>, createdAt: now, updatedAt: now,
      }).returning();
      return this.toContract(row!);
    } catch (error) {
      throw this.duplicate(error) ?? error;
    }
  }

  async update(principal: AuthPrincipal, id: string, request: UpdateReportDefinitionRequest): Promise<ReportDefinition> {
    const row = await this.owned(principal, id);
    if (request.definition) await this.assertDefinition(row.companyId, request.definition);
    else await this.limits.assertReportFeature(row.companyId, "DYNAMIC_REPORTS", 403);
    try {
      const [updated] = await this.database.db.update(reportDefinitions).set({
        ...(request.name ? { name: request.name.trim() } : {}),
        ...(request.definition ? { definition: request.definition as unknown as Record<string, unknown> } : {}),
        updatedAt: new Date(),
      }).where(and(eq(reportDefinitions.id, id), eq(reportDefinitions.companyId, row.companyId))).returning();
      return this.toContract(updated!);
    } catch (error) {
      throw this.duplicate(error) ?? error;
    }
  }

  async remove(principal: AuthPrincipal, id: string): Promise<void> {
    const row = await this.owned(principal, id);
    await this.limits.assertReportFeature(row.companyId, "DYNAMIC_REPORTS", 403);
    await this.database.db.delete(reportDefinitions).where(and(eq(reportDefinitions.id, id), eq(reportDefinitions.companyId, row.companyId)));
  }

  private async owned(principal: AuthPrincipal, id: string): Promise<ReportDefinitionRow> {
    const actor = await this.tenants.resolve(principal);
    const [row] = await this.database.db.select().from(reportDefinitions).where(eq(reportDefinitions.id, id)).limit(1);
    if (!row) throw new ApiHttpError(404, "Reporte guardado no encontrado.");
    assertCompanyAccess(actor, row.companyId);
    return row;
  }

  /** Mismas reglas que al ejecutar: constructor habilitado, identificadores del nivel y combinaciones válidas. */
  private async assertDefinition(companyId: string, definition: ReportBuilderDefinition): Promise<void> {
    await this.limits.assertReportFeature(companyId, "DYNAMIC_REPORTS", 403);
    const policy = await this.limits.reportPolicy(companyId);
    await this.builder.assertTier(policy.tier, definition);
    this.builder.validate(definition);
  }

  private duplicate(error: unknown): ApiHttpError | null {
    const code = (error as { code?: string })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
    return code === "23505" ? new ApiHttpError(409, "Ya existe un reporte guardado con ese nombre.", { name: "Nombre repetido." }) : null;
  }

  private toContract(row: ReportDefinitionRow): ReportDefinition {
    const parsed = reportBuilderDefinitionSchema.safeParse(row.definition);
    return {
      id: row.id, companyId: row.companyId, name: row.name, createdBy: row.createdBy,
      // Una definición antigua que ya no valide vuelve como una consulta mínima (no rompe el listado).
      definition: parsed.success ? parsed.data : reportBuilderDefinitionSchema.parse({ dimensions: [], measures: ["NET_SALES"] }),
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    };
  }
}

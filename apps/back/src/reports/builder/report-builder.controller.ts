import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, Req, StreamableFile, UseGuards } from "@nestjs/common";
import {
  adminReportBuilderQuerySchema, adminReportQuerySchema, createReportDefinitionRequestSchema, managerReportBuilderQuerySchema, managerReportQuerySchema,
  reportDefinitionsQuerySchema, reportEntityIdSchema, reportExportQuerySchema, updateReportDefinitionRequestSchema,
  type AdminReportBuilderQuery, type CreateReportDefinitionRequest, type ManagerReportBuilderQuery, type ReportBuilderResult, type ReportDefinition,
  type ReportExportFormat, type ReportSemanticCatalog, type UpdateReportDefinitionRequest,
} from "@velora/contracts";
import { z } from "zod";
import { BearerAuthGuard } from "../../auth/bearer-auth.guard.js";
import type { AuthPrincipal } from "../../auth/security.js";
import { RequireRoles } from "../../common/authz/roles.decorator.js";
import { RolesGuard } from "../../common/authz/roles.guard.js";
import { ApiHttpError } from "../../common/http/api-http.error.js";
import type { AuthenticatedRequest } from "../../common/http/authenticated-request.js";
import { ZodValidationPipe } from "../../common/http/zod-validation.pipe.js";
import { ReportExportService, type ExportedFile } from "../export/report-export.service.js";
import { ReportBuilderService } from "./report-builder.service.js";
import { ReportDefinitionsService } from "./report-definitions.service.js";

const adminCatalogQuery = z.object({ companyId: reportEntityIdSchema });
const adminOverviewExportQuery = adminReportQuerySchema.extend(reportExportQuerySchema.shape);
const managerOverviewExportQuery = managerReportQuerySchema.extend(reportExportQuerySchema.shape);

/**
 * Fase 3 · Constructor dinámico, definiciones guardadas y exportación XLSX/PDF.
 * ADMIN pasa `companyId` (validado contra TenantScopeService); el encargado queda fijado a su sucursal.
 */
@Controller("api")
@UseGuards(BearerAuthGuard, RolesGuard)
export class ReportBuilderController {
  constructor(
    private readonly builder: ReportBuilderService,
    private readonly definitions: ReportDefinitionsService,
    private readonly exporter: ReportExportService,
  ) {}

  @Get("admin/reports/semantic-catalog")
  @RequireRoles("ADMIN")
  adminCatalog(@Req() request: AuthenticatedRequest, @Query(new ZodValidationPipe(adminCatalogQuery)) query: { companyId: string }): Promise<ReportSemanticCatalog> {
    return this.builder.catalog(this.principal(request), query.companyId);
  }

  @Get("manager/reports/semantic-catalog")
  @RequireRoles("STORE_MANAGER")
  managerCatalog(@Req() request: AuthenticatedRequest): Promise<ReportSemanticCatalog> {
    return this.builder.catalog(this.principal(request), null);
  }

  @Post("admin/reports/query")
  @RequireRoles("ADMIN")
  @HttpCode(HttpStatus.OK)
  async adminQuery(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(adminReportBuilderQuerySchema)) body: AdminReportBuilderQuery): Promise<ReportBuilderResult> {
    const { companyId, ...definition } = body;
    return (await this.builder.run(this.principal(request), companyId, definition)).result;
  }

  @Post("manager/reports/query")
  @RequireRoles("STORE_MANAGER")
  @HttpCode(HttpStatus.OK)
  async managerQuery(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(managerReportBuilderQuerySchema)) body: ManagerReportBuilderQuery): Promise<ReportBuilderResult> {
    return (await this.builder.run(this.principal(request), null, body)).result;
  }

  @Post("admin/reports/query/export")
  @RequireRoles("ADMIN")
  @HttpCode(HttpStatus.OK)
  async adminQueryExport(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(reportExportQuerySchema)) query: { format: ReportExportFormat },
    @Body(new ZodValidationPipe(adminReportBuilderQuerySchema)) body: AdminReportBuilderQuery,
  ): Promise<StreamableFile> {
    const { companyId, ...definition } = body;
    return this.file(await this.exporter.exportQuery(this.principal(request), companyId, definition, query.format));
  }

  @Post("manager/reports/query/export")
  @RequireRoles("STORE_MANAGER")
  @HttpCode(HttpStatus.OK)
  async managerQueryExport(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(reportExportQuerySchema)) query: { format: ReportExportFormat },
    @Body(new ZodValidationPipe(managerReportBuilderQuerySchema)) body: ManagerReportBuilderQuery,
  ): Promise<StreamableFile> {
    return this.file(await this.exporter.exportQuery(this.principal(request), null, body, query.format));
  }

  @Get("admin/reports/overview/export")
  @RequireRoles("ADMIN")
  async adminOverviewExport(@Req() request: AuthenticatedRequest, @Query(new ZodValidationPipe(adminOverviewExportQuery)) query: z.infer<typeof adminOverviewExportQuery>): Promise<StreamableFile> {
    return this.file(await this.exporter.exportOverview(this.principal(request), query.companyId, query.storeId ?? null, query.from ?? null, query.to ?? null, query.format));
  }

  @Get("manager/reports/overview/export")
  @RequireRoles("STORE_MANAGER")
  async managerOverviewExport(@Req() request: AuthenticatedRequest, @Query(new ZodValidationPipe(managerOverviewExportQuery)) query: z.infer<typeof managerOverviewExportQuery>): Promise<StreamableFile> {
    return this.file(await this.exporter.exportOverview(this.principal(request), null, null, query.from ?? null, query.to ?? null, query.format));
  }

  @Get("admin/reports/definitions")
  @RequireRoles("ADMIN")
  listDefinitions(@Req() request: AuthenticatedRequest, @Query(new ZodValidationPipe(reportDefinitionsQuerySchema)) query: { companyId: string }): Promise<ReportDefinition[]> {
    return this.definitions.list(this.principal(request), query.companyId);
  }

  @Post("admin/reports/definitions")
  @RequireRoles("ADMIN")
  createDefinition(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(createReportDefinitionRequestSchema)) body: CreateReportDefinitionRequest): Promise<ReportDefinition> {
    return this.definitions.create(this.principal(request), body);
  }

  @Put("admin/reports/definitions/:id")
  @RequireRoles("ADMIN")
  updateDefinition(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ZodValidationPipe(reportEntityIdSchema)) id: string,
    @Body(new ZodValidationPipe(updateReportDefinitionRequestSchema)) body: UpdateReportDefinitionRequest,
  ): Promise<ReportDefinition> {
    return this.definitions.update(this.principal(request), id, body);
  }

  @Delete("admin/reports/definitions/:id")
  @RequireRoles("ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDefinition(@Req() request: AuthenticatedRequest, @Param("id", new ZodValidationPipe(reportEntityIdSchema)) id: string): Promise<void> {
    await this.definitions.remove(this.principal(request), id);
  }

  private file(exported: ExportedFile): StreamableFile {
    return new StreamableFile(exported.buffer, {
      type: exported.contentType,
      disposition: `attachment; filename="${exported.filename}"`,
      length: exported.buffer.length,
    });
  }

  private principal(request: AuthenticatedRequest): AuthPrincipal {
    if (!request.authPrincipal) throw new ApiHttpError(401, "No autenticado.");
    return request.authPrincipal;
  }
}

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  mlCompanyQuerySchema, reportEntityIdSchema, startMlRunsRequestSchema,
  type MlAnomalies, type MlCancelRisk, type MlCompanyQuery, type MlForecast, type MlOverview, type MlRun, type MlSegments, type StartMlRunsRequest, type StartMlRunsResponse,
} from "@velora/contracts";
import { BearerAuthGuard } from "../auth/bearer-auth.guard.js";
import type { AuthPrincipal } from "../auth/security.js";
import { RequireRoles } from "../common/authz/roles.decorator.js";
import { RolesGuard } from "../common/authz/roles.guard.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import type { AuthenticatedRequest } from "../common/http/authenticated-request.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { MlService } from "./ml.service.js";

/** Fase 4 · Dashboards de ML. Propietario (ADMIN) y PLATFORM_ADMIN; el encargado no entra. */
@Controller("api/admin/ml")
@UseGuards(BearerAuthGuard, RolesGuard)
@RequireRoles("ADMIN", "PLATFORM_ADMIN")
export class MlController {
  constructor(private readonly ml: MlService) {}

  @Get("overview")
  overview(@Req() request: AuthenticatedRequest, @Query(new ZodValidationPipe(mlCompanyQuerySchema)) query: MlCompanyQuery): Promise<MlOverview> {
    return this.ml.overview(this.principal(request), query.companyId);
  }

  @Post("runs")
  @HttpCode(HttpStatus.ACCEPTED)
  start(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(startMlRunsRequestSchema)) body: StartMlRunsRequest): Promise<StartMlRunsResponse> {
    return this.ml.start(this.principal(request), body.companyId, body.models);
  }

  @Get("runs/:id")
  run(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ZodValidationPipe(reportEntityIdSchema)) id: string,
    @Query(new ZodValidationPipe(mlCompanyQuerySchema)) query: MlCompanyQuery,
  ): Promise<MlRun> {
    return this.ml.run(this.principal(request), query.companyId, id);
  }

  @Get("forecast")
  forecast(@Req() request: AuthenticatedRequest, @Query(new ZodValidationPipe(mlCompanyQuerySchema)) query: MlCompanyQuery): Promise<MlForecast> {
    return this.ml.forecast(this.principal(request), query.companyId);
  }

  @Get("segments")
  segments(@Req() request: AuthenticatedRequest, @Query(new ZodValidationPipe(mlCompanyQuerySchema)) query: MlCompanyQuery): Promise<MlSegments> {
    return this.ml.segments(this.principal(request), query.companyId);
  }

  @Get("cancel-risk")
  cancelRisk(@Req() request: AuthenticatedRequest, @Query(new ZodValidationPipe(mlCompanyQuerySchema)) query: MlCompanyQuery): Promise<MlCancelRisk> {
    return this.ml.cancelRisk(this.principal(request), query.companyId);
  }

  @Get("anomalies")
  anomalies(@Req() request: AuthenticatedRequest, @Query(new ZodValidationPipe(mlCompanyQuerySchema)) query: MlCompanyQuery): Promise<MlAnomalies> {
    return this.ml.anomalies(this.principal(request), query.companyId);
  }

  private principal(request: AuthenticatedRequest): AuthPrincipal {
    if (!request.authPrincipal) throw new ApiHttpError(401, "No autenticado.");
    return request.authPrincipal;
  }
}

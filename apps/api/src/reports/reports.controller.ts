import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  adminReportAiNarrativeRequestSchema,
  adminReportAiQueryRequestSchema,
  adminReportQuerySchema,
  managerReportAiNarrativeRequestSchema,
  managerReportAiQueryRequestSchema,
  managerReportQuerySchema,
  type AdminReportAiNarrativeRequest,
  type AdminReportAiQueryRequest,
  type AdminReportQuery,
  type ManagerReportAiNarrativeRequest,
  type ManagerReportAiQueryRequest,
  type ManagerReportQuery,
  type ReportAiNarrativeResponse,
  type ReportAiQueryResponse,
  type ReportOverview,
  type ReportPeriodBounds,
  type ReportVoiceTranscriptionResponse,
} from "@velora/contracts";

import {
  BearerAuthGuard,
} from "../auth/bearer-auth.guard.js";

import type {
  AuthPrincipal,
} from "../auth/security.js";

import {
  RequireRoles,
} from "../common/authz/roles.decorator.js";

import {
  RolesGuard,
} from "../common/authz/roles.guard.js";

import type {
  AuthenticatedRequest,
} from "../common/http/authenticated-request.js";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import {
  ZodValidationPipe,
} from "../common/http/zod-validation.pipe.js";

import {
  ReportAiService,
} from "./report-ai.service.js";

import {
  ReportsService,
} from "./reports.service.js";

@Controller("api")
@UseGuards(
  BearerAuthGuard,
  RolesGuard,
)
export class ReportsController {
  constructor(
    private readonly reports:
      ReportsService,
    private readonly ai:
      ReportAiService,
  ) {}

  @Get("admin/reports/period-bounds")
  @RequireRoles("ADMIN")
  adminPeriodBounds(
    @Req()
    request:
      AuthenticatedRequest,
    @Query(
      new ZodValidationPipe(
        adminReportQuerySchema,
      ),
    )
    query:
      AdminReportQuery,
  ): Promise<ReportPeriodBounds> {
    return this.reports
      .periodBounds(
        this.principal(
          request,
        ),
        query.companyId,
        query.storeId ??
          null,
      );
  }

  @Get("manager/reports/period-bounds")
  @RequireRoles("STORE_MANAGER")
  managerPeriodBounds(
    @Req()
    request:
      AuthenticatedRequest,
    @Query(
      new ZodValidationPipe(
        managerReportQuerySchema,
      ),
    )
    _query:
      ManagerReportQuery,
  ): Promise<ReportPeriodBounds> {
    return this.reports
      .periodBounds(
        this.principal(
          request,
        ),
        null,
        null,
      );
  }

  @Get("admin/reports/overview")
  @RequireRoles("ADMIN")
  adminOverview(
    @Req()
    request:
      AuthenticatedRequest,
    @Query(
      new ZodValidationPipe(
        adminReportQuerySchema,
      ),
    )
    query:
      AdminReportQuery,
  ): Promise<ReportOverview> {
    return this.reports
      .overview(
        this.principal(
          request,
        ),
        query.companyId,
        query.from ??
          null,
        query.to ??
          null,
        query.storeId ??
          null,
      );
  }

  @Get("manager/reports/overview")
  @RequireRoles("STORE_MANAGER")
  managerOverview(
    @Req()
    request:
      AuthenticatedRequest,
    @Query(
      new ZodValidationPipe(
        managerReportQuerySchema,
      ),
    )
    query:
      ManagerReportQuery,
  ): Promise<ReportOverview> {
    return this.reports
      .overview(
        this.principal(
          request,
        ),
        null,
        query.from ??
          null,
        query.to ??
          null,
        null,
      );
  }

  @Post("admin/reports/voice-transcribe")
  @RequireRoles("ADMIN")
  @HttpCode(HttpStatus.OK)
  adminTranscribe(
    @Req()
    request:
      AuthenticatedRequest,
    @Query(
      "companyId",
    )
    companyId:
      string |
      undefined,
    @Body()
    audio:
      Buffer,
    @Headers(
      "content-type",
    )
    contentType:
      string |
      undefined,
  ): Promise<ReportVoiceTranscriptionResponse> {
    if (
      !companyId ||
      !this.isUuid(
        companyId,
      )
    ) {
      throw new ApiHttpError(
        400,
        "Debe seleccionar una compañía válida.",
      );
    }

    return this.ai
      .transcribe(
        this.principal(
          request,
        ),
        companyId,
        audio,
        contentType,
      );
  }

  @Post("manager/reports/voice-transcribe")
  @RequireRoles("STORE_MANAGER")
  @HttpCode(HttpStatus.OK)
  managerTranscribe(
    @Req()
    request:
      AuthenticatedRequest,
    @Body()
    audio:
      Buffer,
    @Headers(
      "content-type",
    )
    contentType:
      string |
      undefined,
  ): Promise<ReportVoiceTranscriptionResponse> {
    return this.ai
      .transcribe(
        this.principal(
          request,
        ),
        null,
        audio,
        contentType,
      );
  }

  @Post("admin/reports/ai-query")
  @RequireRoles("ADMIN")
  @HttpCode(HttpStatus.OK)
  adminAiQuery(
    @Req()
    request:
      AuthenticatedRequest,
    @Body(
      new ZodValidationPipe(
        adminReportAiQueryRequestSchema,
      ),
    )
    body:
      AdminReportAiQueryRequest,
  ): Promise<ReportAiQueryResponse> {
    return this.ai
      .query(
        this.principal(
          request,
        ),
        body.companyId,
        body,
      );
  }

  @Post("manager/reports/ai-query")
  @RequireRoles("STORE_MANAGER")
  @HttpCode(HttpStatus.OK)
  managerAiQuery(
    @Req()
    request:
      AuthenticatedRequest,
    @Body(
      new ZodValidationPipe(
        managerReportAiQueryRequestSchema,
      ),
    )
    body:
      ManagerReportAiQueryRequest,
  ): Promise<ReportAiQueryResponse> {
    return this.ai
      .query(
        this.principal(
          request,
        ),
        null,
        body,
      );
  }

  @Post("admin/reports/ai-narrative")
  @RequireRoles("ADMIN")
  @HttpCode(HttpStatus.OK)
  adminNarrative(
    @Req()
    request:
      AuthenticatedRequest,
    @Body(
      new ZodValidationPipe(
        adminReportAiNarrativeRequestSchema,
      ),
    )
    body:
      AdminReportAiNarrativeRequest,
  ): Promise<ReportAiNarrativeResponse> {
    return this.ai
      .narrative(
        this.principal(
          request,
        ),
        body.companyId,
        body,
      );
  }

  @Post("manager/reports/ai-narrative")
  @RequireRoles("STORE_MANAGER")
  @HttpCode(HttpStatus.OK)
  managerNarrative(
    @Req()
    request:
      AuthenticatedRequest,
    @Body(
      new ZodValidationPipe(
        managerReportAiNarrativeRequestSchema,
      ),
    )
    body:
      ManagerReportAiNarrativeRequest,
  ): Promise<ReportAiNarrativeResponse> {
    return this.ai
      .narrative(
        this.principal(
          request,
        ),
        null,
        body,
      );
  }

  private principal(
    request:
      AuthenticatedRequest,
  ): AuthPrincipal {
    const principal =
      request.authPrincipal;

    if (
      !principal
    ) {
      throw new ApiHttpError(
        401,
        "No autenticado.",
      );
    }

    return principal;
  }

  private isUuid(
    value:
      string,
  ): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(
        value,
      );
  }
}

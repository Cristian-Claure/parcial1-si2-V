import {
  Module,
} from "@nestjs/common";

import {
  AuthModule,
} from "../auth/auth.module.js";

import {
  AuthorizationModule,
} from "../common/authz/authorization.module.js";

import {
  PlansModule,
} from "../plans/plans.module.js";

import {
  RuntimeConfigModule,
} from "../common/config/runtime-config.module.js";

import {
  DatabaseModule,
} from "../database/database.module.js";

import {
  ReportAiService,
} from "./report-ai.service.js";

import {
  ReportsController,
} from "./reports.controller.js";

import {
  ReportsRepository,
} from "./reports.repository.js";

import {
  ReportAnalyticsRepository,
} from "./report-analytics.repository.js";

import {
  ReportExtensionsService,
} from "./report-extensions.service.js";

import {
  ReportsService,
} from "./reports.service.js";

import { CompaniesModule } from "../companies/companies.module.js";
import { ReportBuilderController } from "./builder/report-builder.controller.js";
import { ReportBuilderService } from "./builder/report-builder.service.js";
import { ReportDefinitionsService } from "./builder/report-definitions.service.js";
import { SemanticQueryRepository } from "./builder/semantic-query.repository.js";
import { ReportExportService } from "./export/report-export.service.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuthorizationModule,
    PlansModule,
    RuntimeConfigModule,
    CompaniesModule,
  ],
  controllers: [
    ReportsController,
    ReportBuilderController,
  ],
  providers: [
    SemanticQueryRepository,
    ReportBuilderService,
    ReportDefinitionsService,
    ReportExportService,
    ReportAnalyticsRepository,
    ReportExtensionsService,
    ReportsRepository,
    ReportsService,
    ReportAiService,
  ],
  exports: [
    ReportsService,
  ],
})
export class ReportsModule {}

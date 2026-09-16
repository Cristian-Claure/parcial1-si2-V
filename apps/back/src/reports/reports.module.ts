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
  ReportsService,
} from "./reports.service.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuthorizationModule,
    RuntimeConfigModule,
  ],
  controllers: [
    ReportsController,
  ],
  providers: [
    ReportsRepository,
    ReportsService,
    ReportAiService,
  ],
  exports: [
    ReportsService,
  ],
})
export class ReportsModule {}

import {
  Module,
} from "@nestjs/common";

import {
  APP_INTERCEPTOR,
} from "@nestjs/core";

import {
  AuthModule,
} from "../auth/auth.module.js";

import {
  AuthorizationModule,
} from "../common/authz/authorization.module.js";

import {
  DatabaseModule,
} from "../database/database.module.js";

import {
  UsersModule,
} from "../users/users.module.js";

import {
  AuditController,
} from "./audit.controller.js";

import {
  AuditInterceptor,
} from "./audit.interceptor.js";

import {
  AuditRepository,
} from "./audit.repository.js";

import {
  AuditService,
} from "./audit.service.js";

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [
    AuditController,
  ],
  providers: [
    AuditRepository,
    AuditService,
    {
      provide:
        APP_INTERCEPTOR,
      useClass:
        AuditInterceptor,
    },
  ],
})
export class AuditModule {}

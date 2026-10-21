import {
  Module,
} from "@nestjs/common";

import {
  DatabaseModule,
} from "../../database/database.module.js";

import {
  UsersModule,
} from "../../users/users.module.js";

import {
  AccessContextService,
} from "./access-context.service.js";

import {
  RolesGuard,
} from "./roles.guard.js";

import {
  TenantScopeService,
} from "./tenant-scope.service.js";

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
  ],
  providers: [
    TenantScopeService,
    AccessContextService,
    RolesGuard,
  ],
  exports: [
    TenantScopeService,
    AccessContextService,
    RolesGuard,
  ],
})
export class AuthorizationModule {}

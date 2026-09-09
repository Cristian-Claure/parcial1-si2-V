import {
  Module,
} from "@nestjs/common";

import {
  AuthModule,
} from "./auth/auth.module.js";

import {
  CatalogModule,
} from "./catalog/catalog.module.js";

import {
  AuthorizationModule,
} from "./common/authz/authorization.module.js";

import {
  RuntimeConfigModule,
} from "./common/config/runtime-config.module.js";

import {
  HealthModule,
} from "./health/health.module.js";

import {
  StoresModule,
} from "./stores/stores.module.js";

@Module({
  imports: [
    RuntimeConfigModule,
    HealthModule,
    AuthModule,
    AuthorizationModule,
    StoresModule,
    CatalogModule,
  ],
})
export class AppModule {}

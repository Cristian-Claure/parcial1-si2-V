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
  DatabaseModule,
} from "../database/database.module.js";

import {
  CatalogManageController,
  CatalogPublicController,
} from "./catalog.controller.js";

import {
  CatalogRepository,
} from "./catalog.repository.js";

import {
  CatalogService,
} from "./catalog.service.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [
    CatalogPublicController,
    CatalogManageController,
  ],
  providers: [
    CatalogRepository,
    CatalogService,
  ],
})
export class CatalogModule {}

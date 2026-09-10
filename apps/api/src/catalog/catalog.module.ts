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
  StorageModule,
} from "../storage/storage.module.js";

import {
  CatalogAssetsManageController,
  CatalogAssetsPublicController,
} from "./catalog-assets.controller.js";

import {
  CatalogAssetsRepository,
} from "./catalog-assets.repository.js";

import {
  CatalogAssetsService,
} from "./catalog-assets.service.js";

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
    StorageModule,
  ],
  controllers: [
    CatalogPublicController,
    CatalogManageController,
    CatalogAssetsPublicController,
    CatalogAssetsManageController,
  ],
  providers: [
    CatalogRepository,
    CatalogService,
    CatalogAssetsRepository,
    CatalogAssetsService,
  ],
})
export class CatalogModule {}

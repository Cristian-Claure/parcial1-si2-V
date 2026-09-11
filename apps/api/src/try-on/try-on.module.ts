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
  TryOnController,
} from "./try-on.controller.js";

import {
  TryOnProviderService,
} from "./try-on-provider.service.js";

import {
  TryOnRepository,
} from "./try-on.repository.js";

import {
  TryOnService,
} from "./try-on.service.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuthorizationModule,
    StorageModule,
  ],
  controllers: [
    TryOnController,
  ],
  providers: [
    TryOnRepository,
    TryOnProviderService,
    TryOnService,
  ],
})
export class TryOnModule {}

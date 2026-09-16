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
  StoresController,
} from "./stores.controller.js";

import {
  StoresRepository,
} from "./stores.repository.js";

import {
  StoresService,
} from "./stores.service.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [
    StoresController,
  ],
  providers: [
    StoresRepository,
    StoresService,
  ],
})
export class StoresModule {}

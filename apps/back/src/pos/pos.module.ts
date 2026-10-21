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
  DatabaseModule,
} from "../database/database.module.js";

import {
  PosController,
} from "./pos.controller.js";

import {
  PosRepository,
} from "./pos.repository.js";

import {
  PosService,
} from "./pos.service.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuthorizationModule,
    PlansModule,
  ],
  controllers: [
    PosController,
  ],
  providers: [
    PosRepository,
    PosService,
  ],
})
export class PosModule {}

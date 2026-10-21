import {
  Module,
} from "@nestjs/common";

import {
  RuntimeConfigModule,
} from "../common/config/runtime-config.module.js";

import {
  UsersModule,
} from "../users/users.module.js";

import {
  DatabaseModule,
} from "../database/database.module.js";

import {
  AdminBootstrapService,
} from "./admin-bootstrap.service.js";

import {
  SaasBootstrapService,
} from "./saas-bootstrap.service.js";

@Module({
  imports: [
    RuntimeConfigModule,
    DatabaseModule,
    UsersModule,
  ],
  providers: [
    AdminBootstrapService,
    SaasBootstrapService,
  ],
})
export class BootstrapModule {}

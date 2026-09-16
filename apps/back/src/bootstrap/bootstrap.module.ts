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
  AdminBootstrapService,
} from "./admin-bootstrap.service.js";

@Module({
  imports: [
    RuntimeConfigModule,
    UsersModule,
  ],
  providers: [
    AdminBootstrapService,
  ],
})
export class BootstrapModule {}

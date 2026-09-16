import {
  Module,
} from "@nestjs/common";

import {
  UsersModule,
} from "../../users/users.module.js";

import {
  AccessContextService,
} from "./access-context.service.js";

import {
  RolesGuard,
} from "./roles.guard.js";

@Module({
  imports: [
    UsersModule,
  ],
  providers: [
    AccessContextService,
    RolesGuard,
  ],
  exports: [
    AccessContextService,
    RolesGuard,
  ],
})
export class AuthorizationModule {}

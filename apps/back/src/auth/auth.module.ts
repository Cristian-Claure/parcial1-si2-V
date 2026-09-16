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
  AuthController,
} from "./auth.controller.js";

import {
  AuthRateLimitGuard,
} from "./auth-rate-limit.guard.js";

import {
  AuthRateLimitService,
} from "./auth-rate-limit.service.js";

import {
  AuthService,
} from "./auth.service.js";

import {
  BearerAuthGuard,
} from "./bearer-auth.guard.js";

@Module({
  imports: [
    RuntimeConfigModule,
    UsersModule,
  ],
  controllers: [
    AuthController,
  ],
  providers: [
    AuthService,
    AuthRateLimitService,
    AuthRateLimitGuard,
    BearerAuthGuard,
  ],
  exports: [
    BearerAuthGuard,
  ],
})
export class AuthModule {}

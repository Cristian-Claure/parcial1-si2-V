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
  CheckoutController,
} from "./checkout.controller.js";

import {
  CheckoutRepository,
} from "./checkout.repository.js";

import {
  CheckoutService,
} from "./checkout.service.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [
    CheckoutController,
  ],
  providers: [
    CheckoutRepository,
    CheckoutService,
  ],
})
export class CheckoutModule {}
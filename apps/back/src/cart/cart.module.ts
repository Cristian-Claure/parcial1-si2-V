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
  CartController,
} from "./cart.controller.js";

import {
  CartRepository,
} from "./cart.repository.js";

import {
  CartService,
} from "./cart.service.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [
    CartController,
  ],
  providers: [
    CartRepository,
    CartService,
  ],
})
export class CartModule {}

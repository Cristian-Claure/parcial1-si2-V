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
  OrderOperationsController,
} from "./order-operations.controller.js";

import {
  OrderOperationsRepository,
} from "./order-operations.repository.js";

import {
  OrderOperationsService,
} from "./order-operations.service.js";

import {
  OrdersController,
} from "./orders.controller.js";

import {
  OrdersRepository,
} from "./orders.repository.js";

import {
  OrdersService,
} from "./orders.service.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [
    OrdersController,
    OrderOperationsController,
  ],
  providers: [
    OrdersRepository,
    OrdersService,
    OrderOperationsRepository,
    OrderOperationsService,
  ],
})
export class OrdersModule {}

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
  InventoryController,
} from "./inventory.controller.js";

import {
  InventoryRepository,
} from "./inventory.repository.js";

import {
  InventoryService,
} from "./inventory.service.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [
    InventoryController,
  ],
  providers: [
    InventoryRepository,
    InventoryService,
  ],
})
export class InventoryModule {}

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
  ProductAssistantController,
} from "./product-assistant.controller.js";

import {
  ProductAssistantService,
} from "./product-assistant.service.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [
    ProductAssistantController,
  ],
  providers: [
    ProductAssistantService,
  ],
})
export class AiModule {}

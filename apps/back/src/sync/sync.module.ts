import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../common/authz/authorization.module.js";
import { RuntimeConfigModule } from "../common/config/runtime-config.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { PlansModule } from "../plans/plans.module.js";
import { SyncController } from "./sync.controller.js";
import { SyncRepository } from "./sync.repository.js";
import { SyncService } from "./sync.service.js";

@Module({
  imports: [DatabaseModule, RuntimeConfigModule, AuthModule, AuthorizationModule, PlansModule],
  controllers: [SyncController],
  providers: [SyncRepository, SyncService],
})
export class SyncModule {}

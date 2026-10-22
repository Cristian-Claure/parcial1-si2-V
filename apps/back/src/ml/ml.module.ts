import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../common/authz/authorization.module.js";
import { RuntimeConfigModule } from "../common/config/runtime-config.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { PlansModule } from "../plans/plans.module.js";
import { MlClient } from "./ml-client.js";
import { MlController } from "./ml.controller.js";
import { MlRepository } from "./ml.repository.js";
import { MlService } from "./ml.service.js";

@Module({
  imports: [DatabaseModule, AuthModule, AuthorizationModule, PlansModule, RuntimeConfigModule],
  controllers: [MlController],
  providers: [MlClient, MlRepository, MlService],
})
export class MlModule {}

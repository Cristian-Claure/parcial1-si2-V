import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../common/authz/authorization.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { PlansModule } from "../plans/plans.module.js";
import { PlatformController } from "./platform.controller.js";
import { PlatformService } from "./platform.service.js";

@Module({
  imports: [DatabaseModule, AuthModule, AuthorizationModule, PlansModule],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}

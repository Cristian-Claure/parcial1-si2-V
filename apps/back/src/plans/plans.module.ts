import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../common/authz/authorization.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { AdminPlanController, PublicPlansController } from "./plans.controller.js";
import { PlanLimitsService } from "./plan-limits.service.js";
import { PlansRepository } from "./plans.repository.js";

@Module({
  imports: [DatabaseModule, AuthModule, AuthorizationModule],
  controllers: [PublicPlansController, AdminPlanController],
  providers: [PlansRepository, PlanLimitsService],
  exports: [PlanLimitsService],
})
export class PlansModule {}

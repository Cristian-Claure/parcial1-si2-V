import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../common/authz/authorization.module.js";
import { BillingModule } from "../billing/billing.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { AdminPlanController, PublicPlansController } from "./plans.controller.js";
import { PlanLimitsService } from "./plan-limits.service.js";
import { PlansRepository } from "./plans.repository.js";
import { SubscriptionBillingService } from "./subscription-billing.service.js";

@Module({
  imports: [DatabaseModule, AuthModule, AuthorizationModule, BillingModule],
  controllers: [PublicPlansController, AdminPlanController],
  providers: [PlansRepository, PlanLimitsService, SubscriptionBillingService],
  exports: [PlanLimitsService, SubscriptionBillingService, PlansRepository],
})
export class PlansModule {}

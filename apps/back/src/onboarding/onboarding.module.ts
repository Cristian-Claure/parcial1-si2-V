import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../common/authz/authorization.module.js";
import { RuntimeConfigModule } from "../common/config/runtime-config.module.js";
import { CompaniesRepository } from "../companies/companies.repository.js";
import { DatabaseModule } from "../database/database.module.js";
import { PlansModule } from "../plans/plans.module.js";
import { UsersModule } from "../users/users.module.js";
import { AdminCompanyProvisioningController, OnboardingController } from "./onboarding.controller.js";
import { OnboardingService } from "./onboarding.service.js";
import { ProvisioningRepository } from "./provisioning.repository.js";

@Module({
  imports: [DatabaseModule, RuntimeConfigModule, AuthModule, AuthorizationModule, UsersModule, PlansModule],
  controllers: [OnboardingController, AdminCompanyProvisioningController],
  providers: [ProvisioningRepository, OnboardingService, CompaniesRepository],
  exports: [ProvisioningRepository],
})
export class OnboardingModule {}

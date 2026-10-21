import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../common/authz/authorization.module.js";
import { RuntimeConfigModule } from "../common/config/runtime-config.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { PlansModule } from "../plans/plans.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { AdminBrandingController, PublicBrandingController } from "./branding.controller.js";
import { BrandingService } from "./branding.service.js";
import { AdminCompaniesController, ManagerCompanyController, PublicCompaniesController } from "./companies.controller.js";
import { CompaniesRepository } from "./companies.repository.js";
import { CompaniesService } from "./companies.service.js";

@Module({
  imports: [DatabaseModule, RuntimeConfigModule, AuthModule, AuthorizationModule, PlansModule, StorageModule],
  controllers: [PublicCompaniesController, PublicBrandingController, AdminCompaniesController, AdminBrandingController, ManagerCompanyController],
  providers: [CompaniesRepository, CompaniesService, BrandingService],
  exports: [BrandingService],
})
export class CompaniesModule {}

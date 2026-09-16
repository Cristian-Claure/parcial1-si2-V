import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../common/authz/authorization.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { AdminCompaniesController, ManagerCompanyController, PublicCompaniesController } from "./companies.controller.js";
import { CompaniesRepository } from "./companies.repository.js";
import { CompaniesService } from "./companies.service.js";

@Module({
  imports: [DatabaseModule, AuthModule, AuthorizationModule],
  controllers: [PublicCompaniesController, AdminCompaniesController, ManagerCompanyController],
  providers: [CompaniesRepository, CompaniesService],
})
export class CompaniesModule {}

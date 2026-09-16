import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../common/authz/authorization.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { CustomerController } from "./customer.controller.js";
import { CustomerRepository } from "./customer.repository.js";
import { CustomerService } from "./customer.service.js";

@Module({
  imports: [DatabaseModule, AuthModule, AuthorizationModule],
  controllers: [CustomerController],
  providers: [CustomerRepository, CustomerService],
})
export class CustomerModule {}

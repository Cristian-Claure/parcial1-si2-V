import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../common/authz/authorization.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { CustomerPushService } from "./customer-push.service.js";
import { FirebasePushService } from "./firebase-push.service.js";
import { PushInstallationService } from "./push-installation.service.js";
import { PushController } from "./push.controller.js";
import { PushRepository } from "./push.repository.js";

@Module({
  imports: [DatabaseModule, AuthModule, AuthorizationModule],
  controllers: [PushController],
  providers: [PushRepository, PushInstallationService, FirebasePushService, CustomerPushService],
  exports: [CustomerPushService],
})
export class PushModule {}

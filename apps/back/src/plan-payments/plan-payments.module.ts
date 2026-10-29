import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { BillingModule } from "../billing/billing.module.js";
import { AuthorizationModule } from "../common/authz/authorization.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { PaymentsModule } from "../payments/payments.module.js";
import { PlansModule } from "../plans/plans.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { AdminPlanPaymentsController, BillingProofController, PlatformBillingController, PublicTransferQrController } from "./plan-payments.controller.js";
import { PlanPaymentsService } from "./plan-payments.service.js";
import { PlatformBillingService } from "./platform-billing.service.js";

/** Fase 5 · cobro de planes (Stripe, QR, transferencia), revisión de transferencias y comprobantes. */
@Module({
  imports: [DatabaseModule, AuthModule, AuthorizationModule, BillingModule, PaymentsModule, PlansModule, StorageModule],
  controllers: [AdminPlanPaymentsController, BillingProofController, PublicTransferQrController, PlatformBillingController],
  providers: [PlanPaymentsService, PlatformBillingService],
})
export class PlanPaymentsModule {}

import {
  Module,
} from "@nestjs/common";

import {
  AuthModule,
} from "../auth/auth.module.js";

import {
  AuthorizationModule,
} from "../common/authz/authorization.module.js";

import {
  DatabaseModule,
} from "../database/database.module.js";

import {
  CustomerPaymentsController,
} from "./customer-payments.controller.js";

import {
  PaymentOperationsController,
} from "./payment-operations.controller.js";

import {
  MobileStripeReturnController,
} from "./mobile-stripe-return.controller.js";

import {
  PaymentsRepository,
} from "./payments.repository.js";

import {
  PaymentsService,
} from "./payments.service.js";

import {
  StripeGatewayService,
} from "./stripe-gateway.service.js";

import {
  StripeWebhookController,
} from "./stripe-webhook.controller.js";

import {
  StripeWebhookService,
} from "./stripe-webhook.service.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [
    CustomerPaymentsController,
    PaymentOperationsController,
    MobileStripeReturnController,
    StripeWebhookController,
  ],
  providers: [
    PaymentsRepository,
    PaymentsService,
    StripeGatewayService,
    StripeWebhookService,
  ],
})
export class PaymentsModule {}

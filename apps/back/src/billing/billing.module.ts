import { Module } from "@nestjs/common";
import { DemoPaymentGateway } from "./payment-gateway.js";

/** Pasarela de cobro de suscripciones de la plataforma (DEMO hasta la Fase 5). */
@Module({
  providers: [DemoPaymentGateway],
  exports: [DemoPaymentGateway],
})
export class BillingModule {}

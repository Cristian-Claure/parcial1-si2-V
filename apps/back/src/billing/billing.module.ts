import { Module } from "@nestjs/common";
import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { DatabaseModule } from "../database/database.module.js";
import { OrderQrService } from "./order-qr.service.js";
import { DemoPaymentGateway } from "./payment-gateway.js";
import { PaymentSettlementService } from "./payment-settlement.service.js";
import { PublicQrController } from "./public-qr.controller.js";
import { QrChargeService } from "./qr-charge.service.js";
import { BankQrGateway } from "./qr/bank-qr.gateway.js";
import { DemoQrGateway, QR_PAYMENT_GATEWAY, type QrPaymentGateway } from "./qr/qr-gateway.js";

/**
 * Pasarelas de cobro de la plataforma: tarjeta DEMO (onboarding), QR (DEMO firmado u OPENBCB/BCP
 * según VELORA_QR_PROVIDER) y la liquidación única de pagos (PAID → activa el plan).
 */
@Module({
  imports: [DatabaseModule],
  controllers: [PublicQrController],
  providers: [
    DemoPaymentGateway,
    DemoQrGateway,
    {
      provide: QR_PAYMENT_GATEWAY,
      inject: [RuntimeConfigService, DemoQrGateway],
      useFactory: (config: RuntimeConfigService, demo: DemoQrGateway): QrPaymentGateway => {
        const provider = config.value.VELORA_QR_PROVIDER;
        if (provider === "DEMO") return demo;
        return new BankQrGateway(provider, { baseUrl: config.value.VELORA_QR_BASE_URL, clientId: config.value.VELORA_QR_CLIENT_ID, clientSecret: config.value.VELORA_QR_CLIENT_SECRET });
      },
    },
    PaymentSettlementService,
    QrChargeService,
    OrderQrService,
  ],
  exports: [DemoPaymentGateway, PaymentSettlementService, QrChargeService, OrderQrService],
})
export class BillingModule {}

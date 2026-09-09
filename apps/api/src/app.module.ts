import { Module } from "@nestjs/common";
import { AdminModule } from "./admin/admin.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { CartModule } from "./cart/cart.module.js";
import { CatalogModule } from "./catalog/catalog.module.js";
import { CheckoutModule } from "./checkout/checkout.module.js";
import { CompaniesModule } from "./companies/companies.module.js";
import { AuthorizationModule } from "./common/authz/authorization.module.js";
import { RuntimeConfigModule } from "./common/config/runtime-config.module.js";
import { CustomerModule } from "./customer/customer.module.js";
import { HealthModule } from "./health/health.module.js";
import { InventoryModule } from "./inventory/inventory.module.js";
import { OrdersModule } from "./orders/orders.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { PosModule } from "./pos/pos.module.js";
import { StoresModule } from "./stores/stores.module.js";

@Module({
  imports: [RuntimeConfigModule, HealthModule, AuthModule, AuthorizationModule, CompaniesModule, AdminModule, CustomerModule, StoresModule, CatalogModule, InventoryModule, CartModule, CheckoutModule, OrdersModule, PaymentsModule, PosModule],
})
export class AppModule {}

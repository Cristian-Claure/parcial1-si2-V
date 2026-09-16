import { Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import type { OperationalOrderListItem, OperationalPaymentSummary } from "@velora/contracts";
import { appUsers, orders, payments, stores, warehouses } from "@velora/database";
import { DatabaseService } from "../database/database.service.js";

@Injectable()
export class CommerceOperationsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(input: { companyId: string | null; storeId: string | null }): Promise<OperationalOrderListItem[]> {
    const where = input.storeId
      ? eq(stores.id, input.storeId)
      : input.companyId ? eq(stores.companyId, input.companyId) : undefined;
    const query = this.database.db.select({
      id: orders.id, orderNumber: orders.orderNumber, customerId: orders.customerId,
      customerFirstName: appUsers.firstName, customerLastName: appUsers.lastName, customerEmail: appUsers.email,
      companyId: stores.companyId, storeId: stores.id, storeName: stores.name,
      warehouseId: warehouses.id, warehouseName: warehouses.name, orderChannel: orders.orderChannel,
      fulfillmentType: orders.fulfillmentType, status: orders.status, currency: orders.currency, total: orders.total,
      createdAt: orders.createdAt, fulfilledAt: orders.fulfilledAt, cancelledAt: orders.cancelledAt,
    }).from(orders).innerJoin(warehouses, eq(orders.warehouseId, warehouses.id))
      .innerJoin(stores, eq(warehouses.storeId, stores.id)).leftJoin(appUsers, eq(orders.customerId, appUsers.id));
    const headers = where ? await query.where(where).orderBy(desc(orders.createdAt)) : await query.orderBy(desc(orders.createdAt));
    const result: OperationalOrderListItem[] = [];
    for (const header of headers) {
      const paymentRows = await this.database.db.select({
        id: payments.id, method: payments.method, status: payments.status, amount: payments.amount,
        currency: payments.currency, provider: payments.provider, createdAt: payments.createdAt,
      }).from(payments).where(eq(payments.orderId, header.id)).orderBy(desc(payments.createdAt));
      const paymentSummaries: OperationalPaymentSummary[] = paymentRows.map((payment) => ({
        ...payment, amount: Number(payment.amount), createdAt: payment.createdAt.toISOString(),
      }));
      result.push({
        id: header.id, orderNumber: header.orderNumber, customerId: header.customerId,
        customerName: header.customerFirstName ? `${header.customerFirstName} ${header.customerLastName ?? ""}`.trim() : "Cliente invitado",
        customerEmail: header.customerEmail ?? null, companyId: header.companyId, storeId: header.storeId, storeName: header.storeName,
        warehouseId: header.warehouseId, warehouseName: header.warehouseName, orderChannel: header.orderChannel,
        fulfillmentType: header.fulfillmentType, status: header.status, currency: header.currency, total: Number(header.total),
        createdAt: header.createdAt.toISOString(), fulfilledAt: header.fulfilledAt?.toISOString() ?? null,
        cancelledAt: header.cancelledAt?.toISOString() ?? null, payments: paymentSummaries,
      });
    }
    return result;
  }
}

import {
  Injectable,
} from "@nestjs/common";

import {
  and,
  asc,
  eq,
  inArray,
} from "drizzle-orm";

import {
  companies,
  inventoryStocks,
  orderItems,
  orders,
  payments,
  stores,
  warehouses,
} from "@velora/database";

import {
  DatabaseService,
} from "../database/database.service.js";

@Injectable()
export class ReportsRepository {
  constructor(
    private readonly database:
      DatabaseService,
  ) {}

  async findCompany(
    companyId:
      string,
  ) {
    const rows =
      await this.database.db
        .select({
          id:
            companies.id,
          name:
            companies.name,
          active:
            companies.active,
        })
        .from(
          companies,
        )
        .where(
          eq(
            companies.id,
            companyId,
          ),
        )
        .limit(1);

    return rows[0] ?? null;
  }

  async findStore(
    storeId:
      string,
  ) {
    const rows =
      await this.database.db
        .select({
          id:
            stores.id,
          companyId:
            stores.companyId,
          name:
            stores.name,
          active:
            stores.active,
        })
        .from(
          stores,
        )
        .where(
          eq(
            stores.id,
            storeId,
          ),
        )
        .limit(1);

    return rows[0] ?? null;
  }

  async listActiveStores(
    companyId:
      string,
  ) {
    return this.database.db
      .select({
        id:
          stores.id,
        name:
          stores.name,
      })
      .from(
        stores,
      )
      .where(
        and(
          eq(
            stores.companyId,
            companyId,
          ),
          eq(
            stores.active,
            true,
          ),
        ),
      )
      .orderBy(
        asc(
          stores.name,
        ),
      );
  }

  async findOrders(
    companyId:
      string,
    storeId:
      string |
      null,
  ) {
    return this.database.db
      .select({
        id:
          orders.id,
        orderChannel:
          orders.orderChannel,
        createdAt:
          orders.createdAt,
        cancelledAt:
          orders.cancelledAt,
        fulfilledAt:
          orders.fulfilledAt,
        storeId:
          stores.id,
        storeName:
          stores.name,
      })
      .from(
        orders,
      )
      .innerJoin(
        warehouses,
        eq(
          orders.warehouseId,
          warehouses.id,
        ),
      )
      .innerJoin(
        stores,
        eq(
          warehouses.storeId,
          stores.id,
        ),
      )
      .where(
        storeId
          ? and(
              eq(
                stores.companyId,
                companyId,
              ),
              eq(
                stores.id,
                storeId,
              ),
            )
          : eq(
              stores.companyId,
              companyId,
            ),
      );
  }

  async findPayments(
    companyId:
      string,
    storeId:
      string |
      null,
  ) {
    return this.database.db
      .select({
        id:
          payments.id,
        orderId:
          payments.orderId,
        method:
          payments.method,
        status:
          payments.status,
        amount:
          payments.amount,
        paidAt:
          payments.paidAt,
        refundedAt:
          payments.refundedAt,
        storeId:
          stores.id,
        storeName:
          stores.name,
      })
      .from(
        payments,
      )
      .innerJoin(
        orders,
        eq(
          payments.orderId,
          orders.id,
        ),
      )
      .innerJoin(
        warehouses,
        eq(
          orders.warehouseId,
          warehouses.id,
        ),
      )
      .innerJoin(
        stores,
        eq(
          warehouses.storeId,
          stores.id,
        ),
      )
      .where(
        storeId
          ? and(
              eq(
                stores.companyId,
                companyId,
              ),
              eq(
                stores.id,
                storeId,
              ),
            )
          : eq(
              stores.companyId,
              companyId,
            ),
      );
  }

  async findStocks(
    companyId:
      string,
    storeId:
      string |
      null,
  ) {
    return this.database.db
      .select({
        id:
          inventoryStocks.id,
        availableQuantity:
          inventoryStocks.availableQuantity,
        storeId:
          stores.id,
        storeName:
          stores.name,
      })
      .from(
        inventoryStocks,
      )
      .innerJoin(
        warehouses,
        eq(
          inventoryStocks.warehouseId,
          warehouses.id,
        ),
      )
      .innerJoin(
        stores,
        eq(
          warehouses.storeId,
          stores.id,
        ),
      )
      .where(
        storeId
          ? and(
              eq(
                stores.companyId,
                companyId,
              ),
              eq(
                stores.id,
                storeId,
              ),
            )
          : eq(
              stores.companyId,
              companyId,
            ),
      );
  }

  async findOrderItems(
    orderIds:
      string[],
  ) {
    if (
      orderIds.length ===
      0
    ) {
      return [];
    }

    return this.database.db
      .select({
        orderId:
          orderItems.orderId,
        productName:
          orderItems.productName,
        quantity:
          orderItems.quantity,
        subtotal:
          orderItems.subtotal,
      })
      .from(
        orderItems,
      )
      .where(
        inArray(
          orderItems.orderId,
          orderIds,
        ),
      );
  }
}

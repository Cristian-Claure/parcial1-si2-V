import {
  randomUUID,
} from "node:crypto";

import {
  Injectable,
} from "@nestjs/common";

import {
  asc,
  eq,
  sql,
} from "drizzle-orm";

import type {
  OperationalOrderResponse,
} from "@velora/contracts";

import {
  inventoryMovements,
  inventoryStocks,
  orderItems,
  orders,
  payments,
  stores,
  warehouses,
  type VeloraDatabaseClient,
} from "@velora/database";

import type {
  ActorAccessContext,
} from "../common/authz/access-context.service.js";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import {
  DatabaseService,
} from "../database/database.service.js";

type VeloraTransaction =
  Parameters<
    Parameters<
      VeloraDatabaseClient["db"]["transaction"]
    >[0]
  >[0];

@Injectable()
export class OrderOperationsRepository {
  constructor(
    private readonly database:
      DatabaseService,
  ) {}

  async fulfill(
    actor:
      ActorAccessContext,
    orderId:
      string,
  ): Promise<void> {
    await this.database.db
      .transaction(
        async (tx) => {
          const initial =
            await this.orderHeader(
              tx,
              orderId,
            );

          if (!initial) {
            throw new ApiHttpError(
              404,
              "Pedido no encontrado.",
            );
          }

          this.requireStoreAccess(
            actor,
            initial.storeId,
          );

          await tx.execute(
            sql`
              select id
              from orders
              where id =
                ${orderId}::uuid
              for update
            `,
          );

          const order =
            await this.orderHeader(
              tx,
              orderId,
            );

          if (!order) {
            throw new ApiHttpError(
              404,
              "Pedido no encontrado.",
            );
          }

          this.requireStoreAccess(
            actor,
            order.storeId,
          );

          if (
            order.status !==
            "RESERVED"
          ) {
            throw new ApiHttpError(
              409,
              "Solo pueden entregarse pedidos reservados.",
            );
          }

          const paid =
            await tx
              .select({
                id:
                  payments.id,
              })
              .from(
                payments,
              )
              .where(
                sql`
                  ${payments.orderId}
                    = ${orderId}::uuid
                  and
                  ${payments.status}
                    = 'PAID'
                `,
              )
              .limit(1);

          if (!paid[0]) {
            throw new ApiHttpError(
              409,
              "El pedido debe tener un pago confirmado antes de ser entregado.",
            );
          }

          const lines =
            await tx
              .select({
                variantId:
                  orderItems.variantId,

                quantity:
                  orderItems.quantity,
              })
              .from(
                orderItems,
              )
              .where(
                eq(
                  orderItems.orderId,
                  orderId,
                ),
              )
              .orderBy(
                asc(
                  orderItems.variantId,
                ),
              );

          const stocks =
            new Map<
              string,
              {
                id:
                  string;

                physicalQuantity:
                  number;

                committedQuantity:
                  number;
              }
            >();

          for (
            const line of
            lines
          ) {
            await tx.execute(
              sql`
                select id
                from inventory_stocks
                where warehouse_id =
                  ${order.warehouseId}::uuid
                  and variant_id =
                    ${line.variantId}::uuid
                for update
              `,
            );

            const rows =
              await tx
                .select({
                  id:
                    inventoryStocks.id,

                  physicalQuantity:
                    inventoryStocks.physicalQuantity,

                  committedQuantity:
                    inventoryStocks.committedQuantity,
                })
                .from(
                  inventoryStocks,
                )
                .where(
                  sql`
                    ${inventoryStocks.warehouseId}
                      = ${order.warehouseId}::uuid
                    and
                    ${inventoryStocks.variantId}
                      = ${line.variantId}::uuid
                  `,
                )
                .limit(1);

            const stock =
              rows[0];

            if (!stock) {
              throw new ApiHttpError(
                409,
                "No existe el stock asociado al pedido.",
              );
            }

            if (
              stock.committedQuantity <
              line.quantity
            ) {
              throw new ApiHttpError(
                409,
                "El stock comprometido del pedido es inconsistente.",
              );
            }

            if (
              stock.physicalQuantity <
              line.quantity
            ) {
              throw new ApiHttpError(
                409,
                "El stock físico del pedido es inconsistente.",
              );
            }

            stocks.set(
              line.variantId,
              stock,
            );
          }

          const now =
            new Date();

          for (
            const line of
            lines
          ) {
            const stock =
              stocks.get(
                line.variantId,
              );

            if (!stock) {
              throw new Error(
                "No se encontró el stock bloqueado para completar la venta.",
              );
            }

            const physicalAfter =
              stock.physicalQuantity -
              line.quantity;

            const committedAfter =
              stock.committedQuantity -
              line.quantity;

            if (
              physicalAfter <
                0 ||
              committedAfter <
                0 ||
              committedAfter >
                physicalAfter
            ) {
              throw new ApiHttpError(
                409,
                "El inventario no permite completar la venta.",
              );
            }

            await tx
              .update(
                inventoryStocks,
              )
              .set({
                physicalQuantity:
                  physicalAfter,

                committedQuantity:
                  committedAfter,

                version:
                  sql<number>`
                    ${inventoryStocks.version}
                    +
                    1
                  `,

                updatedAt:
                  now,
              })
              .where(
                eq(
                  inventoryStocks.id,
                  stock.id,
                ),
              );

            await tx
              .insert(
                inventoryMovements,
              )
              .values({
                id:
                  randomUUID(),

                warehouseId:
                  order.warehouseId,

                variantId:
                  line.variantId,

                movementType:
                  "SALE",

                quantity:
                  line.quantity,

                physicalDelta:
                  -line.quantity,

                committedDelta:
                  -line.quantity,

                physicalBefore:
                  stock.physicalQuantity,

                physicalAfter,

                committedBefore:
                  stock.committedQuantity,

                committedAfter,

                referenceType:
                  "ORDER",

                referenceId:
                  order.id,

                reason:
                  "Venta por cumplimiento del pedido " +
                  order.orderNumber,

                performedBy:
                  actor.userId,

                createdAt:
                  now,
              });
          }

          await tx
            .update(
              orders,
            )
            .set({
              status:
                "FULFILLED",

              fulfilledAt:
                now,

              updatedAt:
                now,
            })
            .where(
              eq(
                orders.id,
                order.id,
              ),
            );
        },
      );
  }

  async get(
    orderId:
      string,
  ): Promise<
    OperationalOrderResponse |
    null
  > {
    const headers =
      await this.database.db
        .select({
          id:
            orders.id,

          orderNumber:
            orders.orderNumber,

          warehouseId:
            orders.warehouseId,

          storeId:
            stores.id,

          storeName:
            stores.name,

          fulfillmentType:
            orders.fulfillmentType,

          status:
            orders.status,

          currency:
            orders.currency,

          subtotal:
            orders.subtotal,

          total:
            orders.total,

          recipientName:
            orders.recipientName,

          recipientPhone:
            orders.recipientPhone,

          department:
            orders.department,

          city:
            orders.city,

          zone:
            orders.zone,

          addressLine:
            orders.addressLine,

          addressReference:
            orders.addressReference,

          notes:
            orders.notes,

          createdAt:
            orders.createdAt,

          cancelledAt:
            orders.cancelledAt,

          fulfilledAt:
            orders.fulfilledAt,
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
          eq(
            orders.id,
            orderId,
          ),
        )
        .limit(1);

    const header =
      headers[0];

    if (!header) {
      return null;
    }

    const items =
      await this.database.db
        .select({
          id:
            orderItems.id,

          variantId:
            orderItems.variantId,

          productName:
            orderItems.productName,

          sku:
            orderItems.sku,

          size:
            orderItems.size,

          color:
            orderItems.color,

          unitPrice:
            orderItems.unitPrice,

          currency:
            orderItems.currency,

          quantity:
            orderItems.quantity,

          subtotal:
            orderItems.subtotal,
        })
        .from(
          orderItems,
        )
        .where(
          eq(
            orderItems.orderId,
            orderId,
          ),
        )
        .orderBy(
          asc(
            orderItems.productName,
          ),
          asc(
            orderItems.sku,
          ),
        );

    return {
      id:
        header.id,

      orderNumber:
        header.orderNumber,

      warehouseId:
        header.warehouseId,

      storeId:
        header.storeId,

      storeName:
        header.storeName,

      fulfillmentType:
        header.fulfillmentType,

      status:
        header.status,

      currency:
        header.currency,

      subtotal:
        Number(
          header.subtotal,
        ),

      total:
        Number(
          header.total,
        ),

      recipientName:
        header.recipientName,

      recipientPhone:
        header.recipientPhone,

      department:
        header.department,

      city:
        header.city,

      zone:
        header.zone,

      addressLine:
        header.addressLine,

      addressReference:
        header.addressReference,

      notes:
        header.notes,

      createdAt:
        header.createdAt
          .toISOString(),

      cancelledAt:
        header.cancelledAt
          ?.toISOString() ??
        null,

      fulfilledAt:
        header.fulfilledAt
          ?.toISOString() ??
        null,

      items:
        items.map(
          (item) => ({
            id:
              item.id,

            variantId:
              item.variantId,

            productName:
              item.productName,

            sku:
              item.sku,

            size:
              item.size,

            color:
              item.color,

            unitPrice:
              Number(
                item.unitPrice,
              ),

            currency:
              item.currency,

            quantity:
              item.quantity,

            subtotal:
              Number(
                item.subtotal,
              ),
          }),
        ),
    };
  }

  private async orderHeader(
    tx:
      VeloraTransaction,
    orderId:
      string,
  ) {
    const rows =
      await tx
        .select({
          id:
            orders.id,

          orderNumber:
            orders.orderNumber,

          warehouseId:
            orders.warehouseId,

          storeId:
            stores.id,

          status:
            orders.status,
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
          eq(
            orders.id,
            orderId,
          ),
        )
        .limit(1);

    return rows[0] ??
      null;
  }

  private requireStoreAccess(
    actor:
      ActorAccessContext,
    orderStoreId:
      string,
  ): void {
    if (
      actor.role ===
      "ADMIN"
    ) {
      return;
    }

    if (
      actor.role !==
      "STORE_MANAGER"
    ) {
      throw new ApiHttpError(
        403,
        "No tiene permisos para completar pedidos.",
      );
    }

    if (
      !actor.storeId
    ) {
      throw new ApiHttpError(
        403,
        "El encargado no tiene una sucursal asignada.",
      );
    }

    if (
      actor.storeId !==
      orderStoreId
    ) {
      throw new ApiHttpError(
        403,
        "No puede completar pedidos de otra sucursal.",
      );
    }
  }
}

import {
  randomUUID,
} from "node:crypto";

import {
  Injectable,
} from "@nestjs/common";

import {
  and,
  asc,
  desc,
  eq,
  sql,
} from "drizzle-orm";

import type {
  CreateOrderRequest,
  OfflineOrderItemRequest,
  OrderResponse,
  SyncOfflineOrderRequest,
} from "@velora/contracts";

import {
  customerAddresses,
  inventoryMovements,
  inventoryStocks,
  orderItems,
  orders,
  payments,
  productVariants,
  products,
  shoppingCartItems,
  shoppingCarts,
  stores,
  warehouses,
  type VeloraDatabaseClient,
} from "@velora/database";

import {
  DatabaseService,
} from "../database/database.service.js";

export type OrderFailure =
  | {
      kind:
        "NO_ACTIVE_CART";
    }
  | {
      kind:
        "EMPTY_CART";
    }
  | {
      kind:
        "WAREHOUSE_NOT_FOUND";
    }
  | {
      kind:
        "WAREHOUSE_INACTIVE";
    }
  | {
      kind:
        "PICKUP_WAREHOUSE_INVALID";
    }
  | {
      kind:
        "DELIVERY_ADDRESS_REQUIRED";
    }
  | {
      kind:
        "PICKUP_ADDRESS_FORBIDDEN";
    }
  | {
      kind:
        "ADDRESS_NOT_FOUND";
    }
  | {
      kind:
        "VARIANT_MISSING";
    }
  | {
      kind:
        "VARIANT_UNAVAILABLE";
    }
  | {
      kind:
        "CURRENCY_MISMATCH";
    }
  | {
      kind:
        "COMPANY_MISMATCH";
    }
  | {
      kind:
        "STOCK_MISSING";

      sku:
        string;
    }
  | {
      kind:
        "STOCK_INSUFFICIENT";

      sku:
        string;

      available:
        number;

      requested:
        number;
    }
  | {
      kind:
        "OPERATION_ALREADY_USED";
    }
  | {
      kind:
        "OPERATION_CONFLICT";
    }
  | {
      kind:
        "ORDER_NOT_FOUND";
    }
  | {
      kind:
        "ORDER_NOT_RESERVED";
    }
  | {
      kind:
        "PAYMENT_PAID";
    }
  | {
      kind:
        "PAYMENT_PENDING";
    }
  | {
      kind:
        "RESERVATION_STOCK_MISSING";
    }
  | {
      kind:
        "RESERVATION_INCONSISTENT";
    };

export type OrderMutationResult =
  | {
      kind:
        "OK";

      orderId:
        string;

      idempotent?:
        boolean;
    }
  | OrderFailure;

interface WarehouseCheckoutRecord {
  id:
    string;

  storeId:
    string;

  storeName:
    string;

  storeAddress:
    string |
    null;

  companyId:
    string;

  active:
    boolean;

  defaultWarehouse:
    boolean;

  storeActive:
    boolean;
}

interface AddressSnapshotRecord {
  id:
    string;

  recipientName:
    string;

  recipientPhone:
    string;

  department:
    string;

  city:
    string;

  zone:
    string |
    null;

  addressLine:
    string;

  addressReference:
    string |
    null;
}

interface SaleLine {
  variantId:
    string;

  quantity:
    number;

  productName:
    string;

  productStatus:
    "DRAFT" |
    "ACTIVE" |
    "INACTIVE";

  productCompanyId:
    string;

  sku:
    string;

  size:
    string;

  color:
    string;

  price:
    string;

  currency:
    string;

  variantActive:
    boolean;
}

type VeloraTransaction =
  Parameters<
    Parameters<
      VeloraDatabaseClient["db"]["transaction"]
    >[0]
  >[0];

@Injectable()
export class OrdersRepository {
  constructor(
    private readonly database:
      DatabaseService,
  ) {}

  async createOnline(
    customerId: string,
    request:
      CreateOrderRequest,
  ): Promise<
    OrderMutationResult
  > {
    return this.database.db
      .transaction(
        async (tx) => {
          await tx.execute(
            sql`
              select id
              from app_users
              where id =
                ${customerId}::uuid
              for update
            `,
          );

          const cartRows =
            await tx
              .select({
                id:
                  shoppingCarts.id,
              })
              .from(
                shoppingCarts,
              )
              .where(
                and(
                  eq(
                    shoppingCarts.userId,
                    customerId,
                  ),
                  eq(
                    shoppingCarts.status,
                    "ACTIVE",
                  ),
                ),
              )
              .limit(1);

          const cartId =
            cartRows[0]?.id;

          if (!cartId) {
            return {
              kind:
                "NO_ACTIVE_CART" as const,
            };
          }

          await tx.execute(
            sql`
              select id
              from shopping_carts
              where id =
                ${cartId}::uuid
              for update
            `,
          );

          const lines =
            await tx
              .select({
                variantId:
                  productVariants.id,

                quantity:
                  shoppingCartItems.quantity,

                productName:
                  products.name,

                productStatus:
                  products.status,

                productCompanyId:
                  products.companyId,

                sku:
                  productVariants.sku,

                size:
                  productVariants.size,

                color:
                  productVariants.color,

                price:
                  productVariants.price,

                currency:
                  productVariants.currency,

                variantActive:
                  productVariants.active,
              })
              .from(
                shoppingCartItems,
              )
              .innerJoin(
                productVariants,
                eq(
                  shoppingCartItems.variantId,
                  productVariants.id,
                ),
              )
              .innerJoin(
                products,
                eq(
                  productVariants.productId,
                  products.id,
                ),
              )
              .where(
                eq(
                  shoppingCartItems.cartId,
                  cartId,
                ),
              );

          if (
            lines.length ===
            0
          ) {
            return {
              kind:
                "EMPTY_CART" as const,
            };
          }

          const warehouseResult =
            await this.warehouseForCheckout(
              tx,
              request.warehouseId,
            );

          if (
            warehouseResult.kind !==
            "OK"
          ) {
            return warehouseResult;
          }

          const warehouse =
            warehouseResult.warehouse;

          if (
            request.fulfillmentType ===
              "PICKUP" &&
            (
              !warehouse.defaultWarehouse ||
              !warehouse.storeActive
            )
          ) {
            return {
              kind:
                "PICKUP_WAREHOUSE_INVALID" as const,
            };
          }

          const addressResult =
            await this.addressForCheckout(
              tx,
              customerId,
              request.fulfillmentType,
              request.addressId ??
                null,
            );

          if (
            addressResult.kind !==
            "OK"
          ) {
            return addressResult;
          }

          const sortedLines =
            [...lines]
              .sort(
                (
                  left,
                  right,
                ) =>
                  left.variantId.localeCompare(
                    right.variantId,
                  ),
              );

          const stockByVariant =
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

          let currency:
            string |
            null =
            null;

          let subtotal =
            0;

          for (
            const line of
            sortedLines
          ) {
            const validation =
              await this.lockAndValidateLine(
                tx,
                warehouse,
                line,
                line.quantity,
                false,
              );

            if (
              validation.kind !==
              "OK"
            ) {
              return validation;
            }

            if (
              currency ===
              null
            ) {
              currency =
                line.currency;
            }
            else if (
              currency !==
              line.currency
            ) {
              return {
                kind:
                  "CURRENCY_MISMATCH" as const,
              };
            }

            stockByVariant.set(
              line.variantId,
              validation.stock,
            );

            subtotal +=
              Number(
                line.price,
              ) *
              line.quantity;
          }

          if (!currency) {
            return {
              kind:
                "EMPTY_CART" as const,
            };
          }

          const orderId =
            randomUUID();

          const orderNumber =
            this.generateOrderNumber();

          const now =
            new Date();

          const address =
            addressResult.address;

          await tx
            .insert(
              orders,
            )
            .values({
              id:
                orderId,

              orderNumber,

              orderChannel:
                "ECOMMERCE",

              customerId,

              sourceCartId:
                cartId,

              warehouseId:
                warehouse.id,

              addressId:
                address?.id ??
                null,

              pointOfSaleId:
                null,

              cashSessionId:
                null,

              fulfillmentType:
                request.fulfillmentType,

              status:
                "RESERVED",

              currency,

              subtotal:
                subtotal.toFixed(2),

              total:
                subtotal.toFixed(2),

              recipientName:
                address?.recipientName ??
                null,

              recipientPhone:
                address?.recipientPhone ??
                null,

              department:
                address?.department ??
                null,

              city:
                address?.city ??
                null,

              zone:
                address?.zone ??
                null,

              addressLine:
                address?.addressLine ??
                null,

              addressReference:
                address?.addressReference ??
                null,

              notes:
                this.trimToNull(
                  request.notes,
                ),

              clientOperationId:
                null,

              clientCreatedAt:
                null,

              syncedAt:
                null,

              cancelledAt:
                null,

              fulfilledAt:
                null,

              createdAt:
                now,

              updatedAt:
                now,
            });

          for (
            const line of
            sortedLines
          ) {
            const lineSubtotal =
              Number(
                line.price,
              ) *
              line.quantity;

            await tx
              .insert(
                orderItems,
              )
              .values({
                id:
                  randomUUID(),

                orderId,

                variantId:
                  line.variantId,

                productName:
                  line.productName,

                sku:
                  line.sku,

                size:
                  line.size,

                color:
                  line.color,

                unitPrice:
                  line.price,

                currency:
                  line.currency,

                quantity:
                  line.quantity,

                subtotal:
                  lineSubtotal
                    .toFixed(2),

                createdAt:
                  now,
              });

            const stock =
              stockByVariant.get(
                line.variantId,
              );

            if (!stock) {
              throw new Error(
                "No se encontró el stock bloqueado del pedido.",
              );
            }

            await this.reserveStock(
              tx,
              stock,
              warehouse.id,
              line.variantId,
              line.quantity,
              orderId,
              orderNumber,
              customerId,
              now,
            );
          }

          await tx
            .update(
              shoppingCarts,
            )
            .set({
              status:
                "CONVERTED",

              updatedAt:
                now,
            })
            .where(
              eq(
                shoppingCarts.id,
                cartId,
              ),
            );

          return {
            kind:
              "OK" as const,

            orderId,
          };
        },
      );
  }

  async syncOffline(
    customerId: string,
    request:
      SyncOfflineOrderRequest,
    normalizedItems:
      OfflineOrderItemRequest[],
  ): Promise<
    OrderMutationResult
  > {
    return this.database.db
      .transaction(
        async (tx) => {
          await tx.execute(
            sql`
              select
                pg_advisory_xact_lock(
                  hashtextextended(
                    ${request.clientOperationId}::text,
                    0
                  )
                )
            `,
          );

          await tx.execute(
            sql`
              select id
              from app_users
              where id =
                ${customerId}::uuid
              for update
            `,
          );

          const existingRows =
            await tx
              .select({
                id:
                  orders.id,

                customerId:
                  orders.customerId,

                orderChannel:
                  orders.orderChannel,

                warehouseId:
                  orders.warehouseId,

                fulfillmentType:
                  orders.fulfillmentType,

                addressId:
                  orders.addressId,

                clientCreatedAt:
                  orders.clientCreatedAt,

                notes:
                  orders.notes,
              })
              .from(
                orders,
              )
              .where(
                eq(
                  orders.clientOperationId,
                  request.clientOperationId,
                ),
              )
              .limit(1);

          const existing =
            existingRows[0];

          if (existing) {
            if (
              existing.orderChannel !==
                "ECOMMERCE" ||
              existing.customerId !==
                customerId
            ) {
              return {
                kind:
                  "OPERATION_ALREADY_USED" as const,
              };
            }

            const requestAddressId =
              request.addressId ??
              null;

            const sameHeader =
              existing.warehouseId ===
                request.warehouseId &&
              existing.fulfillmentType ===
                request.fulfillmentType &&
              existing.addressId ===
                requestAddressId &&
              (
                existing.clientCreatedAt
                  ?.getTime() ??
                null
              ) ===
                new Date(
                  request.clientCreatedAt,
                ).getTime() &&
              this.trimToNull(
                existing.notes,
              ) ===
                this.trimToNull(
                  request.notes,
                );

            if (!sameHeader) {
              return {
                kind:
                  "OPERATION_CONFLICT" as const,
              };
            }

            const storedItems =
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
                    existing.id,
                  ),
                )
                .orderBy(
                  asc(
                    orderItems.variantId,
                  ),
                );

            const requested =
              [...normalizedItems]
                .sort(
                  (
                    left,
                    right,
                  ) =>
                    left.variantId.localeCompare(
                      right.variantId,
                    ),
                );

            if (
              storedItems.length !==
              requested.length
            ) {
              return {
                kind:
                  "OPERATION_CONFLICT" as const,
              };
            }

            for (
              let index = 0;
              index <
              storedItems.length;
              index += 1
            ) {
              const stored =
                storedItems[index];

              const wanted =
                requested[index];

              if (
                !stored ||
                !wanted ||
                stored.variantId !==
                  wanted.variantId ||
                stored.quantity !==
                  wanted.quantity
              ) {
                return {
                  kind:
                    "OPERATION_CONFLICT" as const,
                };
              }
            }

            return {
              kind:
                "OK" as const,

              orderId:
                existing.id,

              idempotent:
                true,
            };
          }

          let sourceCartId:
            string |
            null =
            null;

          if (
            request.sourceCartId
          ) {
            const sourceRows =
              await tx
                .select({
                  id:
                    shoppingCarts.id,
                })
                .from(
                  shoppingCarts,
                )
                .where(
                  and(
                    eq(
                      shoppingCarts.id,
                      request.sourceCartId,
                    ),
                    eq(
                      shoppingCarts.userId,
                      customerId,
                    ),
                    eq(
                      shoppingCarts.status,
                      "ACTIVE",
                    ),
                  ),
                )
                .limit(1);

            sourceCartId =
              sourceRows[0]?.id ??
              null;

            if (sourceCartId) {
              await tx.execute(
                sql`
                  select id
                  from shopping_carts
                  where id =
                    ${sourceCartId}::uuid
                  for update
                `,
              );
            }
          }

          const warehouseResult =
            await this.warehouseForCheckout(
              tx,
              request.warehouseId,
            );

          if (
            warehouseResult.kind !==
            "OK"
          ) {
            return warehouseResult;
          }

          const warehouse =
            warehouseResult.warehouse;

          if (
            request.fulfillmentType ===
              "PICKUP" &&
            (
              !warehouse.defaultWarehouse ||
              !warehouse.storeActive
            )
          ) {
            return {
              kind:
                "PICKUP_WAREHOUSE_INVALID" as const,
            };
          }

          const addressResult =
            await this.addressForCheckout(
              tx,
              customerId,
              request.fulfillmentType,
              request.addressId ??
                null,
            );

          if (
            addressResult.kind !==
            "OK"
          ) {
            return addressResult;
          }

          const sortedItems =
            [...normalizedItems]
              .sort(
                (
                  left,
                  right,
                ) =>
                  left.variantId.localeCompare(
                    right.variantId,
                  ),
              );

          const saleLines:
            SaleLine[] =
            [];

          const stockByVariant =
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

          let currency:
            string |
            null =
            null;

          let subtotal =
            0;

          for (
            const requestedItem of
            sortedItems
          ) {
            const variantRows =
              await tx
                .select({
                  variantId:
                    productVariants.id,

                  productName:
                    products.name,

                  productStatus:
                    products.status,

                  productCompanyId:
                    products.companyId,

                  sku:
                    productVariants.sku,

                  size:
                    productVariants.size,

                  color:
                    productVariants.color,

                  price:
                    productVariants.price,

                  currency:
                    productVariants.currency,

                  variantActive:
                    productVariants.active,
                })
                .from(
                  productVariants,
                )
                .innerJoin(
                  products,
                  eq(
                    productVariants.productId,
                    products.id,
                  ),
                )
                .where(
                  eq(
                    productVariants.id,
                    requestedItem.variantId,
                  ),
                )
                .limit(1);

            const variant =
              variantRows[0];

            if (!variant) {
              return {
                kind:
                  "VARIANT_MISSING" as const,
              };
            }

            const line:
              SaleLine = {
                ...variant,
                quantity:
                  requestedItem.quantity,
              };

            const validation =
              await this.lockAndValidateLine(
                tx,
                warehouse,
                line,
                requestedItem.quantity,
                true,
              );

            if (
              validation.kind !==
              "OK"
            ) {
              return validation;
            }

            if (
              currency ===
              null
            ) {
              currency =
                line.currency;
            }
            else if (
              currency !==
              line.currency
            ) {
              return {
                kind:
                  "CURRENCY_MISMATCH" as const,
              };
            }

            stockByVariant.set(
              line.variantId,
              validation.stock,
            );

            saleLines.push(
              line,
            );

            subtotal +=
              Number(
                line.price,
              ) *
              line.quantity;
          }

          if (
            !currency ||
            saleLines.length ===
              0
          ) {
            return {
              kind:
                "EMPTY_CART" as const,
            };
          }

          const orderId =
            randomUUID();

          const orderNumber =
            this.generateOrderNumber();

          const now =
            new Date();

          const address =
            addressResult.address;

          await tx
            .insert(
              orders,
            )
            .values({
              id:
                orderId,

              orderNumber,

              orderChannel:
                "ECOMMERCE",

              customerId,

              sourceCartId:
                null,

              warehouseId:
                warehouse.id,

              addressId:
                address?.id ??
                null,

              pointOfSaleId:
                null,

              cashSessionId:
                null,

              fulfillmentType:
                request.fulfillmentType,

              status:
                "RESERVED",

              currency,

              subtotal:
                subtotal.toFixed(2),

              total:
                subtotal.toFixed(2),

              recipientName:
                address?.recipientName ??
                null,

              recipientPhone:
                address?.recipientPhone ??
                null,

              department:
                address?.department ??
                null,

              city:
                address?.city ??
                null,

              zone:
                address?.zone ??
                null,

              addressLine:
                address?.addressLine ??
                null,

              addressReference:
                address?.addressReference ??
                null,

              notes:
                this.trimToNull(
                  request.notes,
                ),

              clientOperationId:
                request.clientOperationId,

              clientCreatedAt:
                new Date(
                  request.clientCreatedAt,
                ),

              syncedAt:
                now,

              cancelledAt:
                null,

              fulfilledAt:
                null,

              createdAt:
                now,

              updatedAt:
                now,
            });

          for (
            const line of
            saleLines
          ) {
            const lineSubtotal =
              Number(
                line.price,
              ) *
              line.quantity;

            await tx
              .insert(
                orderItems,
              )
              .values({
                id:
                  randomUUID(),

                orderId,

                variantId:
                  line.variantId,

                productName:
                  line.productName,

                sku:
                  line.sku,

                size:
                  line.size,

                color:
                  line.color,

                unitPrice:
                  line.price,

                currency:
                  line.currency,

                quantity:
                  line.quantity,

                subtotal:
                  lineSubtotal
                    .toFixed(2),

                createdAt:
                  now,
              });

            const stock =
              stockByVariant.get(
                line.variantId,
              );

            if (!stock) {
              throw new Error(
                "No se encontró el stock bloqueado del pedido offline.",
              );
            }

            await this.reserveStock(
              tx,
              stock,
              warehouse.id,
              line.variantId,
              line.quantity,
              orderId,
              orderNumber,
              customerId,
              now,
            );
          }

          if (sourceCartId) {
            for (
              const item of
              sortedItems
            ) {
              const cartItemRows =
                await tx
                  .select({
                    id:
                      shoppingCartItems.id,

                    quantity:
                      shoppingCartItems.quantity,
                  })
                  .from(
                    shoppingCartItems,
                  )
                  .where(
                    and(
                      eq(
                        shoppingCartItems.cartId,
                        sourceCartId,
                      ),
                      eq(
                        shoppingCartItems.variantId,
                        item.variantId,
                      ),
                    ),
                  )
                  .limit(1);

              const cartItem =
                cartItemRows[0];

              if (!cartItem) {
                continue;
              }

              const remaining =
                cartItem.quantity -
                item.quantity;

              if (
                remaining >
                0
              ) {
                await tx
                  .update(
                    shoppingCartItems,
                  )
                  .set({
                    quantity:
                      remaining,

                    updatedAt:
                      now,
                  })
                  .where(
                    eq(
                      shoppingCartItems.id,
                      cartItem.id,
                    ),
                  );
              }
              else {
                await tx
                  .delete(
                    shoppingCartItems,
                  )
                  .where(
                    eq(
                      shoppingCartItems.id,
                      cartItem.id,
                    ),
                  );
              }
            }

            await tx
              .update(
                shoppingCarts,
              )
              .set({
                updatedAt:
                  now,
              })
              .where(
                eq(
                  shoppingCarts.id,
                  sourceCartId,
                ),
              );
          }

          return {
            kind:
              "OK" as const,

            orderId,
          };
        },
      );
  }

  async listForCustomer(
    customerId: string,
  ): Promise<
    OrderResponse[]
  > {
    const rows =
      await this.database.db
        .select({
          id:
            orders.id,
        })
        .from(
          orders,
        )
        .where(
          eq(
            orders.customerId,
            customerId,
          ),
        )
        .orderBy(
          desc(
            orders.createdAt,
          ),
        );

    const result:
      OrderResponse[] =
      [];

    for (const row of rows) {
      const order =
        await this.responseForCustomer(
          customerId,
          row.id,
        );

      if (order) {
        result.push(
          order,
        );
      }
    }

    return result;
  }

  async getForCustomer(
    customerId: string,
    orderId: string,
  ): Promise<
    OrderResponse |
    null
  > {
    return this.responseForCustomer(
      customerId,
      orderId,
    );
  }

  async cancel(
    customerId: string,
    orderId: string,
  ): Promise<
    OrderMutationResult
  > {
    return this.database.db
      .transaction(
        async (tx) => {
          await tx.execute(
            sql`
              select id
              from orders
              where id =
                ${orderId}::uuid
                and customer_id =
                  ${customerId}::uuid
              for update
            `,
          );

          const orderRows =
            await tx
              .select({
                id:
                  orders.id,

                orderNumber:
                  orders.orderNumber,

                status:
                  orders.status,

                warehouseId:
                  orders.warehouseId,
              })
              .from(
                orders,
              )
              .where(
                and(
                  eq(
                    orders.id,
                    orderId,
                  ),
                  eq(
                    orders.customerId,
                    customerId,
                  ),
                ),
              )
              .limit(1);

          const order =
            orderRows[0];

          if (!order) {
            return {
              kind:
                "ORDER_NOT_FOUND" as const,
            };
          }

          if (
            order.status !==
            "RESERVED"
          ) {
            return {
              kind:
                "ORDER_NOT_RESERVED" as const,
            };
          }

          const paidRows =
            await tx
              .select({
                id:
                  payments.id,
              })
              .from(
                payments,
              )
              .where(
                and(
                  eq(
                    payments.orderId,
                    orderId,
                  ),
                  eq(
                    payments.status,
                    "PAID",
                  ),
                ),
              )
              .limit(1);

          if (
            paidRows[0]
          ) {
            return {
              kind:
                "PAYMENT_PAID" as const,
            };
          }

          const pendingRows =
            await tx
              .select({
                id:
                  payments.id,
              })
              .from(
                payments,
              )
              .where(
                and(
                  eq(
                    payments.orderId,
                    orderId,
                  ),
                  eq(
                    payments.status,
                    "PENDING",
                  ),
                ),
              )
              .limit(1);

          if (
            pendingRows[0]
          ) {
            return {
              kind:
                "PAYMENT_PENDING" as const,
            };
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
              );

          const sortedLines =
            [...lines]
              .sort(
                (
                  left,
                  right,
                ) =>
                  left.variantId.localeCompare(
                    right.variantId,
                  ),
              );

          const stockByVariant =
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
            sortedLines
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

            const stockRows =
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
                  and(
                    eq(
                      inventoryStocks.warehouseId,
                      order.warehouseId,
                    ),
                    eq(
                      inventoryStocks.variantId,
                      line.variantId,
                    ),
                  ),
                )
                .limit(1);

            const stock =
              stockRows[0];

            if (!stock) {
              return {
                kind:
                  "RESERVATION_STOCK_MISSING" as const,
              };
            }

            if (
              stock.committedQuantity <
              line.quantity
            ) {
              return {
                kind:
                  "RESERVATION_INCONSISTENT" as const,
              };
            }

            stockByVariant.set(
              line.variantId,
              stock,
            );
          }

          const now =
            new Date();

          for (
            const line of
            sortedLines
          ) {
            const stock =
              stockByVariant.get(
                line.variantId,
              );

            if (!stock) {
              throw new Error(
                "No se encontró el stock bloqueado para liberar.",
              );
            }

            const committedAfter =
              stock.committedQuantity -
              line.quantity;

            await tx
              .update(
                inventoryStocks,
              )
              .set({
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
                  "RELEASE",

                quantity:
                  line.quantity,

                physicalDelta:
                  0,

                committedDelta:
                  -line.quantity,

                physicalBefore:
                  stock.physicalQuantity,

                physicalAfter:
                  stock.physicalQuantity,

                committedBefore:
                  stock.committedQuantity,

                committedAfter,

                referenceType:
                  "ORDER",

                referenceId:
                  order.id,

                reason:
                  "Liberación por cancelación del pedido " +
                  order.orderNumber,

                performedBy:
                  customerId,

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
                "CANCELLED",

              cancelledAt:
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

          return {
            kind:
              "OK" as const,

            orderId:
              order.id,
          };
        },
      );
  }

  private async responseForCustomer(
    customerId: string,
    orderId: string,
  ): Promise<
    OrderResponse |
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
          and(
            eq(
              orders.id,
              orderId,
            ),
            eq(
              orders.customerId,
              customerId,
            ),
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

    const fulfillmentType =
      header.fulfillmentType;

    if (
      fulfillmentType ===
      "IN_STORE"
    ) {
      throw new Error(
        "Un pedido CUSTOMER no puede ser IN_STORE.",
      );
    }

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

      fulfillmentType,

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

  private async warehouseForCheckout(
    tx:
      VeloraTransaction,
    warehouseId: string,
  ): Promise<
    | {
        kind:
          "OK";

        warehouse:
          WarehouseCheckoutRecord;
      }
    | {
        kind:
          "WAREHOUSE_NOT_FOUND";
      }
    | {
        kind:
          "WAREHOUSE_INACTIVE";
      }
  > {
    const rows =
      await tx
        .select({
          id:
            warehouses.id,

          storeId:
            stores.id,

          storeName:
            stores.name,

          storeAddress:
            stores.address,

          companyId:
            stores.companyId,

          active:
            warehouses.active,

          defaultWarehouse:
            warehouses.defaultWarehouse,

          storeActive:
            stores.active,
        })
        .from(
          warehouses,
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
            warehouses.id,
            warehouseId,
          ),
        )
        .limit(1);

    const warehouse =
      rows[0];

    if (!warehouse) {
      return {
        kind:
          "WAREHOUSE_NOT_FOUND",
      };
    }

    if (!warehouse.active) {
      return {
        kind:
          "WAREHOUSE_INACTIVE",
      };
    }

    return {
      kind:
        "OK",

      warehouse,
    };
  }

  private async addressForCheckout(
    tx:
      VeloraTransaction,
    customerId: string,
    fulfillmentType:
      "DELIVERY" |
      "PICKUP",
    addressId:
      string |
      null,
  ): Promise<
    | {
        kind:
          "OK";

        address:
          AddressSnapshotRecord |
          null;
      }
    | {
        kind:
          "DELIVERY_ADDRESS_REQUIRED";
      }
    | {
        kind:
          "PICKUP_ADDRESS_FORBIDDEN";
      }
    | {
        kind:
          "ADDRESS_NOT_FOUND";
      }
  > {
    if (
      fulfillmentType ===
      "PICKUP"
    ) {
      if (addressId) {
        return {
          kind:
            "PICKUP_ADDRESS_FORBIDDEN",
        };
      }

      return {
        kind:
          "OK",

        address:
          null,
      };
    }

    if (!addressId) {
      return {
        kind:
          "DELIVERY_ADDRESS_REQUIRED",
      };
    }

    const rows =
      await tx
        .select({
          id:
            customerAddresses.id,

          recipientName:
            customerAddresses.recipientName,

          recipientPhone:
            customerAddresses.recipientPhone,

          department:
            customerAddresses.department,

          city:
            customerAddresses.city,

          zone:
            customerAddresses.zone,

          addressLine:
            customerAddresses.addressLine,

          addressReference:
            customerAddresses.reference,
        })
        .from(
          customerAddresses,
        )
        .where(
          and(
            eq(
              customerAddresses.id,
              addressId,
            ),
            eq(
              customerAddresses.userId,
              customerId,
            ),
            eq(
              customerAddresses.active,
              true,
            ),
          ),
        )
        .limit(1);

    const address =
      rows[0];

    if (!address) {
      return {
        kind:
          "ADDRESS_NOT_FOUND",
      };
    }

    return {
      kind:
        "OK",

      address,
    };
  }

  private async lockAndValidateLine(
    tx:
      VeloraTransaction,
    warehouse:
      WarehouseCheckoutRecord,
    line:
      SaleLine,
    requested:
      number,
    offline:
      boolean,
  ): Promise<
    | {
        kind:
          "OK";

        stock: {
          id:
            string;

          physicalQuantity:
            number;

          committedQuantity:
            number;
        };
      }
    | OrderFailure
  > {
    if (
      !line.variantActive ||
      line.productStatus !==
        "ACTIVE"
    ) {
      return {
        kind:
          "VARIANT_UNAVAILABLE",
      };
    }

    if (
      line.productCompanyId !==
      warehouse.companyId
    ) {
      return {
        kind:
          "COMPANY_MISMATCH",
      };
    }

    await tx.execute(
      sql`
        select id
        from inventory_stocks
        where warehouse_id =
          ${warehouse.id}::uuid
          and variant_id =
            ${line.variantId}::uuid
        for update
      `,
    );

    const stockRows =
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
          and(
            eq(
              inventoryStocks.warehouseId,
              warehouse.id,
            ),
            eq(
              inventoryStocks.variantId,
              line.variantId,
            ),
          ),
        )
        .limit(1);

    const stock =
      stockRows[0];

    if (!stock) {
      return {
        kind:
          "STOCK_MISSING",

        sku:
          line.sku,
      };
    }

    const available =
      stock.physicalQuantity -
      stock.committedQuantity;

    if (
      available <
      requested
    ) {
      return {
        kind:
          "STOCK_INSUFFICIENT",

        sku:
          line.sku,

        available,

        requested,
      };
    }

    if (
      offline &&
      requested <=
        0
    ) {
      return {
        kind:
          "VARIANT_UNAVAILABLE",
      };
    }

    return {
      kind:
        "OK",

      stock,
    };
  }

  private async reserveStock(
    tx:
      VeloraTransaction,
    stock: {
      id:
        string;

      physicalQuantity:
        number;

      committedQuantity:
        number;
    },
    warehouseId: string,
    variantId: string,
    quantity: number,
    orderId: string,
    orderNumber: string,
    customerId: string,
    now: Date,
  ): Promise<void> {
    const committedAfter =
      stock.committedQuantity +
      quantity;

    await tx
      .update(
        inventoryStocks,
      )
      .set({
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

        warehouseId,

        variantId,

        movementType:
          "RESERVE",

        quantity,

        physicalDelta:
          0,

        committedDelta:
          quantity,

        physicalBefore:
          stock.physicalQuantity,

        physicalAfter:
          stock.physicalQuantity,

        committedBefore:
          stock.committedQuantity,

        committedAfter,

        referenceType:
          "ORDER",

        referenceId:
          orderId,

        reason:
          "Reserva por pedido " +
          orderNumber,

        performedBy:
          customerId,

        createdAt:
          now,
      });
  }

  private generateOrderNumber():
    string {
    const now =
      new Date();

    const date =
      [
        now.getUTCFullYear(),
        String(
          now.getUTCMonth() +
          1,
        ).padStart(
          2,
          "0",
        ),
        String(
          now.getUTCDate(),
        ).padStart(
          2,
          "0",
        ),
      ].join(
        "",
      );

    const random =
      randomUUID()
        .replaceAll(
          "-",
          "",
        )
        .slice(
          0,
          12,
        )
        .toUpperCase();

    return (
      "VEL-" +
      date +
      "-" +
      random
    );
  }

  private trimToNull(
    value:
      string |
      null |
      undefined,
  ): string |
    null {
    if (
      value ===
        null ||
      value ===
        undefined ||
      value.trim().length ===
        0
    ) {
      return null;
    }

    return value.trim();
  }
}
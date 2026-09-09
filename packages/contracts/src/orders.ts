import {
  z,
} from "zod";

export const customerFulfillmentTypeSchema =
  z.enum([
    "DELIVERY",
    "PICKUP",
  ]);

export type CustomerFulfillmentType =
  z.infer<
    typeof customerFulfillmentTypeSchema
  >;

export const orderStatusSchema =
  z.enum([
    "RESERVED",
    "FULFILLED",
    "CANCELLED",
  ]);

export type OrderStatus =
  z.infer<
    typeof orderStatusSchema
  >;

export const checkoutWarehouseResponseSchema =
  z.object({
    warehouseId:
      z.string().uuid(),

    warehouseCode:
      z.string(),

    warehouseName:
      z.string(),

    storeId:
      z.string().uuid(),

    storeName:
      z.string(),

    storeAddress:
      z.string()
        .nullable(),
  });

export type CheckoutWarehouseResponse =
  z.infer<
    typeof checkoutWarehouseResponseSchema
  >;

export const createOrderRequestSchema =
  z.object({
    warehouseId:
      z.string().uuid(),

    fulfillmentType:
      customerFulfillmentTypeSchema,

    addressId:
      z.string()
        .uuid()
        .nullable()
        .optional(),

    notes:
      z.string()
        .max(
          500,
          "Las observaciones son demasiado largas.",
        )
        .nullable()
        .optional(),
  });

export type CreateOrderRequest =
  z.infer<
    typeof createOrderRequestSchema
  >;

export const offlineOrderItemRequestSchema =
  z.object({
    variantId:
      z.string().uuid(),

    quantity:
      z.number()
        .int()
        .min(
          1,
          "La cantidad debe ser mayor a cero.",
        )
        .max(
          999,
          "La cantidad solicitada es demasiado alta.",
        ),
  });

export type OfflineOrderItemRequest =
  z.infer<
    typeof offlineOrderItemRequestSchema
  >;

export const syncOfflineOrderRequestSchema =
  z.object({
    clientOperationId:
      z.string().uuid(),

    clientCreatedAt:
      z.string()
        .datetime({
          offset:
            true,
        }),

    sourceCartId:
      z.string()
        .uuid()
        .nullable()
        .optional(),

    warehouseId:
      z.string().uuid(),

    fulfillmentType:
      customerFulfillmentTypeSchema,

    addressId:
      z.string()
        .uuid()
        .nullable()
        .optional(),

    notes:
      z.string()
        .max(
          500,
          "Las observaciones son demasiado largas.",
        )
        .nullable()
        .optional(),

    items:
      z.array(
        offlineOrderItemRequestSchema,
      )
        .min(
          1,
          "El pedido debe contener entre 1 y 100 productos.",
        )
        .max(
          100,
          "El pedido debe contener entre 1 y 100 productos.",
        ),
  });

export type SyncOfflineOrderRequest =
  z.infer<
    typeof syncOfflineOrderRequestSchema
  >;

export const orderItemResponseSchema =
  z.object({
    id:
      z.string().uuid(),

    variantId:
      z.string().uuid(),

    productName:
      z.string(),

    sku:
      z.string(),

    size:
      z.string(),

    color:
      z.string(),

    unitPrice:
      z.number()
        .nonnegative(),

    currency:
      z.string(),

    quantity:
      z.number()
        .int()
        .positive(),

    subtotal:
      z.number()
        .nonnegative(),
  });

export type OrderItemResponse =
  z.infer<
    typeof orderItemResponseSchema
  >;

export const orderResponseSchema =
  z.object({
    id:
      z.string().uuid(),

    orderNumber:
      z.string(),

    warehouseId:
      z.string().uuid(),

    storeId:
      z.string().uuid(),

    storeName:
      z.string(),

    fulfillmentType:
      customerFulfillmentTypeSchema,

    status:
      orderStatusSchema,

    currency:
      z.string(),

    subtotal:
      z.number()
        .nonnegative(),

    total:
      z.number()
        .nonnegative(),

    recipientName:
      z.string()
        .nullable(),

    recipientPhone:
      z.string()
        .nullable(),

    department:
      z.string()
        .nullable(),

    city:
      z.string()
        .nullable(),

    zone:
      z.string()
        .nullable(),

    addressLine:
      z.string()
        .nullable(),

    addressReference:
      z.string()
        .nullable(),

    notes:
      z.string()
        .nullable(),

    createdAt:
      z.string().datetime(),

    cancelledAt:
      z.string()
        .datetime()
        .nullable(),

    fulfilledAt:
      z.string()
        .datetime()
        .nullable(),

    items:
      z.array(
        orderItemResponseSchema,
      ),
  });

export type OrderResponse =
  z.infer<
    typeof orderResponseSchema
  >;
export const fulfillmentTypeSchema =
  z.enum([
    "DELIVERY",
    "PICKUP",
    "IN_STORE",
  ]);

export type FulfillmentType =
  z.infer<
    typeof fulfillmentTypeSchema
  >;

export const operationalOrderResponseSchema =
  orderResponseSchema
    .extend({
      fulfillmentType:
        fulfillmentTypeSchema,
    });

export type OperationalOrderResponse =
  z.infer<
    typeof operationalOrderResponseSchema
  >;
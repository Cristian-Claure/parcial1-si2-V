import {
  z,
} from "zod";

export const inventoryMovementTypeSchema =
  z.enum([
    "ENTRY",
    "ADJUSTMENT_IN",
    "ADJUSTMENT_OUT",
    "RESERVE",
    "RELEASE",
    "SALE",
    "RETURN",
    "TRANSFER_IN",
    "TRANSFER_OUT",
  ]);

export type InventoryMovementType =
  z.infer<
    typeof inventoryMovementTypeSchema
  >;

export const warehouseRequestSchema =
  z.object({
    storeId:
      z.string().uuid(),

    code:
      z.string()
        .trim()
        .min(1)
        .max(50),

    name:
      z.string()
        .trim()
        .min(1)
        .max(120),

    description:
      z.string()
        .max(500)
        .nullable()
        .optional(),

    active:
      z.boolean()
        .nullable()
        .optional(),
  });

export type WarehouseRequest =
  z.infer<
    typeof warehouseRequestSchema
  >;

export const warehouseResponseSchema =
  z.object({
    id:
      z.string().uuid(),

    storeId:
      z.string().uuid(),

    storeName:
      z.string(),

    code:
      z.string(),

    name:
      z.string(),

    description:
      z.string()
        .nullable(),

    active:
      z.boolean(),

    defaultWarehouse:
      z.boolean(),
  });

export type WarehouseResponse =
  z.infer<
    typeof warehouseResponseSchema
  >;

export const inventoryStockSchema =
  z.object({
    id:
      z.string().uuid(),

    warehouseId:
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

    physicalQuantity:
      z.number()
        .int()
        .nonnegative(),

    committedQuantity:
      z.number()
        .int()
        .nonnegative(),

    availableQuantity:
      z.number()
        .int()
        .nonnegative(),

    version:
      z.number()
        .int()
        .nonnegative(),
  })
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.committedQuantity >
          value.physicalQuantity
        ) {
          context.addIssue({
            code:
              "custom",

            path: [
              "committedQuantity",
            ],

            message:
              "La cantidad comprometida no puede superar la cantidad física.",
          });
        }

        if (
          value.availableQuantity !==
          (
            value.physicalQuantity -
            value.committedQuantity
          )
        ) {
          context.addIssue({
            code:
              "custom",

            path: [
              "availableQuantity",
            ],

            message:
              "La cantidad disponible no coincide con el inventario físico menos el comprometido.",
          });
        }
      },
    );

export type InventoryStock =
  z.infer<
    typeof inventoryStockSchema
  >;

export const inventoryMovementRequestSchema =
  z.object({
    warehouseId:
      z.string().uuid(),

    variantId:
      z.string().uuid(),

    movementType:
      inventoryMovementTypeSchema,

    quantity:
      z.number()
        .int()
        .min(1),

    reason:
      z.string()
        .trim()
        .min(1)
        .max(500),

    referenceType:
      z.string()
        .max(40)
        .nullable()
        .optional(),

    referenceId:
      z.string()
        .uuid()
        .nullable()
        .optional(),
  });

export type InventoryMovementRequest =
  z.infer<
    typeof inventoryMovementRequestSchema
  >;

export const inventoryMovementResponseSchema =
  z.object({
    id:
      z.string().uuid(),

    warehouseId:
      z.string().uuid(),

    variantId:
      z.string().uuid(),

    sku:
      z.string(),

    movementType:
      inventoryMovementTypeSchema,

    quantity:
      z.number()
        .int()
        .positive(),

    physicalDelta:
      z.number().int(),

    committedDelta:
      z.number().int(),

    physicalBefore:
      z.number()
        .int()
        .nonnegative(),

    physicalAfter:
      z.number()
        .int()
        .nonnegative(),

    committedBefore:
      z.number()
        .int()
        .nonnegative(),

    committedAfter:
      z.number()
        .int()
        .nonnegative(),

    reason:
      z.string()
        .nullable(),

    performedBy:
      z.string()
        .nullable(),

    createdAt:
      z.string(),
  });

export type InventoryMovementResponse =
  z.infer<
    typeof inventoryMovementResponseSchema
  >;

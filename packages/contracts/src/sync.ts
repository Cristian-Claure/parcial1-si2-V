import { z } from "zod";
import { dbIdSchema } from "./shared.js";

/**
 * Fase 2 · Sincronización offline (push en lote + pull incremental).
 * Los ids de entidades nuevas los genera el cliente (UUID) para poder referenciarlas
 * offline (variantes, stock inicial, imagen) antes de sincronizar.
 */
const clientIdSchema = z.string().uuid("Identificador inválido.");
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const syncCustomerCreateSchema = z.object({
  id: clientIdSchema,
  firstName: z.string().trim().min(1, "El nombre es obligatorio.").max(80),
  lastName: z.string().trim().min(1, "El apellido es obligatorio.").max(100),
  phone: optionalText(40),
  email: z.string().trim().toLowerCase().email("Correo inválido.").max(180).nullable().optional(),
  taxId: optionalText(40),
  customerType: z.enum(["B2C", "B2B"]).optional(),
  businessName: optionalText(180),
});
export type SyncCustomerCreate = z.infer<typeof syncCustomerCreateSchema>;

export const syncCustomerUpdateSchema = syncCustomerCreateSchema.partial().extend({ id: clientIdSchema });
export type SyncCustomerUpdate = z.infer<typeof syncCustomerUpdateSchema>;

export const syncVariantCreateSchema = z.object({
  id: clientIdSchema,
  sku: z.string().trim().min(1).max(80).transform((value) => value.toUpperCase()),
  size: z.string().trim().min(1).max(30),
  color: z.string().trim().min(1).max(80),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  price: z.number().nonnegative(),
});

export const syncProductCreateSchema = z.object({
  id: clientIdSchema,
  categoryId: dbIdSchema,
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(180),
  slug: z.string().trim().toLowerCase().max(200).optional(),
  description: optionalText(2000),
  brand: optionalText(120),
  status: z.enum(["DRAFT", "ACTIVE"]).optional(),
  variants: z.array(syncVariantCreateSchema).min(1, "Agregue al menos una variante.").max(50),
  /** Stock inicial: el servidor lo aplica como movimiento ENTRY validado. */
  initialStock: z.array(z.object({ variantId: clientIdSchema, warehouseId: dbIdSchema, quantity: z.number().int().positive().max(100000) })).max(200).optional(),
});
export type SyncProductCreate = z.infer<typeof syncProductCreateSchema>;

export const syncProductUpdateSchema = z.object({
  id: dbIdSchema,
  name: z.string().trim().min(1).max(180).optional(),
  description: optionalText(2000),
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE"]).optional(),
  categoryId: dbIdSchema.optional(),
});
export type SyncProductUpdate = z.infer<typeof syncProductUpdateSchema>;

export const syncOperationTypeSchema = z.enum(["CUSTOMER_CREATE", "CUSTOMER_UPDATE", "PRODUCT_CREATE", "PRODUCT_UPDATE"]);
export type SyncOperationType = z.infer<typeof syncOperationTypeSchema>;

export const syncOperationSchema = z.discriminatedUnion("type", [
  z.object({ clientOperationId: clientIdSchema, type: z.literal("CUSTOMER_CREATE"), payload: syncCustomerCreateSchema }),
  z.object({ clientOperationId: clientIdSchema, type: z.literal("CUSTOMER_UPDATE"), payload: syncCustomerUpdateSchema, baseVersion: z.number().int().positive() }),
  z.object({ clientOperationId: clientIdSchema, type: z.literal("PRODUCT_CREATE"), payload: syncProductCreateSchema }),
  z.object({ clientOperationId: clientIdSchema, type: z.literal("PRODUCT_UPDATE"), payload: syncProductUpdateSchema, baseVersion: z.number().int().positive() }),
]);
export type SyncOperation = z.infer<typeof syncOperationSchema>;

export const syncPushRequestSchema = z.object({
  companyId: dbIdSchema,
  operations: z.array(syncOperationSchema).min(1).max(100),
});
export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;

export const syncResultStatusSchema = z.enum(["APPLIED", "DUPLICATE", "CONFLICT", "REJECTED"]);
export type SyncResultStatus = z.infer<typeof syncResultStatusSchema>;

/** Opciones que la UI ofrece ante un CONFLICT. */
export const syncConflictOptionSchema = z.enum(["USE_EXISTING", "ADJUST_AND_RETRY", "DISCARD", "KEEP_MINE", "KEEP_SERVER"]);
export type SyncConflictOption = z.infer<typeof syncConflictOptionSchema>;

export const syncOperationResultSchema = z.object({
  clientOperationId: z.string(),
  status: syncResultStatusSchema,
  /** p. ej. SKU_TAKEN, EMAIL_TAKEN, DOCUMENT_TAKEN, VERSION_MISMATCH, PLAN_LIMIT_PRODUCTS, NOT_FOUND. */
  code: z.string().nullable(),
  message: z.string().nullable(),
  entityId: z.string().nullable(),
  version: z.number().int().nullable(),
  options: z.array(syncConflictOptionSchema),
  /** Registro existente / versión del servidor para resolver el conflicto. */
  server: z.record(z.string(), z.unknown()).nullable(),
});
export type SyncOperationResult = z.infer<typeof syncOperationResultSchema>;

export const syncPushResponseSchema = z.object({ results: z.array(syncOperationResultSchema) });
export type SyncPushResponse = z.infer<typeof syncPushResponseSchema>;

export const syncCategorySchema = z.object({ id: z.string(), name: z.string(), slug: z.string(), parentId: z.string().nullable(), active: z.boolean() });
export const syncStoreSchema = z.object({ id: z.string(), code: z.string(), name: z.string(), active: z.boolean() });
export const syncWarehouseSchema = z.object({ id: z.string(), storeId: z.string(), code: z.string(), name: z.string(), active: z.boolean(), defaultWarehouse: z.boolean() });
export const syncProductSchema = z.object({
  id: z.string(), categoryId: z.string(), name: z.string(), slug: z.string(), description: z.string().nullable(), brand: z.string().nullable(),
  status: z.string(), version: z.number().int(), imageUrl: z.string().nullable(), updatedAt: z.string(),
  variants: z.array(z.object({ id: z.string(), sku: z.string(), size: z.string(), color: z.string(), price: z.number(), currency: z.string(), active: z.boolean() })),
  stock: z.array(z.object({ variantId: z.string(), warehouseId: z.string(), available: z.number() })),
});
export const syncCustomerSchema = z.object({
  id: z.string(), firstName: z.string(), lastName: z.string(), email: z.string().nullable(), phone: z.string().nullable(),
  taxId: z.string().nullable(), customerType: z.string().nullable(), businessName: z.string().nullable(), hasAccess: z.boolean(), version: z.number().int(),
});
export type SyncCategory = z.infer<typeof syncCategorySchema>;
export type SyncStore = z.infer<typeof syncStoreSchema>;
export type SyncWarehouse = z.infer<typeof syncWarehouseSchema>;
export type SyncProduct = z.infer<typeof syncProductSchema>;
export type SyncCustomer = z.infer<typeof syncCustomerSchema>;

export const syncEntityTypeSchema = z.enum(["CATEGORY", "PRODUCT", "STORE", "WAREHOUSE", "CUSTOMER"]);
export type SyncEntityType = z.infer<typeof syncEntityTypeSchema>;

export const syncPullResponseSchema = z.object({
  companyId: z.string(),
  /** Cursor opaco y monotónico; enviarlo como `since` en el siguiente pull. */
  cursor: z.string(),
  snapshot: z.boolean(),
  categories: z.array(syncCategorySchema),
  products: z.array(syncProductSchema),
  stores: z.array(syncStoreSchema),
  warehouses: z.array(syncWarehouseSchema),
  customers: z.array(syncCustomerSchema),
  tombstones: z.array(z.object({ entityType: syncEntityTypeSchema, id: z.string() })),
});
export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>;

export const SYNC_MAX_ATTEMPTS = 5;
export const syncOutboxStatusSchema = z.enum(["PENDING", "SYNCING", "CONFLICT", "FAILED"]);
export type SyncOutboxStatus = z.infer<typeof syncOutboxStatusSchema>;

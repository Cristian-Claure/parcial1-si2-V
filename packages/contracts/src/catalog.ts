import {
  z,
} from "zod";

export const productStatusSchema =
  z.enum([
    "DRAFT",
    "ACTIVE",
    "INACTIVE",
  ]);

export type ProductStatus =
  z.infer<
    typeof productStatusSchema
  >;

export const tryOnCategorySchema =
  z.enum([
    "TOP",
    "BOTTOM",
    "DRESS",
    "OUTERWEAR",
    "SHOES",
    "ACCESSORY",
  ]);

export type TryOnCategory =
  z.infer<
    typeof tryOnCategorySchema
  >;

export const productImagePurposeSchema =
  z.enum([
    "GALLERY",
    "TRY_ON_GARMENT",
  ]);

export type ProductImagePurpose =
  z.infer<
    typeof productImagePurposeSchema
  >;

export const categoryRequestSchema =
  z.object({
    companyId:
      z.string().uuid(),

    name:
      z.string()
        .trim()
        .min(1)
        .max(120),

    slug:
      z.string()
        .trim()
        .min(1)
        .max(140),

    description:
      z.string()
        .max(500)
        .nullable()
        .optional(),

    parentId:
      z.string()
        .uuid()
        .nullable()
        .optional(),

    active:
      z.boolean()
        .nullable()
        .optional(),
  });

export type CategoryRequest =
  z.infer<
    typeof categoryRequestSchema
  >;

export const categoryResponseSchema =
  z.object({
    companyId:
      z.string().uuid(),

    id:
      z.string().uuid(),

    parentId:
      z.string()
        .uuid()
        .nullable(),

    parentName:
      z.string()
        .nullable(),

    name:
      z.string(),

    slug:
      z.string(),

    description:
      z.string()
        .nullable(),

    active:
      z.boolean(),
  });

export type CategoryResponse =
  z.infer<
    typeof categoryResponseSchema
  >;

export const variantRequestSchema =
  z.object({
    sku:
      z.string()
        .trim()
        .min(1)
        .max(80),

    barcode:
      z.string()
        .max(100)
        .nullable()
        .optional(),

    size:
      z.string()
        .trim()
        .min(1)
        .max(30),

    color:
      z.string()
        .trim()
        .min(1)
        .max(80),

    colorHex:
      z.string()
        .max(7)
        .regex(
          /^#[0-9A-Fa-f]{6}$/,
        )
        .nullable()
        .optional(),

    price:
      z.number()
        .nonnegative(),

    compareAtPrice:
      z.number()
        .nonnegative()
        .nullable()
        .optional(),

    currency:
      z.string()
        .length(3)
        .nullable()
        .optional(),

    active:
      z.boolean()
        .nullable()
        .optional(),
  })
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.compareAtPrice !==
            undefined &&
          value.compareAtPrice !==
            null &&
          value.compareAtPrice <
            value.price
        ) {
          context.addIssue({
            code:
              "custom",

            path: [
              "compareAtPrice",
            ],

            message:
              "El precio comparativo no puede ser menor al precio.",
          });
        }
      },
    );

export type VariantRequest =
  z.infer<
    typeof variantRequestSchema
  >;

export const variantResponseSchema =
  z.object({
    id:
      z.string().uuid(),

    sku:
      z.string(),

    barcode:
      z.string()
        .nullable(),

    size:
      z.string(),

    color:
      z.string(),

    colorHex:
      z.string()
        .nullable(),

    price:
      z.number(),

    compareAtPrice:
      z.number()
        .nullable(),

    currency:
      z.string(),

    active:
      z.boolean(),
  });

export type VariantResponse =
  z.infer<
    typeof variantResponseSchema
  >;

export const imageRequestSchema =
  z.object({
    variantId:
      z.string()
        .uuid()
        .nullable()
        .optional(),

    imageUrl:
      z.string()
        .trim()
        .min(1)
        .max(1000),

    altText:
      z.string()
        .max(250)
        .nullable()
        .optional(),

    purpose:
      productImagePurposeSchema
        .nullable()
        .optional(),

    sortOrder:
      z.number()
        .int()
        .nonnegative()
        .nullable()
        .optional(),

    primary:
      z.boolean()
        .nullable()
        .optional(),
  });

export type ImageRequest =
  z.infer<
    typeof imageRequestSchema
  >;

export const imageResponseSchema =
  z.object({
    id:
      z.string().uuid(),

    variantId:
      z.string()
        .uuid()
        .nullable(),

    imageUrl:
      z.string(),

    altText:
      z.string()
        .nullable(),

    purpose:
      productImagePurposeSchema,

    sortOrder:
      z.number()
        .int()
        .nonnegative(),

    primary:
      z.boolean(),
  });

export type ImageResponse =
  z.infer<
    typeof imageResponseSchema
  >;

export const productRequestSchema =
  z.object({
    companyId:
      z.string().uuid(),

    categoryId:
      z.string().uuid(),

    name:
      z.string()
        .trim()
        .min(1)
        .max(180),

    slug:
      z.string()
        .trim()
        .min(1)
        .max(200),

    description:
      z.string()
        .nullable()
        .optional(),

    brand:
      z.string()
        .max(120)
        .nullable()
        .optional(),

    composition:
      z.string()
        .max(500)
        .nullable()
        .optional(),

    careInstructions:
      z.string()
        .max(1000)
        .nullable()
        .optional(),

    fitNotes:
      z.string()
        .max(500)
        .nullable()
        .optional(),

    status:
      productStatusSchema
        .nullable()
        .optional(),

    tryOnEnabled:
      z.boolean()
        .nullable()
        .optional(),

    tryOnCategory:
      tryOnCategorySchema
        .nullable()
        .optional(),
  })
    .superRefine(
      (
        value,
        context,
      ) => {
        if (
          value.tryOnEnabled ===
            true &&
          (
            value.tryOnCategory ===
              undefined ||
            value.tryOnCategory ===
              null
          )
        ) {
          context.addIssue({
            code:
              "custom",

            path: [
              "tryOnCategory",
            ],

            message:
              "La categoría de probador virtual es obligatoria cuando el producto está habilitado.",
          });
        }
      },
    );

export type ProductRequest =
  z.infer<
    typeof productRequestSchema
  >;

export const productResponseSchema =
  z.object({
    companyId:
      z.string().uuid(),

    id:
      z.string().uuid(),

    categoryId:
      z.string().uuid(),

    categoryName:
      z.string(),

    name:
      z.string(),

    slug:
      z.string(),

    description:
      z.string()
        .nullable(),

    brand:
      z.string(),

    composition:
      z.string()
        .nullable(),

    careInstructions:
      z.string()
        .nullable(),

    fitNotes:
      z.string()
        .nullable(),

    status:
      productStatusSchema,

    tryOnEnabled:
      z.boolean(),

    tryOnCategory:
      tryOnCategorySchema
        .nullable(),

    tryOnReady:
      z.boolean(),

    variants:
      z.array(
        variantResponseSchema,
      ),

    images:
      z.array(
        imageResponseSchema,
      ),
  });

export type ProductResponse =
  z.infer<
    typeof productResponseSchema
  >;
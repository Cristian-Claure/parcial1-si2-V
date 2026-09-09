import {
  z,
} from "zod";

import {
  companyIdSchema,
} from "./companies.js";

const nullableText =
  z.string().nullable();

export const storeSchema =
  z.object({
    id:
      z.string().uuid(),

    companyId:
      companyIdSchema,

    code:
      z.string()
        .max(40),

    name:
      z.string()
        .max(120),

    address:
      z.string()
        .max(240)
        .nullable(),

    description:
      z.string()
        .max(500)
        .nullable(),

    city:
      z.string()
        .max(120)
        .nullable(),

    phone:
      z.string()
        .max(40)
        .nullable(),

    email:
      z.string()
        .max(180)
        .nullable(),

    active:
      z.boolean(),

    createdAt:
      z.string(),

    updatedAt:
      z.string(),
  });

export type Store =
  z.infer<
    typeof storeSchema
  >;

export const listStoresQuerySchema =
  z.object({
    companyId:
      companyIdSchema,
  });

export type ListStoresQuery =
  z.infer<
    typeof listStoresQuerySchema
  >;

export const createStoreRequestSchema =
  z.object({
    companyId:
      companyIdSchema,

    code:
      z.string()
        .trim()
        .min(
          1,
          {
            message:
              "El código de sucursal es obligatorio.",
          },
        )
        .max(40),

    name:
      z.string()
        .trim()
        .min(
          1,
          {
            message:
              "El nombre de la sucursal es obligatorio.",
          },
        )
        .max(120),

    address:
      z.string()
        .trim()
        .max(240)
        .nullable()
        .optional(),
  });

export type CreateStoreRequest =
  z.infer<
    typeof createStoreRequestSchema
  >;

export const storeResponseSchema =
  z.object({
    id:
      z.string().uuid(),

    companyId:
      companyIdSchema,

    code:
      z.string(),

    name:
      z.string(),

    address:
      nullableText,

    active:
      z.boolean(),
  });

export type StoreResponse =
  z.infer<
    typeof storeResponseSchema
  >;

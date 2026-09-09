import {
  z,
} from "zod";

export const companySchema =
  z.object({
    id:
      z.string().uuid(),

    code:
      z.string()
        .max(40),

    name:
      z.string()
        .max(160),

    description:
      z.string()
        .max(500)
        .nullable(),

    active:
      z.boolean(),

    createdAt:
      z.string(),

    updatedAt:
      z.string(),
  });

export type Company =
  z.infer<
    typeof companySchema
  >;

export const companyRequestSchema =
  z.object({
    code:
      z.string()
        .trim()
        .min(1)
        .max(40),

    name:
      z.string()
        .trim()
        .min(1)
        .max(160),

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

export type CompanyRequest =
  z.infer<
    typeof companyRequestSchema
  >;

export const companyResponseSchema =
  companySchema;

export type CompanyResponse =
  z.infer<
    typeof companyResponseSchema
  >;

import {
  z,
} from "zod";


export const auditEntityIdSchema =
  z
    .string()
    .regex(
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
      "ID inválido.",
    );

export const auditHttpMethodSchema =
  z.enum([
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
  ]);

export type AuditHttpMethod =
  z.infer<
    typeof auditHttpMethodSchema
  >;

export const auditEventSchema =
  z.object({
    id:
      auditEntityIdSchema,
    occurredAt:
      z.string().datetime(),
    actorUserId:
      auditEntityIdSchema
        .nullable(),
    actorEmail:
      z
        .string()
        .nullable(),
    actorName:
      z
        .string()
        .nullable(),
    actorRole:
      z.string(),
    category:
      z.string(),
    httpMethod:
      auditHttpMethodSchema,
    routePattern:
      z.string(),
    requestPath:
      z.string(),
    statusCode:
      z.number().int(),
    success:
      z.boolean(),
    requestId:
      z
        .string()
        .nullable(),
  });

export type AuditEvent =
  z.infer<
    typeof auditEventSchema
  >;

export const auditEventPageSchema =
  z.object({
    content:
      z.array(
        auditEventSchema,
      ),
    totalElements:
      z.number().int().nonnegative(),
    totalPages:
      z.number().int().nonnegative(),
    page:
      z.number().int().nonnegative(),
    size:
      z.number().int().positive(),
  });

export type AuditEventPage =
  z.infer<
    typeof auditEventPageSchema
  >;

export const auditSearchQuerySchema =
  z.object({
    actorId:
      auditEntityIdSchema
        .optional(),
    role:
      z
        .string()
        .trim()
        .max(32)
        .optional(),
    category:
      z
        .string()
        .trim()
        .max(48)
        .optional(),
    method:
      auditHttpMethodSchema
        .optional(),
    success:
      z
        .enum([
          "true",
          "false",
        ])
        .optional(),
    from:
      z
        .string()
        .datetime()
        .optional(),
    to:
      z
        .string()
        .datetime()
        .optional(),
    q:
      z
        .string()
        .trim()
        .max(120)
        .optional(),
    page:
      z.coerce
        .number()
        .int()
        .min(0)
        .default(0),
    size:
      z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .default(25),
  });

export type AuditSearchQuery =
  z.infer<
    typeof auditSearchQuerySchema
  >;

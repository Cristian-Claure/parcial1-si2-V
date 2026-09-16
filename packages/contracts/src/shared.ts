import {
  z,
} from "zod";

// Some catalog/company/order rows were seeded before the current stack
// existed and carry UUIDs whose variant nibble doesn't follow RFC 4122
// (z.string().uuid() rejects them; Postgres does not care). Use this for
// any id that reads or references an existing DB row. Ids the app itself
// generates fresh (idempotency/client-operation keys) should keep
// z.string().uuid().
export const dbIdSchema =
  z.string()
    .regex(
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
      {
        message:
          "Identificador inválido.",
      },
    );

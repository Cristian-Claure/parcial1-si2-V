import type {
  PipeTransform,
} from "@nestjs/common";

import type {
  ZodType,
} from "zod";

import {
  ApiHttpError,
} from "./api-http.error.js";

export class ZodValidationPipe<T>
  implements PipeTransform<unknown, T> {
  constructor(
    private readonly schema:
      ZodType<T>,
  ) {}

  transform(
    value: unknown,
  ): T {
    const result =
      this.schema.safeParse(
        value,
      );

    if (result.success) {
      return result.data;
    }

    const errors:
      Record<
        string,
        string
      > = {};

    for (
      const issue of result.error.issues
    ) {
      const path =
        issue.path[0];

      const field =
        typeof path === "string"
          ? path
          : "request";

      if (
        errors[field] ===
        undefined
      ) {
        errors[field] =
          issue.message;
      }
    }

    throw new ApiHttpError(
      400,
      "Revise los datos ingresados.",
      errors,
    );
  }
}
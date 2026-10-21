export class ApiHttpError
  extends Error {
  readonly status:
    number;

  readonly errors:
    Record<
      string,
      string
    >;

  /** Código estable para la UI (p. ej. PLAN_LIMIT_STORES). */
  code:
    string |
    undefined;

  details:
    Record<
      string,
      unknown
    > |
    undefined;

  constructor(
    status: number,
    message: string,
    errors:
      Record<
        string,
        string
      > = {},
  ) {
    super(message);

    this.name =
      "ApiHttpError";

    this.status =
      status;

    this.errors =
      errors;
  }

  static coded(
    status: number,
    code: string,
    message: string,
    details:
      Record<
        string,
        unknown
      > = {},
  ): ApiHttpError {
    const error =
      new ApiHttpError(
        status,
        message,
      );

    error.code =
      code;

    error.details =
      details;

    return error;
  }
}

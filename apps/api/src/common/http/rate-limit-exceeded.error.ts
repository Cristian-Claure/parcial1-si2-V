export class RateLimitExceededError
  extends Error {
  readonly retryAfterSeconds:
    number;

  constructor(
    retryAfterSeconds: number,
  ) {
    super(
      "Demasiadas solicitudes. Intente nuevamente en unos segundos.",
    );

    this.name =
      "RateLimitExceededError";

    this.retryAfterSeconds =
      retryAfterSeconds;
  }
}
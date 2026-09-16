import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import {
  StripeWebhookService,
} from "./stripe-webhook.service.js";

interface RawBodyRequestShape {
  rawBody?:
    Buffer;
}

@Controller("api")
export class StripeWebhookController {
  constructor(
    private readonly webhook:
      StripeWebhookService,
  ) {}

  @Post(
    "payments/stripe/webhook",
  )
  @HttpCode(
    HttpStatus.NO_CONTENT,
  )
  async handle(
    @Req()
    request:
      RawBodyRequestShape,

    @Headers(
      "stripe-signature",
    )
    signature:
      string |
      undefined,
  ): Promise<void> {
    const rawBody =
      request.rawBody;

    if (!rawBody) {
      throw new ApiHttpError(
        400,
        "No fue posible leer el payload original del webhook Stripe.",
      );
    }

    await this.webhook
      .handle(
        rawBody.toString(
          "utf8",
        ),
        signature ??
          "",
      );
  }
}

import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import {
  Injectable,
} from "@nestjs/common";

import {
  RuntimeConfigService,
} from "../common/config/runtime-config.service.js";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

export interface StripePaymentSnapshot {
  id:
    string;

  orderId:
    string;

  provider:
    string |
    null;

  externalReference:
    string |
    null;
}

export interface StripeCheckoutInput {
  paymentId:
    string;

  orderId:
    string;

  orderNumber:
    string;

  storeName:
    string;

  amount:
    string;

  currency:
    string;
}

export interface StripeCheckoutSession {
  id:
    string;

  url:
    string;

  expiresAt:
    Date |
    null;
}

interface StripeSessionRecord {
  id:
    string;

  status:
    string |
    null;

  payment_status:
    string |
    null;

  payment_intent:
    string |
    null;
}

interface StripeRefundRecord {
  id:
    string;

  status:
    string |
    null;
}

export interface StripeWebhookEvent {
  type:
    string;

  data:
    {
      object:
        unknown;
    };
}

const SIGNATURE_TOLERANCE_SECONDS =
  300;

@Injectable()
export class StripeGatewayService {
  constructor(
    private readonly config:
      RuntimeConfigService,
  ) {}

  supports(
    payment:
      StripePaymentSnapshot,
  ): boolean {
    return (
      payment.provider
        ?.trim()
        .toUpperCase() ===
        "STRIPE" &&
      Boolean(
        payment.externalReference
          ?.trim(),
      )
    );
  }

  async createCheckoutSession(
    input:
      StripeCheckoutInput,
  ): Promise<StripeCheckoutSession> {
    const secret =
      this.requireSecretKey();

    const amount =
      this.toMinorUnits(
        input.amount,
      );

    const successBase =
      this.config.value
        .STRIPE_SUCCESS_URL;

    const successUrl =
      successBase +
      (
        successBase.includes("?")
          ? "&"
          : "?"
      ) +
      "session_id={CHECKOUT_SESSION_ID}" +
      "&payment_id=" +
      encodeURIComponent(
        input.paymentId,
      );

    const body =
      new URLSearchParams();

    body.set(
      "mode",
      "payment",
    );
    body.set(
      "success_url",
      successUrl,
    );
    body.set(
      "cancel_url",
      this.config.value
        .STRIPE_CANCEL_URL,
    );
    body.set(
      "client_reference_id",
      input.paymentId,
    );
    body.set(
      "metadata[velora_payment_id]",
      input.paymentId,
    );
    body.set(
      "metadata[velora_order_id]",
      input.orderId,
    );
    body.set(
      "payment_intent_data[metadata][velora_payment_id]",
      input.paymentId,
    );
    body.set(
      "payment_intent_data[metadata][velora_order_id]",
      input.orderId,
    );
    body.set(
      "line_items[0][quantity]",
      "1",
    );
    body.set(
      "line_items[0][price_data][currency]",
      input.currency
        .toLowerCase(),
    );
    body.set(
      "line_items[0][price_data][unit_amount]",
      String(
        amount,
      ),
    );
    body.set(
      "line_items[0][price_data][product_data][name]",
      "Pedido " +
        input.orderNumber,
    );
    body.set(
      "line_items[0][price_data][product_data][description]",
      "Compra VÉLORA · " +
        input.storeName,
    );

    const session =
      await this.requestJson<
        {
          id?:
            unknown;

          url?:
            unknown;

          expires_at?:
            unknown;
        }
      >(
        "https://api.stripe.com/v1/checkout/sessions",
        {
          method:
            "POST",

          headers: {
            Authorization:
              `Bearer ${secret}`,

            "Content-Type":
              "application/x-www-form-urlencoded",
          },

          body:
            body.toString(),
        },
        "No fue posible iniciar el pago seguro con Stripe.",
      );

    if (
      typeof session.id !==
        "string" ||
      session.id.length ===
        0 ||
      typeof session.url !==
        "string" ||
      session.url.length ===
        0
    ) {
      throw new ApiHttpError(
        502,
        "Stripe no devolvió una sesión de pago válida.",
      );
    }

    return {
      id:
        session.id,

      url:
        session.url,

      expiresAt:
        typeof session.expires_at ===
          "number"
          ? new Date(
              session.expires_at *
                1000,
            )
          : null,
    };
  }

  async expirePendingCheckoutIfNeeded(
    payment:
      StripePaymentSnapshot,
  ): Promise<void> {
    if (
      !this.supports(
        payment,
      )
    ) {
      return;
    }

    const secret =
      this.requireSecretKey();

    const sessionId =
      this.requireSessionId(
        payment,
      );

    const session =
      await this.retrieveSession(
        secret,
        sessionId,
      );

    const status =
      this.normalize(
        session.status,
      );

    if (
      status ===
      "expired"
    ) {
      return;
    }

    if (
      status ===
      "open"
    ) {
      const expired =
        await this.requestJson<
          StripeSessionRecord
        >(
          "https://api.stripe.com/v1/checkout/sessions/" +
            encodeURIComponent(
              sessionId,
            ) +
            "/expire",
          {
            method:
              "POST",

            headers: {
              Authorization:
                `Bearer ${secret}`,

              "Content-Type":
                "application/x-www-form-urlencoded",

              "Idempotency-Key":
                "velora-expire-" +
                payment.id,
            },

            body:
              "",
          },
          "No fue posible cancelar la sesión de pago en Stripe.",
        );

      if (
        this.normalize(
          expired.status,
        ) !==
        "expired"
      ) {
        throw new ApiHttpError(
          502,
          "Stripe no confirmó la expiración de la sesión de pago.",
        );
      }

      return;
    }

    if (
      status ===
        "complete" &&
      this.normalize(
        session.payment_status,
      ) ===
        "paid"
    ) {
      throw new ApiHttpError(
        409,
        "Stripe ya confirmó este pago. Espere la actualización automática antes de cancelarlo.",
      );
    }

    throw new ApiHttpError(
      409,
      "La sesión de Stripe ya no puede cancelarse de forma segura.",
    );
  }

  async refundPaidPaymentIfNeeded(
    payment:
      StripePaymentSnapshot,
  ): Promise<
    string |
    null
  > {
    if (
      !this.supports(
        payment,
      )
    ) {
      return null;
    }

    const secret =
      this.requireSecretKey();

    const sessionId =
      this.requireSessionId(
        payment,
      );

    const session =
      await this.retrieveSession(
        secret,
        sessionId,
      );

    if (
      this.normalize(
        session.status,
      ) !==
        "complete" ||
      this.normalize(
        session.payment_status,
      ) !==
        "paid"
    ) {
      throw new ApiHttpError(
        409,
        "Stripe no confirma un cobro completado para este pago.",
      );
    }

    const paymentIntentId =
      session.payment_intent;

    if (
      !paymentIntentId ||
      paymentIntentId.trim()
        .length ===
        0
    ) {
      throw new ApiHttpError(
        502,
        "Stripe no devolvió el PaymentIntent necesario para el reembolso.",
      );
    }

    const body =
      new URLSearchParams();

    body.set(
      "payment_intent",
      paymentIntentId,
    );
    body.set(
      "reason",
      "requested_by_customer",
    );
    body.set(
      "metadata[velora_payment_id]",
      payment.id,
    );
    body.set(
      "metadata[velora_order_id]",
      payment.orderId,
    );

    const refund =
      await this.requestJson<
        StripeRefundRecord
      >(
        "https://api.stripe.com/v1/refunds",
        {
          method:
            "POST",

          headers: {
            Authorization:
              `Bearer ${secret}`,

            "Content-Type":
              "application/x-www-form-urlencoded",

            "Idempotency-Key":
              "velora-refund-" +
              payment.id,
          },

          body:
            body.toString(),
        },
        "No fue posible completar el reembolso en Stripe.",
      );

    if (
      !refund.id ||
      refund.id.trim()
        .length ===
        0
    ) {
      throw new ApiHttpError(
        502,
        "Stripe no devolvió una referencia de reembolso válida.",
      );
    }

    if (
      this.normalize(
        refund.status,
      ) !==
      "succeeded"
    ) {
      throw new ApiHttpError(
        502,
        "Stripe recibió el reembolso pero todavía no lo confirmó como completado. VÉLORA mantendrá el pago como pagado hasta una confirmación definitiva.",
      );
    }

    return refund.id;
  }

  verifyWebhook(
    payload:
      string,
    signature:
      string,
  ): StripeWebhookEvent {
    const secret =
      this.config.value
        .STRIPE_WEBHOOK_SECRET
        ?.trim() ??
      "";

    if (
      secret.length ===
      0
    ) {
      throw new ApiHttpError(
        503,
        "STRIPE_WEBHOOK_SECRET no está configurado.",
      );
    }

    const parsedSignature =
      this.parseSignature(
        signature,
      );

    const nowSeconds =
      Math.floor(
        Date.now() /
        1000,
      );

    if (
      Math.abs(
        nowSeconds -
          parsedSignature.timestamp,
      ) >
      SIGNATURE_TOLERANCE_SECONDS
    ) {
      throw new ApiHttpError(
        400,
        "Firma de webhook Stripe inválida.",
      );
    }

    const expected =
      createHmac(
        "sha256",
        secret,
      )
        .update(
          `${parsedSignature.timestamp}.${payload}`,
          "utf8",
        )
        .digest();

    const valid =
      parsedSignature.signatures
        .some(
          (candidate) => {
            if (
              !/^[0-9a-fA-F]{64}$/
                .test(
                  candidate,
                )
            ) {
              return false;
            }

            const actual =
              Buffer.from(
                candidate,
                "hex",
              );

            return (
              actual.length ===
                expected.length &&
              timingSafeEqual(
                actual,
                expected,
              )
            );
          },
        );

    if (!valid) {
      throw new ApiHttpError(
        400,
        "Firma de webhook Stripe inválida.",
      );
    }

    let parsed:
      unknown;

    try {
      parsed =
        JSON.parse(
          payload,
        );
    }
    catch {
      throw new ApiHttpError(
        400,
        "Payload de webhook Stripe inválido.",
      );
    }

    if (
      typeof parsed !==
        "object" ||
      parsed ===
        null
    ) {
      throw new ApiHttpError(
        400,
        "Payload de webhook Stripe inválido.",
      );
    }

    const event =
      parsed as {
        type?:
          unknown;

        data?:
          {
            object?:
              unknown;
          };
      };

    if (
      typeof event.type !==
        "string" ||
      !event.data
    ) {
      throw new ApiHttpError(
        400,
        "Payload de webhook Stripe inválido.",
      );
    }

    return {
      type:
        event.type,

      data: {
        object:
          event.data
            .object,
      },
    };
  }

  private async retrieveSession(
    secret:
      string,
    sessionId:
      string,
  ): Promise<StripeSessionRecord> {
    return this.requestJson<
      StripeSessionRecord
    >(
      "https://api.stripe.com/v1/checkout/sessions/" +
        encodeURIComponent(
          sessionId,
        ),
      {
        method:
          "GET",

        headers: {
          Authorization:
            `Bearer ${secret}`,
        },
      },
      "No fue posible consultar la sesión de pago en Stripe.",
    );
  }

  private async requestJson<T>(
    url:
      string,
    init:
      RequestInit,
    fallbackMessage:
      string,
  ): Promise<T> {
    let response:
      Response;

    try {
      response =
        await fetch(
          url,
          init,
        );
    }
    catch {
      throw new ApiHttpError(
        502,
        fallbackMessage,
      );
    }

    let payload:
      unknown =
      null;

    try {
      payload =
        await response
          .json();
    }
    catch {
      payload =
        null;
    }

    if (
      !response.ok
    ) {
      throw new ApiHttpError(
        response.status >=
          500
          ? 502
          : 409,
        fallbackMessage,
      );
    }

    return payload as T;
  }

  private requireSecretKey():
    string {
    const secret =
      this.config.value
        .STRIPE_SECRET_KEY
        ?.trim() ??
      "";

    if (
      secret.length ===
      0
    ) {
      throw new ApiHttpError(
        503,
        "STRIPE_SECRET_KEY no está configurado.",
      );
    }

    return secret;
  }

  private requireSessionId(
    payment:
      StripePaymentSnapshot,
  ): string {
    const sessionId =
      payment.externalReference
        ?.trim() ??
      "";

    if (
      !sessionId
        .startsWith(
          "cs_",
        )
    ) {
      throw new ApiHttpError(
        409,
        "El pago Stripe no tiene una Checkout Session válida.",
      );
    }

    return sessionId;
  }

  private toMinorUnits(
    amount:
      string,
  ): number {
    const value =
      Number(
        amount,
      );

    const units =
      Math.round(
        value *
        100,
      );

    if (
      !Number.isFinite(
        value,
      ) ||
      value <=
        0 ||
      Math.abs(
        value *
          100 -
          units,
      ) >
        1e-7 ||
      !Number.isSafeInteger(
        units,
      )
    ) {
      throw new ApiHttpError(
        409,
        "El importe del pedido no puede convertirse a unidades monetarias Stripe.",
      );
    }

    return units;
  }

  private parseSignature(
    signature:
      string,
  ): {
    timestamp:
      number;

    signatures:
      string[];
  } {
    if (
      !signature ||
      signature.trim()
        .length ===
        0
    ) {
      throw new ApiHttpError(
        400,
        "Firma de webhook Stripe inválida.",
      );
    }

    let timestamp:
      number |
      null =
      null;

    const signatures:
      string[] =
      [];

    for (
      const part of
      signature.split(",")
    ) {
      const separator =
        part.indexOf("=");

      if (
        separator <=
        0
      ) {
        continue;
      }

      const key =
        part
          .slice(
            0,
            separator,
          )
          .trim();

      const value =
        part
          .slice(
            separator +
              1,
          )
          .trim();

      if (
        key ===
          "t"
      ) {
        const parsed =
          Number(
            value,
          );

        if (
          Number.isInteger(
            parsed,
          )
        ) {
          timestamp =
            parsed;
        }
      }

      if (
        key ===
          "v1" &&
        value
      ) {
        signatures.push(
          value,
        );
      }
    }

    if (
      timestamp ===
        null ||
      signatures.length ===
        0
    ) {
      throw new ApiHttpError(
        400,
        "Firma de webhook Stripe inválida.",
      );
    }

    return {
      timestamp,
      signatures,
    };
  }

  private normalize(
    value:
      string |
      null |
      undefined,
  ): string {
    return value
      ?.trim()
      .toLowerCase() ??
      "";
  }
}

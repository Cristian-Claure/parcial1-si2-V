import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import type { ApiHttpError } from "../common/http/api-http.error.js";
import { StripeGatewayService, type StripePaymentSnapshot } from "./stripe-gateway.service.js";

function configService(overrides: Record<string, string | undefined> = {}): RuntimeConfigService {
  return {
    value: {
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      STRIPE_SUCCESS_URL: "http://localhost:5173/pago/stripe/retorno",
      STRIPE_CANCEL_URL: "http://localhost:5173/mis-pedidos",
      VELORA_PUBLIC_BACKEND_URL: "https://api.velora.example/",
      ...overrides,
    },
  } as unknown as RuntimeConfigService;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function captureError(fn: () => unknown): ApiHttpError {
  try {
    fn();
  } catch (error) {
    return error as ApiHttpError;
  }
  throw new Error("expected fn to throw");
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("StripeGatewayService#supports", () => {
  const service = new StripeGatewayService(configService());

  it("is true for the STRIPE provider (case-insensitive) with a reference", () => {
    expect(service.supports({ id: "p1", orderId: "o1", provider: "stripe", externalReference: "cs_123" })).toBe(true);
  });

  it("is false for a non-Stripe provider", () => {
    expect(service.supports({ id: "p1", orderId: "o1", provider: "CASH", externalReference: "cs_123" })).toBe(false);
  });

  it("is false without a usable external reference", () => {
    expect(service.supports({ id: "p1", orderId: "o1", provider: "STRIPE", externalReference: "   " })).toBe(false);
    expect(service.supports({ id: "p1", orderId: "o1", provider: "STRIPE", externalReference: null })).toBe(false);
  });
});

describe("StripeGatewayService#createCheckoutSession", () => {
  const input = { paymentId: "pay-1", orderId: "order-1", orderNumber: "VEL-1", storeName: "Equipetrol", amount: "150.50", currency: "bob" };

  it("throws 503 when STRIPE_SECRET_KEY is not configured", async () => {
    const service = new StripeGatewayService(configService({ STRIPE_SECRET_KEY: "" }));
    await expect(service.createCheckoutSession(input)).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects amounts that cannot be converted to Stripe cents", async () => {
    const service = new StripeGatewayService(configService());
    await expect(service.createCheckoutSession({ ...input, amount: "0" })).rejects.toMatchObject({ status: 409 });
    await expect(service.createCheckoutSession({ ...input, amount: "abc" })).rejects.toMatchObject({ status: 409 });
    await expect(service.createCheckoutSession({ ...input, amount: "-5" })).rejects.toMatchObject({ status: 409 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the amount in cents and VÉLORA metadata, returning the created session", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "cs_123", url: "https://checkout.stripe.com/cs_123", expires_at: 1_700_000_000 }));
    const service = new StripeGatewayService(configService());

    const result = await service.createCheckoutSession(input, "WEB");

    expect(result).toEqual({ id: "cs_123", url: "https://checkout.stripe.com/cs_123", expiresAt: new Date(1_700_000_000 * 1000) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("line_items[0][price_data][unit_amount]")).toBe("15050");
    expect(body.get("line_items[0][price_data][currency]")).toBe("bob");
    expect(body.get("metadata[velora_payment_id]")).toBe("pay-1");
    expect(body.get("metadata[velora_order_id]")).toBe("order-1");
    expect(body.get("success_url")).toContain("http://localhost:5173/pago/stripe/retorno");
  });

  it("routes the success/cancel redirects through the backend trampoline for MOBILE", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "cs_1", url: "https://checkout.stripe.com/cs_1" }));
    const service = new StripeGatewayService(configService());

    await service.createCheckoutSession(input, "MOBILE");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(init.body as string);
    expect(body.get("success_url")).toContain("/api/payments/stripe/mobile/success");
    expect(body.get("cancel_url")).toContain("/api/payments/stripe/mobile/cancel");
  });

  it("throws 502 when Stripe responds without a usable session id/url", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "", url: "" }));
    const service = new StripeGatewayService(configService());
    await expect(service.createCheckoutSession(input)).rejects.toMatchObject({ status: 502 });
  });

  it("throws 502 when the network request itself fails", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const service = new StripeGatewayService(configService());
    await expect(service.createCheckoutSession(input)).rejects.toMatchObject({ status: 502 });
  });

  it("maps a Stripe 4xx error to 409 and a 5xx error to 502", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: "bad request" }));
    const service = new StripeGatewayService(configService());
    await expect(service.createCheckoutSession(input)).rejects.toMatchObject({ status: 409 });

    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
    await expect(service.createCheckoutSession(input)).rejects.toMatchObject({ status: 502 });
  });
});

describe("StripeGatewayService#expirePendingCheckoutIfNeeded", () => {
  const payment: StripePaymentSnapshot = { id: "pay-1", orderId: "order-1", provider: "STRIPE", externalReference: "cs_123" };

  it("does nothing when the payment is not a Stripe payment", async () => {
    const service = new StripeGatewayService(configService());
    await service.expirePendingCheckoutIfNeeded({ ...payment, provider: "CASH" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws 409 when the payment has no valid Stripe checkout session id", async () => {
    const service = new StripeGatewayService(configService());
    await expect(service.expirePendingCheckoutIfNeeded({ ...payment, externalReference: "pi_123" })).rejects.toMatchObject({ status: 409 });
  });

  it("returns without calling Stripe again when the session is already expired", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "cs_123", status: "expired", payment_status: null, payment_intent: null }));
    const service = new StripeGatewayService(configService());
    await service.expirePendingCheckoutIfNeeded(payment);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("expires an open session", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { id: "cs_123", status: "open", payment_status: null, payment_intent: null }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "cs_123", status: "expired", payment_status: null, payment_intent: null }));
    const service = new StripeGatewayService(configService());

    await service.expirePendingCheckoutIfNeeded(payment);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/expire");
  });

  it("throws 502 when Stripe does not confirm the expiration", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { id: "cs_123", status: "open", payment_status: null, payment_intent: null }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "cs_123", status: "open", payment_status: null, payment_intent: null }));
    const service = new StripeGatewayService(configService());
    await expect(service.expirePendingCheckoutIfNeeded(payment)).rejects.toMatchObject({ status: 502 });
  });

  it("throws 409 when Stripe already confirmed a completed, paid session", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "cs_123", status: "complete", payment_status: "paid", payment_intent: "pi_1" }));
    const service = new StripeGatewayService(configService());
    await expect(service.expirePendingCheckoutIfNeeded(payment)).rejects.toMatchObject({ status: 409 });
  });

  it("throws 409 for any other non-cancellable session state", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "cs_123", status: "complete", payment_status: "unpaid", payment_intent: null }));
    const service = new StripeGatewayService(configService());
    await expect(service.expirePendingCheckoutIfNeeded(payment)).rejects.toMatchObject({ status: 409 });
  });
});

describe("StripeGatewayService#refundPaidPaymentIfNeeded", () => {
  const payment: StripePaymentSnapshot = { id: "pay-1", orderId: "order-1", provider: "STRIPE", externalReference: "cs_123" };

  it("returns null when the payment is not a Stripe payment", async () => {
    const service = new StripeGatewayService(configService());
    await expect(service.refundPaidPaymentIfNeeded({ ...payment, provider: null })).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws 409 when Stripe does not confirm a completed, paid session", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "cs_123", status: "open", payment_status: null, payment_intent: null }));
    const service = new StripeGatewayService(configService());
    await expect(service.refundPaidPaymentIfNeeded(payment)).rejects.toMatchObject({ status: 409 });
  });

  it("throws 502 when Stripe confirms payment but omits the PaymentIntent", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "cs_123", status: "complete", payment_status: "paid", payment_intent: "   " }));
    const service = new StripeGatewayService(configService());
    await expect(service.refundPaidPaymentIfNeeded(payment)).rejects.toMatchObject({ status: 502 });
  });

  it("returns the refund id once Stripe confirms it succeeded", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { id: "cs_123", status: "complete", payment_status: "paid", payment_intent: "pi_1" }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "re_1", status: "succeeded" }));
    const service = new StripeGatewayService(configService());

    await expect(service.refundPaidPaymentIfNeeded(payment)).resolves.toBe("re_1");

    const [, refundInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = new URLSearchParams(refundInit.body as string);
    expect(body.get("payment_intent")).toBe("pi_1");
  });

  it("throws 502 when the refund is not confirmed as succeeded", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { id: "cs_123", status: "complete", payment_status: "paid", payment_intent: "pi_1" }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "re_1", status: "pending" }));
    const service = new StripeGatewayService(configService());
    await expect(service.refundPaidPaymentIfNeeded(payment)).rejects.toMatchObject({ status: 502 });
  });

  it("throws 502 when Stripe omits the refund id", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { id: "cs_123", status: "complete", payment_status: "paid", payment_intent: "pi_1" }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "", status: "succeeded" }));
    const service = new StripeGatewayService(configService());
    await expect(service.refundPaidPaymentIfNeeded(payment)).rejects.toMatchObject({ status: 502 });
  });
});

describe("StripeGatewayService#verifyWebhook", () => {
  const secret = "whsec_test";
  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1" } } });

  function sign(withSecret: string, withPayload: string, timestamp: number): string {
    const digest = createHmac("sha256", withSecret).update(`${timestamp}.${withPayload}`, "utf8").digest("hex");
    return `t=${timestamp},v1=${digest}`;
  }

  it("throws 503 when STRIPE_WEBHOOK_SECRET is not configured", () => {
    const service = new StripeGatewayService(configService({ STRIPE_WEBHOOK_SECRET: "" }));
    expect(captureError(() => service.verifyWebhook(payload, "t=1,v1=abc"))).toMatchObject({ status: 503 });
  });

  it("throws 400 when the signature header is missing or malformed", () => {
    const service = new StripeGatewayService(configService({ STRIPE_WEBHOOK_SECRET: secret }));
    expect(captureError(() => service.verifyWebhook(payload, ""))).toMatchObject({ status: 400 });
    expect(captureError(() => service.verifyWebhook(payload, "garbage"))).toMatchObject({ status: 400 });
  });

  it("throws 400 when the timestamp falls outside the tolerance window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const staleTimestamp = Math.floor(Date.now() / 1000) - 301;
    const service = new StripeGatewayService(configService({ STRIPE_WEBHOOK_SECRET: secret }));
    const signature = sign(secret, payload, staleTimestamp);
    expect(captureError(() => service.verifyWebhook(payload, signature))).toMatchObject({ status: 400 });
  });

  it("throws 400 when the signature does not match the payload", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const timestamp = Math.floor(Date.now() / 1000);
    const service = new StripeGatewayService(configService({ STRIPE_WEBHOOK_SECRET: secret }));
    const signature = sign("wrong-secret", payload, timestamp);
    expect(captureError(() => service.verifyWebhook(payload, signature))).toMatchObject({ status: 400 });
  });

  it("returns the parsed event for a validly signed, in-window payload", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const timestamp = Math.floor(Date.now() / 1000);
    const service = new StripeGatewayService(configService({ STRIPE_WEBHOOK_SECRET: secret }));
    const signature = sign(secret, payload, timestamp);

    expect(service.verifyWebhook(payload, signature)).toEqual({
      type: "checkout.session.completed",
      data: { object: { id: "cs_1" } },
    });
  });

  it("throws 400 for malformed JSON payloads even when correctly signed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const timestamp = Math.floor(Date.now() / 1000);
    const badPayload = "not-json";
    const service = new StripeGatewayService(configService({ STRIPE_WEBHOOK_SECRET: secret }));
    const signature = sign(secret, badPayload, timestamp);
    expect(captureError(() => service.verifyWebhook(badPayload, signature))).toMatchObject({ status: 400 });
  });

  it("throws 400 when the payload is missing type or data", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const timestamp = Math.floor(Date.now() / 1000);
    const incomplete = JSON.stringify({ id: "evt_1" });
    const service = new StripeGatewayService(configService({ STRIPE_WEBHOOK_SECRET: secret }));
    const signature = sign(secret, incomplete, timestamp);
    expect(captureError(() => service.verifyWebhook(incomplete, signature))).toMatchObject({ status: 400 });
  });
});

export type StripeReturnTarget =
  | "WEB"
  | "MOBILE";

export interface StripeRedirectConfig {
  webSuccessUrl: string;
  webCancelUrl: string;
  publicBackendUrl: string;
}

export interface StripeRedirectUrls {
  successBase: string;
  cancelUrl: string;
}

function httpBaseUrl(value: string): string {
  const parsed = new URL(value);

  if (
    parsed.protocol !== "http:" &&
    parsed.protocol !== "https:"
  ) {
    throw new Error(
      "VELORA_PUBLIC_BACKEND_URL debe usar http o https.",
    );
  }

  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/$/, "");
}

export function stripeCheckoutRedirects(
  config: StripeRedirectConfig,
  target: StripeReturnTarget,
  paymentId: string,
): StripeRedirectUrls {
  if (target === "WEB") {
    return {
      successBase: config.webSuccessUrl,
      cancelUrl: config.webCancelUrl,
    };
  }

  const base = httpBaseUrl(config.publicBackendUrl);

  return {
    successBase:
      `${base}/api/payments/stripe/mobile/success`,
    cancelUrl:
      `${base}/api/payments/stripe/mobile/cancel?payment_id=${encodeURIComponent(paymentId)}`,
  };
}

export function normalizeMobileReturnParam(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (
    normalized.length === 0 ||
    normalized.length > 300
  ) {
    return null;
  }

  return normalized;
}

export function mobileStripeAppUrl(
  destination: "success" | "cancel",
  params: {
    sessionId?: string | null;
    paymentId?: string | null;
  },
): string {
  const base =
    destination === "success"
      ? "velora://stripe-return"
      : "velora://orders";

  const query = new URLSearchParams();

  if (params.sessionId) {
    query.set("session_id", params.sessionId);
  }

  if (params.paymentId) {
    query.set("payment_id", params.paymentId);
  }

  if (destination === "cancel") {
    query.set("stripe", "cancelled");
  }

  const suffix = query.toString();

  return suffix.length > 0
    ? `${base}?${suffix}`
    : base;
}

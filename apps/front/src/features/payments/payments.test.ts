import { describe, expect, it } from "vitest";
import { formatCountdown, planPaymentMethodLabel, secondsUntil, statusPillClass } from "./paymentFormat";

describe("pagos (Fase 5)", () => {
  it("la cuenta regresiva usa el vencimiento del servidor y nunca es negativa", () => {
    const expiresAt = "2026-10-29T12:10:00.000Z";
    expect(secondsUntil(expiresAt, null, 600)).toBe(600);
    expect(secondsUntil(expiresAt, Date.parse("2026-10-29T12:09:00.000Z"), 600)).toBe(60);
    expect(secondsUntil(expiresAt, Date.parse("2026-10-29T12:11:00.000Z"), 600)).toBe(0);
    expect(formatCountdown(599)).toBe("9:59");
    expect(formatCountdown(5)).toBe("0:05");
  });

  it("etiquetas de método y estado", () => {
    expect(planPaymentMethodLabel({ method: "QR", provider: "QR_DEMO" })).toBe("QR (demostración)");
    expect(planPaymentMethodLabel({ method: "WEB", provider: "STRIPE" })).toBe("Tarjeta (Stripe)");
    expect(planPaymentMethodLabel({ method: "TRANSFER", provider: "TRANSFER" })).toBe("Transferencia");
    expect(planPaymentMethodLabel({ method: "CARD", provider: "DEMO" })).toBe("Tarjeta DEMO");
    expect(statusPillClass("PENDING_REVIEW")).toBe("status-pill status-pending");
    expect(statusPillClass("EXPIRED")).toBe("status-pill status-cancelled");
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import { formatCountdown, isQrCharge, secondsUntil } from "../src/features/payments/qrCountdown.ts";

test("la cuenta regresiva del QR usa el vencimiento del servidor y nunca es negativa", () => {
  const expiresAt = "2026-10-29T12:10:00.000Z";
  assert.equal(secondsUntil(expiresAt, Date.parse("2026-10-29T12:09:30.000Z")), 30);
  assert.equal(secondsUntil(expiresAt, Date.parse("2026-10-29T12:30:00.000Z")), 0);
  assert.equal(secondsUntil("no-es-fecha", 0, 42), 42);
  assert.equal(formatCountdown(600), "10:00");
  assert.equal(formatCountdown(9), "0:09");
});

test("solo los pagos QR generados (proveedor QR_*) muestran el panel", () => {
  assert.equal(isQrCharge({ method: "QR", provider: "QR_DEMO" }), true);
  assert.equal(isQrCharge({ method: "QR", provider: null }), false);
  assert.equal(isQrCharge({ method: "CARD", provider: "QR_DEMO" }), false);
});

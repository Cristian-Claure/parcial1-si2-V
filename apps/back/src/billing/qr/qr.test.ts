import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { nextPlanPeriod, PLAN_PERIOD_DAYS } from "../payment-settlement.service.js";
import { hashToken, newQrReference, PayAttemptLimiter, pollDelayMs } from "../qr-charge.service.js";
import { renderQrPng, renderQrSvg } from "./qr-image.js";
import { constantTimeEquals, signDemoToken } from "./qr-gateway.js";

const SECRET = "s".repeat(40);
const charge = { chargeId: "c1", reference: "26102912345678", amount: "149.00", currency: "BOB", expiresAt: new Date("2026-10-29T12:10:00Z") };

describe("QR DEMO: firma, token e imagen", () => {
  it("la firma cambia si cambia el monto, la moneda, la referencia o el vencimiento (monto inmutable)", () => {
    const base = signDemoToken(SECRET, charge);
    expect(signDemoToken(SECRET, { ...charge })).toBe(base);
    expect(signDemoToken(SECRET, { ...charge, amount: "1.00" })).not.toBe(base);
    expect(signDemoToken(SECRET, { ...charge, currency: "USD" })).not.toBe(base);
    expect(signDemoToken(SECRET, { ...charge, reference: "26102900000000" })).not.toBe(base);
    expect(signDemoToken(SECRET, { ...charge, expiresAt: new Date("2026-10-29T13:00:00Z") })).not.toBe(base);
    expect(signDemoToken("otro".repeat(10), charge)).not.toBe(base);
  });

  it("compara en tiempo constante y el hash guardado no es el token", () => {
    const token = signDemoToken(SECRET, charge);
    expect(constantTimeEquals(token, token)).toBe(true);
    expect(constantTimeEquals(token, `${token}x`)).toBe(false);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
  });

  it("genera SVG y un PNG válido (firma, IHDR y datos que se descomprimen)", () => {
    const svg = renderQrSvg("https://ejemplo.test/pagar/qr/1?t=abc");
    expect(svg.startsWith("<svg")).toBe(true);
    const png = renderQrPng("https://ejemplo.test/pagar/qr/1?t=abc");
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const width = png.readUInt32BE(16);
    const idatLength = png.readUInt32BE(33);
    expect(png.subarray(37, 41).toString("ascii")).toBe("IDAT");
    expect(inflateSync(png.subarray(41, 41 + idatLength)).length).toBe((width + 1) * width);
  });

  it("referencia numérica de 14 dígitos y backoff acotado", () => {
    expect(newQrReference(new Date("2026-10-29T00:00:00Z"))).toMatch(/^261029\d{8}$/);
    expect([0, 1, 2, 3, 10].map(pollDelayMs)).toEqual([2000, 4000, 8000, 16000, 30000]);
  });

  it("limita los intentos por IP", () => {
    const limiter = new PayAttemptLimiter(3, 60);
    for (let i = 0; i < 3; i += 1) limiter.register("1.1.1.1");
    expect(() => limiter.register("1.1.1.1")).toThrow(/Demasiados intentos/);
    expect(() => limiter.register("2.2.2.2")).not.toThrow();
  });
});

describe("periodo del plan", () => {
  const now = new Date("2026-10-29T00:00:00Z");
  const day = 24 * 60 * 60 * 1000;
  it("renovación anticipada del mismo plan suma 30 días desde el vencimiento", () => {
    const end = new Date(now.getTime() + 10 * day);
    const period = nextPlanPeriod({ planId: "max", status: "ACTIVE", currentPeriodStart: new Date(now.getTime() - 20 * day), currentPeriodEnd: end }, "max", now);
    expect(period.end.getTime()).toBe(end.getTime() + PLAN_PERIOD_DAYS * day);
  });
  it("cambio de plan, prueba o vencido empiezan hoy", () => {
    const end = new Date(now.getTime() + 10 * day);
    expect(nextPlanPeriod({ planId: "plus", status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: end }, "max", now).start).toEqual(now);
    expect(nextPlanPeriod({ planId: "max", status: "TRIAL", currentPeriodStart: now, currentPeriodEnd: end }, "max", now).end.getTime()).toBe(now.getTime() + 30 * day);
    expect(nextPlanPeriod(null, "max", now).start).toEqual(now);
  });
});

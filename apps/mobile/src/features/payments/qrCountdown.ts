/** Segundos restantes según el vencimiento del servidor (el reloj del teléfono solo avanza la cuenta). */
export function secondsUntil(expiresAt: string, now: number, fallback: number | null = null): number {
  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) return Math.max(0, fallback ?? 0);
  return Math.max(0, Math.floor((parsed - now) / 1000));
}

export function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Pago QR generado por el cliente (Fase 5): proveedor QR_DEMO u otro banco. */
export function isQrCharge(payment: { method: string; provider: string | null }): boolean {
  return payment.method === "QR" && Boolean(payment.provider?.startsWith("QR_"));
}

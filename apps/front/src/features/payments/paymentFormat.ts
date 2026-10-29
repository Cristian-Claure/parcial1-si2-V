import type { PaymentStatus, PlanPayment } from "@velora/contracts";

/** Segundos restantes según el vencimiento del servidor (el reloj solo avanza la cuenta regresiva). */
export function secondsUntil(expiresAt: string, now: number | null, fallback: number): number {
  return now === null ? fallback : Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1000));
}

export function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function statusPillClass(status: PaymentStatus): string {
  if (status === "PENDING_REVIEW") return "status-pill status-pending";
  if (status === "EXPIRED") return "status-pill status-cancelled";
  return `status-pill status-${status.toLowerCase()}`;
}

export function planPaymentMethodLabel(payment: Pick<PlanPayment, "method" | "provider">): string {
  if (payment.method === "QR") return payment.provider === "QR_DEMO" ? "QR (demostración)" : "QR";
  if (payment.method === "TRANSFER") return "Transferencia";
  if (payment.provider === "STRIPE") return "Tarjeta (Stripe)";
  return "Tarjeta DEMO";
}

/** Abre un PDF o imagen protegidos (se piden con la sesión y se muestran como blob). */
export async function openProtectedFile(load: () => Promise<Blob>): Promise<void> {
  const blob = await load();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

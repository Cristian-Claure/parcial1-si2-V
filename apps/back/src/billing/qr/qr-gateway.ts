import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { QrProvider } from "@velora/contracts";
import { RuntimeConfigService } from "../../common/config/runtime-config.service.js";

/** Datos inmutables de un cargo QR: el monto y la moneda los fija siempre el servidor. */
export interface QrChargeContext {
  chargeId: string;
  reference: string;
  amount: string;
  currency: string;
  expiresAt: Date;
  description: string;
}

export interface QrChargeCreated {
  /** Identificador del cobro en el proveedor (null en DEMO). */
  providerChargeId: string | null;
  /** Contenido del QR emitido por el proveedor; DEMO no lo guarda porque contiene el token. */
  providerQrPayload: string | null;
}

export type QrRemoteStatus = "PENDING" | "PAID" | "FAILED" | "EXPIRED";

export interface QrReadiness { ready: boolean; reason: string | null }

/**
 * Pasarela de cobro por QR (Fase 5). DEMO firma su propio QR; OPENBCB/BCP hablan con el banco
 * solo a partir de su documentación oficial (ver bank-qr.gateway.ts y docs/bank-api/FALTA.md).
 */
export interface QrPaymentGateway {
  readonly provider: QrProvider;
  readonly demo: boolean;
  readiness(): QrReadiness;
  createCharge(charge: QrChargeContext): Promise<QrChargeCreated>;
  /** Texto que se codifica en el QR (DEMO lo recalcula a partir de la firma). */
  qrText(charge: QrChargeContext, providerQrPayload: string | null): string;
  /** Consulta de estado en el proveedor (el servidor la ejecuta con backoff cuando el cliente consulta). */
  queryStatus(providerChargeId: string): Promise<QrRemoteStatus>;
  refund(providerChargeId: string | null, amount: string): Promise<{ refundId: string }>;
}

export const QR_PAYMENT_GATEWAY = Symbol("QR_PAYMENT_GATEWAY");

/**
 * Token DEMO: HMAC-SHA256 (VELORA_QR_SIGNING_SECRET) sobre cargo, referencia, monto en centavos y
 * moneda. Cambiar cualquiera de esos datos invalida el QR. El vencimiento (10 min) lo controla el
 * servidor con `expires_at` (410 al vencer). En la BD solo queda el hash del token.
 */
export function signDemoToken(secret: string, charge: Pick<QrChargeContext, "chargeId" | "reference" | "amount" | "currency">): string {
  const cents = Math.round(Number(charge.amount) * 100);
  const payload = ["v1", charge.chargeId, charge.reference, cents, charge.currency.toUpperCase()].join("|");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Comparación en tiempo constante (longitudes distintas → false sin filtrar tiempos). */
export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

@Injectable()
export class DemoQrGateway implements QrPaymentGateway {
  readonly provider = "DEMO" as const;
  readonly demo = true;

  constructor(private readonly config: RuntimeConfigService) {}

  readiness(): QrReadiness {
    const secret = this.config.value.VELORA_QR_SIGNING_SECRET;
    if (!secret || secret.length < 32) return { ready: false, reason: "QR no configurado: falta VELORA_QR_SIGNING_SECRET (mínimo 32 caracteres)." };
    return { ready: true, reason: null };
  }

  async createCharge(): Promise<QrChargeCreated> {
    return { providerChargeId: null, providerQrPayload: null };
  }

  token(charge: QrChargeContext): string {
    return signDemoToken(this.secret(), charge);
  }

  qrText(charge: QrChargeContext): string {
    return `${this.config.value.VELORA_PUBLIC_WEB_URL}/pagar/qr/${charge.reference}?t=${this.token(charge)}`;
  }

  verifyToken(charge: QrChargeContext, token: string): boolean {
    return constantTimeEquals(this.token(charge), token);
  }

  /** En DEMO el estado vive en la BD (lo cambia la pantalla "Banco demo"): no hay proveedor que consultar. */
  async queryStatus(): Promise<QrRemoteStatus> {
    return "PENDING";
  }

  /** Reembolso simulado: no mueve dinero real. */
  async refund(): Promise<{ refundId: string }> {
    return { refundId: `demo_refund_${randomUUID()}` };
  }

  private secret(): string {
    const secret = this.config.value.VELORA_QR_SIGNING_SECRET;
    if (!secret) throw new Error("VELORA_QR_SIGNING_SECRET no está configurado.");
    return secret;
  }
}

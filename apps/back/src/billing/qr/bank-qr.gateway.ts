import { ApiHttpError } from "../../common/http/api-http.error.js";
import type { QrChargeContext, QrChargeCreated, QrPaymentGateway, QrReadiness, QrRemoteStatus } from "./qr-gateway.js";

/**
 * Adaptador QR bancario (OPENBCB o BCP) — ESQUELETO.
 *
 * No hay documentación oficial en docs/bank-api/, así que aquí NO se define ningún endpoint, campo
 * ni esquema de autenticación del banco. Todo lo específico del banco vive en un `BankQrApiSpec` que
 * se escribirá a partir de esa documentación (ver docs/bank-api/FALTA.md). Mientras el spec sea
 * `null`, el proveedor responde 503 QR_PROVIDER_NOT_READY y el sistema sigue usando DEMO.
 *
 * El adaptador sí resuelve lo genérico: credenciales por variables de entorno, tiempo de espera,
 * mapeo de errores y la consulta de estado que el servicio ejecuta con backoff.
 */
export interface BankHttpClient {
  request<T>(method: "GET" | "POST", path: string, options?: { body?: unknown; headers?: Record<string, string> }): Promise<{ status: number; body: T }>;
}

export interface BankCredentials { clientId: string; clientSecret: string }

export interface BankQrApiSpec {
  /** Encabezados de autorización según la documentación (token, firma, etc.). */
  authorize(http: BankHttpClient, credentials: BankCredentials): Promise<Record<string, string>>;
  createCharge(http: BankHttpClient, headers: Record<string, string>, charge: QrChargeContext): Promise<QrChargeCreated>;
  queryStatus(http: BankHttpClient, headers: Record<string, string>, providerChargeId: string): Promise<QrRemoteStatus>;
  refund?(http: BankHttpClient, headers: Record<string, string>, providerChargeId: string, amount: string): Promise<{ refundId: string }>;
}

/** Specs oficiales por proveedor. Se completan SOLO con la documentación del banco (hoy no existe). */
export const BANK_QR_SPECS: Record<"OPENBCB" | "BCP", BankQrApiSpec | null> = { OPENBCB: null, BCP: null };

export interface BankQrSettings { baseUrl?: string | undefined; clientId?: string | undefined; clientSecret?: string | undefined; timeoutMs?: number }

export function fetchBankHttpClient(baseUrl: string, timeoutMs: number): BankHttpClient {
  return {
    async request<T>(method: "GET" | "POST", path: string, options: { body?: unknown; headers?: Record<string, string> } = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(new URL(path, baseUrl), {
          method,
          headers: { Accept: "application/json", ...(options.body === undefined ? {} : { "Content-Type": "application/json" }), ...options.headers },
          ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
          signal: controller.signal,
        });
        const text = await response.text();
        return { status: response.status, body: (text ? JSON.parse(text) : null) as T };
      } catch {
        throw new ApiHttpError(502, "El banco no respondió a tiempo.");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export class BankQrGateway implements QrPaymentGateway {
  readonly demo = false;

  constructor(
    readonly provider: "OPENBCB" | "BCP",
    private readonly settings: BankQrSettings,
    private readonly spec: BankQrApiSpec | null = BANK_QR_SPECS[provider],
  ) {}

  readiness(): QrReadiness {
    if (!this.spec) return { ready: false, reason: `QR ${this.provider} sin implementar: falta la documentación oficial del banco (docs/bank-api/FALTA.md).` };
    if (!this.settings.baseUrl || !this.settings.clientId || !this.settings.clientSecret) {
      return { ready: false, reason: `QR ${this.provider} no configurado: faltan VELORA_QR_BASE_URL, VELORA_QR_CLIENT_ID o VELORA_QR_CLIENT_SECRET.` };
    }
    return { ready: true, reason: null };
  }

  async createCharge(charge: QrChargeContext): Promise<QrChargeCreated> {
    const { spec, http, headers } = await this.session();
    const created = await spec.createCharge(http, headers, charge);
    if (!created.providerChargeId || !created.providerQrPayload) throw new ApiHttpError(502, "El banco no devolvió un QR válido.");
    return created;
  }

  qrText(_charge: QrChargeContext, providerQrPayload: string | null): string {
    if (!providerQrPayload) throw new ApiHttpError(502, "El cargo QR no tiene contenido del banco.");
    return providerQrPayload;
  }

  async queryStatus(providerChargeId: string): Promise<QrRemoteStatus> {
    const { spec, http, headers } = await this.session();
    return spec.queryStatus(http, headers, providerChargeId);
  }

  async refund(providerChargeId: string | null, amount: string): Promise<{ refundId: string }> {
    const { spec, http, headers } = await this.session();
    if (!spec.refund || !providerChargeId) throw new ApiHttpError(501, `El reembolso por ${this.provider} no está disponible.`);
    return spec.refund(http, headers, providerChargeId, amount);
  }

  private async session(): Promise<{ spec: BankQrApiSpec; http: BankHttpClient; headers: Record<string, string> }> {
    const readiness = this.readiness();
    if (!readiness.ready || !this.spec) throw ApiHttpError.coded(503, "QR_PROVIDER_NOT_READY", readiness.reason ?? "Proveedor QR no disponible.");
    const http = fetchBankHttpClient(this.settings.baseUrl!, this.settings.timeoutMs ?? 10_000);
    const headers = await this.spec.authorize(http, { clientId: this.settings.clientId!, clientSecret: this.settings.clientSecret! });
    return { spec: this.spec, http, headers };
  }
}

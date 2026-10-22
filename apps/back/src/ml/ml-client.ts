import { Injectable } from "@nestjs/common";
import type { MlModelKey } from "@velora/contracts";
import { RuntimeConfigService } from "../common/config/runtime-config.service.js";

export class MlServiceUnavailableError extends Error {}

export type MlTrainOutcome = "ACCEPTED" | "BUSY";

/**
 * Cliente HTTP del servicio ML local (apps/ml, FastAPI en 127.0.0.1:8090) con token interno.
 * Las pruebas lo sustituyen por un doble (`app.get(MlClient)`), sin levantar Python.
 */
@Injectable()
export class MlClient {
  constructor(private readonly config: RuntimeConfigService) {}

  private url(path: string): string {
    return `${this.config.value.VELORA_ML_URL.replace(/\/$/, "")}${path}`;
  }

  async health(): Promise<{ available: boolean; busy: boolean }> {
    try {
      const response = await fetch(this.url("/health"), { signal: AbortSignal.timeout(1500) });
      if (!response.ok) return { available: false, busy: false };
      const body = await response.json() as { busy?: boolean };
      return { available: true, busy: Boolean(body.busy) };
    } catch {
      return { available: false, busy: false };
    }
  }

  async train(companyId: string, runs: Partial<Record<MlModelKey, string>>): Promise<MlTrainOutcome> {
    const token = this.config.value.VELORA_ML_TOKEN;
    if (!token) throw new MlServiceUnavailableError("VELORA_ML_TOKEN no está configurado en el backend.");
    let response: Response;
    try {
      response = await fetch(this.url("/train"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Velora-ML-Token": token },
        body: JSON.stringify({ companyId, runs }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new MlServiceUnavailableError("El servicio ML no responde.");
    }
    if (response.status === 202) return "ACCEPTED";
    if (response.status === 409) return "BUSY";
    throw new MlServiceUnavailableError(`El servicio ML respondió ${response.status}.`);
  }
}

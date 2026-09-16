import {
  Injectable,
} from "@nestjs/common";

import type {
  TryOnJobStatus,
  TryOnProvider,
} from "@velora/contracts";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import {
  RuntimeConfigService,
} from "../common/config/runtime-config.service.js";

import type {
  ManagedImageContentType,
} from "../common/media/image-validation.js";

export interface ProviderImage {
  bytes: Buffer;
  contentType:
    ManagedImageContentType;
  filename: string;
}

export interface ProviderJob {
  provider:
    TryOnProvider;
  externalJobId: string;
  status:
    TryOnJobStatus;
  resultUrl:
    string | null;
  errorMessage:
    string | null;
  durationMs:
    number | null;
}

export function normalizeProviderStatus(
  value: string,
): TryOnJobStatus {
  const normalized =
    value
      .trim()
      .toLowerCase();

  if (
    normalized === "starting" ||
    normalized === "queued" ||
    normalized === "pending"
  ) {
    return "QUEUED";
  }

  if (
    normalized === "processing" ||
    normalized === "running"
  ) {
    return "PROCESSING";
  }

  if (
    normalized === "succeeded" ||
    normalized === "success" ||
    normalized === "completed"
  ) {
    return "SUCCEEDED";
  }

  if (
    normalized === "cancelled" ||
    normalized === "canceled"
  ) {
    return "CANCELLED";
  }

  if (
    normalized === "failed" ||
    normalized === "error"
  ) {
    return "FAILED";
  }

  throw new ApiHttpError(
    502,
    `Estado de generación no reconocido: ${value}.`,
  );
}

@Injectable()
export class TryOnProviderService {
  constructor(
    private readonly config:
      RuntimeConfigService,
  ) {}

  configuredProvider():
    TryOnProvider {
    return this.config.value
      .VELORA_TRYON_PROVIDER;
  }

  async submit(
    provider:
      TryOnProvider,
    category: string,
    person:
      ProviderImage,
    garment:
      ProviderImage,
  ): Promise<ProviderJob> {
    if (
      provider === "LOCAL"
    ) {
      return this.submitLocal(
        category,
        person,
        garment,
      );
    }

    return this.submitReplicate(
      person,
      garment,
    );
  }

  async get(
    provider:
      TryOnProvider,
    externalJobId: string,
  ): Promise<ProviderJob> {
    if (
      provider === "LOCAL"
    ) {
      return this.localRequest(
        "GET",
        `/jobs/${encodeURIComponent(externalJobId)}`,
      );
    }

    return this.replicatePredictionRequest(
      "GET",
      externalJobId,
    );
  }

  async cancel(
    provider:
      TryOnProvider,
    externalJobId: string,
  ): Promise<ProviderJob> {
    if (
      provider === "LOCAL"
    ) {
      return this.localRequest(
        "DELETE",
        `/jobs/${encodeURIComponent(externalJobId)}`,
      );
    }

    return this.replicatePredictionRequest(
      "POST",
      externalJobId,
      "/cancel",
    );
  }

  private async submitLocal(
    category: string,
    person:
      ProviderImage,
    garment:
      ProviderImage,
  ): Promise<ProviderJob> {
    const baseUrl =
      this.config.value
        .VELORA_TRYON_LOCAL_URL
        ?.trim();
    const model =
      this.config.value
        .VELORA_TRYON_LOCAL_MODEL
        ?.trim();

    if (
      !baseUrl ||
      !model
    ) {
      throw new ApiHttpError(
        503,
        "El proveedor LOCAL no está configurado.",
      );
    }

    const form =
      new FormData();

    form.append(
      "category",
      category,
    );
    form.append(
      "model",
      model,
    );
    form.append(
      "person",
      this.toBlob(
        person,
      ),
      person.filename,
    );
    form.append(
      "garment",
      this.toBlob(
        garment,
      ),
      garment.filename,
    );

    const payload =
      await this.fetchJson(
        `${baseUrl.replace(/\/$/, "")}/jobs`,
        {
          method:
            "POST",
          body:
            form,
        },
        "El proveedor LOCAL no pudo crear la generación.",
      );

    return this.localPayload(
      payload,
    );
  }

  private async localRequest(
    method:
      "GET" | "DELETE",
    path: string,
  ): Promise<ProviderJob> {
    const baseUrl =
      this.config.value
        .VELORA_TRYON_LOCAL_URL
        ?.trim();

    if (
      !baseUrl
    ) {
      throw new ApiHttpError(
        503,
        "El proveedor LOCAL no está configurado.",
      );
    }

    const payload =
      await this.fetchJson(
        `${baseUrl.replace(/\/$/, "")}${path}`,
        {
          method,
        },
        "El proveedor LOCAL no pudo actualizar la generación.",
      );

    return this.localPayload(
      payload,
    );
  }

  private localPayload(
    payload: unknown,
  ): ProviderJob {
    const record =
      this.asRecord(
        payload,
      );

    const externalJobId =
      this.optionalText(
        record.jobId,
      ) ??
      this.optionalText(
        record.id,
      );

    if (
      !externalJobId
    ) {
      throw new ApiHttpError(
        502,
        "El proveedor LOCAL devolvió un job sin identificador.",
      );
    }

    return {
      provider:
        "LOCAL",
      externalJobId,
      status:
        normalizeProviderStatus(
          this.requireText(
            record.status,
            "El proveedor LOCAL devolvió un estado inválido.",
          ),
        ),
      resultUrl:
        this.optionalText(
          record.resultUrl,
        ) ??
        this.optionalText(
          record.result_url,
        ),
      errorMessage:
        this.optionalText(
          record.error,
        ),
      durationMs:
        this.optionalNonNegativeInteger(
          record.durationMs ??
          record.duration_ms,
        ),
    };
  }

  private async submitReplicate(
    person:
      ProviderImage,
    garment:
      ProviderImage,
  ): Promise<ProviderJob> {
    const token =
      this.config.value
        .REPLICATE_API_TOKEN
        ?.trim();

    if (
      !token
    ) {
      throw new ApiHttpError(
        503,
        "Replicate no está configurado.",
      );
    }

    const personUrl =
      await this.uploadReplicateFile(
        person,
      );
    const garmentUrl =
      await this.uploadReplicateFile(
        garment,
      );

    const model =
      this.config.value
        .VELORA_TRYON_REPLICATE_MODEL
        .trim();

    const parts =
      model
        .split("/")
        .filter(
          (part) =>
            part.length > 0,
        );

    if (
      parts.length !== 2
    ) {
      throw new ApiHttpError(
        500,
        "VELORA_TRYON_REPLICATE_MODEL debe usar owner/model.",
      );
    }

    const owner =
      parts[0] ?? "";
    const name =
      parts[1] ?? "";

    const payload =
      await this.fetchJson(
        `${this.replicateBase()}/models/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/predictions`,
        {
          method:
            "POST",
          headers: {
            "Authorization":
              `Bearer ${token}`,
            "Content-Type":
              "application/json",
          },
          body:
            JSON.stringify({
              input: {
                person_image:
                  personUrl,
                garment_images: [
                  garmentUrl,
                ],
                prompt:
                  "",
                output_format:
                  "jpg",
                output_quality:
                  95,
                preserve_input_size:
                  true,
              },
            }),
        },
        "Replicate no pudo crear la generación.",
      );

    return this.replicatePayload(
      payload,
    );
  }

  private async uploadReplicateFile(
    image:
      ProviderImage,
  ): Promise<string> {
    const token =
      this.config.value
        .REPLICATE_API_TOKEN
        ?.trim();

    if (
      !token
    ) {
      throw new ApiHttpError(
        503,
        "Replicate no está configurado.",
      );
    }

    const form =
      new FormData();

    form.append(
      "content",
      this.toBlob(
        image,
      ),
      image.filename,
    );

    const payload =
      await this.fetchJson(
        `${this.replicateBase()}/files`,
        {
          method:
            "POST",
          headers: {
            "Authorization":
              `Bearer ${token}`,
          },
          body:
            form,
        },
        "Replicate no pudo cargar una imagen de entrada.",
      );

    const record =
      this.asRecord(
        payload,
      );
    const urls =
      this.asRecord(
        record.urls,
      );
    const getUrl =
      this.optionalText(
        urls.get,
      );

    if (
      !getUrl
    ) {
      throw new ApiHttpError(
        502,
        "Replicate Files API no devolvió urls.get.",
      );
    }

    return getUrl;
  }

  private async replicatePredictionRequest(
    method:
      "GET" | "POST",
    externalJobId: string,
    suffix = "",
  ): Promise<ProviderJob> {
    const token =
      this.config.value
        .REPLICATE_API_TOKEN
        ?.trim();

    if (
      !token
    ) {
      throw new ApiHttpError(
        503,
        "Replicate no está configurado.",
      );
    }

    const payload =
      await this.fetchJson(
        `${this.replicateBase()}/predictions/${encodeURIComponent(externalJobId)}${suffix}`,
        {
          method,
          headers: {
            "Authorization":
              `Bearer ${token}`,
          },
        },
        "Replicate no pudo actualizar la generación.",
      );

    return this.replicatePayload(
      payload,
    );
  }

  private replicatePayload(
    payload: unknown,
  ): ProviderJob {
    const record =
      this.asRecord(
        payload,
      );

    const externalJobId =
      this.requireText(
        record.id,
        "Replicate devolvió un job sin identificador.",
      );

    const status =
      normalizeProviderStatus(
        this.requireText(
          record.status,
          "Replicate devolvió un estado inválido.",
        ),
      );

    return {
      provider:
        "REPLICATE",
      externalJobId,
      status,
      resultUrl:
        status ===
          "SUCCEEDED"
          ? this.outputUrl(
              record.output,
            )
          : null,
      errorMessage:
        this.optionalText(
          record.error,
        ),
      durationMs:
        this.durationMs(
          record.metrics,
        ),
    };
  }

  private outputUrl(
    value: unknown,
  ): string | null {
    if (
      typeof value === "string"
    ) {
      return value.trim() ||
        null;
    }

    if (
      Array.isArray(
        value,
      )
    ) {
      for (
        const item of value
      ) {
        const candidate =
          this.outputUrl(
            item,
          );

        if (
          candidate
        ) {
          return candidate;
        }
      }

      return null;
    }

    if (
      typeof value === "object" &&
      value !== null
    ) {
      return this.optionalText(
        (
          value as Record<
            string,
            unknown
          >
        ).url,
      );
    }

    return null;
  }

  private durationMs(
    value: unknown,
  ): number | null {
    const metrics =
      this.asRecord(
        value,
      );

    const seconds =
      metrics.predict_time ??
      metrics.total_time;

    if (
      typeof seconds !== "number" &&
      typeof seconds !== "string"
    ) {
      return null;
    }

    const parsed =
      Number(
        seconds,
      );

    if (
      !Number.isFinite(
        parsed,
      )
    ) {
      return null;
    }

    return Math.max(
      0,
      Math.round(
        parsed * 1000,
      ),
    );
  }

  private replicateBase():
    string {
    return this.config.value
      .VELORA_REPLICATE_BASE_URL
      .replace(
        /\/$/,
        "",
      );
  }

  private toBlob(
    image:
      ProviderImage,
  ): Blob {
    return new Blob(
      [
        Uint8Array.from(
          image.bytes,
        ),
      ],
      {
        type:
          image.contentType,
      },
    );
  }

  private async fetchJson(
    url: string,
    init:
      RequestInit,
    failureMessage: string,
  ): Promise<unknown> {
    let response:
      Response;

    try {
      response =
        await fetch(
          url,
          {
            ...init,
            signal:
              AbortSignal.timeout(
                this.config.value
                  .VELORA_TRYON_PROVIDER_TIMEOUT_SECONDS *
                1000,
              ),
          },
        );
    }
    catch {
      throw new ApiHttpError(
        503,
        failureMessage,
      );
    }

    if (
      !response.ok
    ) {
      throw new ApiHttpError(
        502,
        failureMessage,
      );
    }

    try {
      return await response
        .json();
    }
    catch {
      throw new ApiHttpError(
        502,
        "El proveedor devolvió una respuesta JSON inválida.",
      );
    }
  }

  private asRecord(
    value: unknown,
  ): Record<string, unknown> {
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(
        value,
      )
    ) {
      return value as Record<
        string,
        unknown
      >;
    }

    return {};
  }

  private requireText(
    value: unknown,
    message: string,
  ): string {
    const text =
      this.optionalText(
        value,
      );

    if (
      !text
    ) {
      throw new ApiHttpError(
        502,
        message,
      );
    }

    return text;
  }

  private optionalText(
    value: unknown,
  ): string | null {
    if (
      typeof value !== "string"
    ) {
      return null;
    }

    const text =
      value.trim();

    return text.length > 0
      ? text
      : null;
  }

  private optionalNonNegativeInteger(
    value: unknown,
  ): number | null {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return null;
    }

    const number =
      Number(
        value,
      );

    if (
      !Number.isFinite(
        number,
      )
    ) {
      return null;
    }

    return Math.max(
      0,
      Math.round(
        number,
      ),
    );
  }
}

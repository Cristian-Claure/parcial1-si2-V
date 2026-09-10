import {
  Injectable,
} from "@nestjs/common";

import {
  z,
} from "zod";

import type {
  TryOnJobResponse,
} from "@velora/contracts";

import type {
  AuthPrincipal,
} from "../auth/security.js";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import {
  MAX_TRY_ON_INPUT_BYTES,
  detectImageContentType,
  validateImageBuffer,
} from "../common/media/image-validation.js";

import {
  RuntimeConfigService,
} from "../common/config/runtime-config.service.js";

import {
  ManagedAssetStorageService,
  type LoadedManagedAsset,
} from "../storage/managed-asset-storage.service.js";

import {
  TryOnProviderService,
  type ProviderImage,
  type ProviderJob,
} from "./try-on-provider.service.js";

import {
  TryOnRepository,
  type TryOnJobMutation,
  type TryOnJobRecord,
} from "./try-on.repository.js";

export interface TryOnUploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

const createFieldsSchema =
  z.object({
    productId:
      z
        .string()
        .uuid(),
    variantId:
      z.preprocess(
        (value) =>
          value === undefined ||
          value === null ||
          value === ""
            ? undefined
            : value,
        z
          .string()
          .uuid()
          .optional(),
      ),
  });

const terminalStatuses =
  new Set([
    "SUCCEEDED",
    "FAILED",
    "CANCELLED",
  ]);

const GENERIC_PROVIDER_ERROR =
  "No se pudo completar el probador virtual.";

@Injectable()
export class TryOnService {
  constructor(
    private readonly repository:
      TryOnRepository,
    private readonly providers:
      TryOnProviderService,
    private readonly storage:
      ManagedAssetStorageService,
    private readonly config:
      RuntimeConfigService,
  ) {}

  async create(
    principal:
      AuthPrincipal,
    fields:
      Record<string, unknown>,
    file:
      TryOnUploadedFile | undefined,
  ): Promise<TryOnJobResponse> {
    await this.requireCustomer(
      principal.userId,
    );

    const parsed =
      createFieldsSchema
        .safeParse(
          fields,
        );

    if (
      !parsed.success
    ) {
      throw new ApiHttpError(
        400,
        parsed.error.issues[0]?.message ??
          "Solicitud de Try-On inválida.",
      );
    }

    const product =
      await this.repository
        .findProduct(
          parsed.data.productId,
        );

    if (
      !product ||
      product.status !==
        "ACTIVE"
    ) {
      throw new ApiHttpError(
        404,
        "Producto no encontrado.",
      );
    }

    if (
      !product.tryOnEnabled ||
      !product.tryOnCategory
    ) {
      throw new ApiHttpError(
        400,
        "El producto no está disponible para el probador virtual.",
      );
    }

    const variantId =
      parsed.data.variantId ??
      null;

    if (
      variantId
    ) {
      const variant =
        await this.repository
          .findVariant(
            product.id,
            variantId,
          );

      if (
        !variant
      ) {
        throw new ApiHttpError(
          400,
          "La variante no pertenece al producto indicado.",
        );
      }

      if (
        !variant.active
      ) {
        throw new ApiHttpError(
          400,
          "La variante seleccionada está inactiva.",
        );
      }
    }

    const garments =
      await this.repository
        .garments(
          product.id,
          variantId,
        );

    if (
      garments.length === 0
    ) {
      throw new ApiHttpError(
        400,
        "La variante seleccionada no tiene una prenda administrada para el probador virtual.",
      );
    }

    if (
      garments.length > 1
    ) {
      throw new ApiHttpError(
        409,
        variantId === null
          ? "Seleccione una variante para usar el probador virtual."
          : "La variante tiene más de una imagen TRY_ON_GARMENT administrada.",
      );
    }

    const garment =
      garments[0];

    if (
      !garment
    ) {
      throw new ApiHttpError(
        400,
        "No se encontró una prenda administrada.",
      );
    }

    if (
      !file ||
      !file.buffer ||
      file.size <= 0
    ) {
      throw new ApiHttpError(
        400,
        "Seleccione una foto para usar el probador virtual.",
      );
    }

    const maxInputBytes =
      Math.min(
        this.config.value
          .VELORA_TRYON_MAX_INPUT_BYTES,
        MAX_TRY_ON_INPUT_BYTES,
      );

    const person =
      validateImageBuffer(
        file.buffer,
        file.mimetype,
        "La foto",
        maxInputBytes,
      );

    const loadedGarment =
      await this.loadGarment(
        garment.storageKey,
        maxInputBytes,
      );

    const garmentImage:
      ProviderImage = {
        bytes:
          loadedGarment.bytes,
        contentType:
          detectImageContentType(
            loadedGarment.bytes,
            "La prenda del catálogo",
            400,
          ),
        filename:
          `garment.${garment.storageKey.split(".").pop() ?? "jpg"}`,
      };

    const provider =
      this.providers
        .configuredProvider();

    let job =
      await this.repository
        .createJob(
          principal.userId,
          product.id,
          variantId,
          garment.id,
          provider,
        );

    try {
      const external =
        await this.providers
          .submit(
            provider,
            product.tryOnCategory,
            {
              bytes:
                person.bytes,
              contentType:
                person.contentType,
              filename:
                `person.${person.contentType === "image/png" ? "png" : person.contentType === "image/webp" ? "webp" : "jpg"}`,
            },
            garmentImage,
          );

      job =
        await this.applyProviderJob(
          job,
          external,
        );

      return this.response(
        job,
      );
    }
    catch (error) {
      await this.markFailed(
        job,
      );

      if (
        error instanceof
        ApiHttpError
      ) {
        throw error;
      }

      throw new ApiHttpError(
        502,
        GENERIC_PROVIDER_ERROR,
      );
    }
  }

  async list(
    principal:
      AuthPrincipal,
  ): Promise<TryOnJobResponse[]> {
    await this.requireCustomer(
      principal.userId,
    );

    const jobs =
      await this.repository
        .listOwnedJobs(
          principal.userId,
        );

    return jobs.map(
      (job) =>
        this.response(
          job,
        ),
    );
  }

  async get(
    principal:
      AuthPrincipal,
    jobId: string,
  ): Promise<TryOnJobResponse> {
    await this.requireCustomer(
      principal.userId,
    );

    let job =
      await this.requireOwnedJob(
        principal.userId,
        jobId,
      );

    if (
      !terminalStatuses.has(
        job.status,
      ) &&
      job.externalJobId
    ) {
      const external =
        await this.providers
          .get(
            job.provider,
            job.externalJobId,
          );

      job =
        await this.applyProviderJob(
          job,
          external,
        );
    }

    return this.response(
      job,
    );
  }

  async cancel(
    principal:
      AuthPrincipal,
    jobId: string,
  ): Promise<TryOnJobResponse> {
    await this.requireCustomer(
      principal.userId,
    );

    let job =
      await this.requireOwnedJob(
        principal.userId,
        jobId,
      );

    if (
      terminalStatuses.has(
        job.status,
      )
    ) {
      return this.response(
        job,
      );
    }

    if (
      !job.externalJobId
    ) {
      job =
        await this.repository
          .save(
            job.id,
            {
              ...this.mutationFrom(
                job,
              ),
              status:
                "CANCELLED",
              errorMessage:
                null,
              completedAt:
                new Date(),
            },
          );

      return this.response(
        job,
      );
    }

    const external =
      await this.providers
        .cancel(
          job.provider,
          job.externalJobId,
        );

    job =
      await this.applyProviderJob(
        job,
        external,
      );

    return this.response(
      job,
    );
  }

  async result(
    principal:
      AuthPrincipal,
    jobId: string,
  ): Promise<LoadedManagedAsset> {
    await this.requireCustomer(
      principal.userId,
    );

    const job =
      await this.requireOwnedJob(
        principal.userId,
        jobId,
      );

    if (
      job.status !==
        "SUCCEEDED" ||
      !job.resultStorageKey
    ) {
      throw new ApiHttpError(
        409,
        "El resultado del probador virtual todavía no está disponible.",
      );
    }

    try {
      return await this.storage
        .load(
          job.resultStorageKey,
        );
    }
    catch {
      throw new ApiHttpError(
        500,
        "El resultado administrado no está disponible.",
      );
    }
  }

  private async requireCustomer(
    userId: string,
  ): Promise<void> {
    if (
      !(
        await this.repository
          .customerIsActive(
            userId,
          )
      )
    ) {
      throw new ApiHttpError(
        403,
        "El probador virtual está disponible únicamente para clientes activos.",
      );
    }
  }

  private async requireOwnedJob(
    userId: string,
    jobId: string,
  ): Promise<TryOnJobRecord> {
    const job =
      await this.repository
        .findOwnedJob(
          userId,
          jobId,
        );

    if (
      !job
    ) {
      throw new ApiHttpError(
        404,
        "Job del probador virtual no encontrado.",
      );
    }

    return job;
  }

  private async loadGarment(
    storageKey: string,
    maxBytes: number,
  ): Promise<LoadedManagedAsset> {
    let loaded:
      LoadedManagedAsset;

    try {
      loaded =
        await this.storage
          .load(
            storageKey,
          );
    }
    catch {
      throw new ApiHttpError(
        500,
        "No se pudo leer la prenda administrada del catálogo.",
      );
    }

    if (
      loaded.sizeBytes >
      maxBytes
    ) {
      throw new ApiHttpError(
        400,
        "La prenda administrada supera el límite del probador virtual.",
      );
    }

    detectImageContentType(
      loaded.bytes,
      "La prenda del catálogo",
      400,
    );

    return loaded;
  }

  private async applyProviderJob(
    job:
      TryOnJobRecord,
    external:
      ProviderJob,
  ): Promise<TryOnJobRecord> {
    if (
      external.provider !==
      job.provider
    ) {
      throw new ApiHttpError(
        502,
        "El proveedor devolvió una identidad distinta a la solicitada.",
      );
    }

    if (
      job.externalJobId &&
      job.externalJobId !==
        external.externalJobId
    ) {
      throw new ApiHttpError(
        502,
        "El proveedor devolvió un identificador de job inconsistente.",
      );
    }

    if (
      external.status ===
        "SUCCEEDED"
    ) {
      return this.persistSuccessfulResult(
        job,
        external,
      );
    }

    const completedAt =
      external.status ===
        "FAILED" ||
      external.status ===
        "CANCELLED"
        ? new Date()
        : job.completedAt;

    return this.repository
      .save(
        job.id,
        {
          ...this.mutationFrom(
            job,
          ),
          externalJobId:
            external.externalJobId,
          status:
            external.status,
          errorMessage:
            external.status ===
              "FAILED"
              ? GENERIC_PROVIDER_ERROR
              : null,
          durationMs:
            external.durationMs ??
            job.durationMs,
          completedAt,
        },
      );
  }

  private async persistSuccessfulResult(
    job:
      TryOnJobRecord,
    external:
      ProviderJob,
  ): Promise<TryOnJobRecord> {
    if (
      job.resultStorageKey
    ) {
      return this.repository
        .save(
          job.id,
          {
            ...this.mutationFrom(
              job,
            ),
            externalJobId:
              external.externalJobId,
            status:
              "SUCCEEDED",
            errorMessage:
              null,
            durationMs:
              external.durationMs ??
              job.durationMs,
            completedAt:
              job.completedAt ??
              new Date(),
          },
        );
    }

    if (
      !external.resultUrl
    ) {
      throw new ApiHttpError(
        502,
        "El proveedor finalizó sin entregar una imagen de resultado.",
      );
    }

    const result =
      await this.downloadResult(
        external.resultUrl,
      );

    const contentType =
      detectImageContentType(
        result,
        "El resultado del proveedor",
        502,
      );

    const stored =
      await this.storage
        .store(
          result,
          contentType,
        );

    try {
      return await this.repository
        .save(
          job.id,
          {
            externalJobId:
              external.externalJobId,
            status:
              "SUCCEEDED",
            resultStorageKey:
              stored.storageKey,
            resultContentType:
              stored.contentType,
            resultSizeBytes:
              stored.sizeBytes,
            errorMessage:
              null,
            durationMs:
              external.durationMs ??
              job.durationMs,
            completedAt:
              new Date(),
          },
        );
    }
    catch (error) {
      await this.storage
        .delete(
          stored.storageKey,
        )
        .catch(
          () => undefined,
        );

      throw error;
    }
  }

  private async downloadResult(
    resultUrl: string,
  ): Promise<Buffer> {
    let url:
      URL;

    try {
      url =
        new URL(
          resultUrl,
        );
    }
    catch {
      throw new ApiHttpError(
        502,
        "El proveedor devolvió una URL de resultado inválida.",
      );
    }

    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:"
    ) {
      throw new ApiHttpError(
        502,
        "El proveedor devolvió una URL de resultado no soportada.",
      );
    }

    let response:
      Response;

    try {
      response =
        await fetch(
          url,
          {
            signal:
              AbortSignal.timeout(
                60_000,
              ),
          },
        );
    }
    catch {
      throw new ApiHttpError(
        502,
        "No se pudo descargar el resultado del proveedor.",
      );
    }

    if (
      !response.ok
    ) {
      throw new ApiHttpError(
        502,
        "No se pudo descargar el resultado del proveedor.",
      );
    }

    const maxBytes =
      this.config.value
        .VELORA_TRYON_RESULT_MAX_BYTES;

    const contentLength =
      Number(
        response.headers
          .get(
            "content-length",
          ) ?? "0",
      );

    if (
      Number.isFinite(
        contentLength,
      ) &&
      contentLength >
        maxBytes
    ) {
      throw new ApiHttpError(
        502,
        "El resultado del proveedor supera el límite permitido.",
      );
    }

    if (
      !response.body
    ) {
      throw new ApiHttpError(
        502,
        "El proveedor devolvió un resultado vacío.",
      );
    }

    const reader =
      response.body
        .getReader();
    const chunks:
      Buffer[] = [];
    let total =
      0;

    while (
      true
    ) {
      const {
        done,
        value,
      } =
        await reader
          .read();

      if (
        done
      ) {
        break;
      }

      if (
        !value
      ) {
        continue;
      }

      total +=
        value.byteLength;

      if (
        total >
        maxBytes
      ) {
        await reader
          .cancel();

        throw new ApiHttpError(
          502,
          "El resultado del proveedor supera el límite permitido.",
        );
      }

      chunks.push(
        Buffer.from(
          value,
        ),
      );
    }

    const bytes =
      Buffer.concat(
        chunks,
      );

    if (
      bytes.length === 0
    ) {
      throw new ApiHttpError(
        502,
        "El proveedor devolvió un resultado vacío.",
      );
    }

    return bytes;
  }

  private async markFailed(
    job:
      TryOnJobRecord,
  ): Promise<void> {
    await this.repository
      .save(
        job.id,
        {
          ...this.mutationFrom(
            job,
          ),
          status:
            "FAILED",
          errorMessage:
            GENERIC_PROVIDER_ERROR,
          completedAt:
            new Date(),
        },
      )
      .then(
        () => undefined,
      )
      .catch(
        () => undefined,
      );
  }

  private mutationFrom(
    job:
      TryOnJobRecord,
  ): TryOnJobMutation {
    return {
      externalJobId:
        job.externalJobId,
      status:
        job.status,
      resultStorageKey:
        job.resultStorageKey,
      resultContentType:
        job.resultContentType,
      resultSizeBytes:
        job.resultSizeBytes,
      errorMessage:
        job.errorMessage,
      durationMs:
        job.durationMs,
      completedAt:
        job.completedAt,
    };
  }

  private response(
    job:
      TryOnJobRecord,
  ): TryOnJobResponse {
    return {
      id:
        job.id,
      productId:
        job.productId,
      variantId:
        job.variantId,
      provider:
        job.provider,
      status:
        job.status,
      resultUrl:
        job.resultStorageKey
          ? `/api/customer/try-on/jobs/${job.id}/result`
          : null,
      errorMessage:
        job.errorMessage,
      durationMs:
        job.durationMs,
      createdAt:
        job.createdAt
          .toISOString(),
      updatedAt:
        job.updatedAt
          .toISOString(),
      completedAt:
        job.completedAt
          ?.toISOString() ??
        null,
    };
  }
}

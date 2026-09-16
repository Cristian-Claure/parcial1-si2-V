import {
  Injectable,
} from "@nestjs/common";

import {
  z,
} from "zod";

import type {
  ImageResponse,
} from "@velora/contracts";

import type {
  AuthPrincipal,
} from "../auth/security.js";

import {
  AccessContextService,
} from "../common/authz/access-context.service.js";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import {
  MAX_TRY_ON_INPUT_BYTES,
  validateImageBuffer,
} from "../common/media/image-validation.js";


import {
  ManagedAssetStorageService,
  type LoadedManagedAsset,
} from "../storage/managed-asset-storage.service.js";

import {
  CatalogAssetsRepository,
} from "./catalog-assets.repository.js";

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

const managedAssetFieldsSchema =
  z.object({
    variantId:
      z.preprocess(
        (value) =>
          value === "" ||
          value === null
            ? undefined
            : value,
        z
          .string()
          .uuid()
          .optional(),
      ),
    altText:
      z.preprocess(
        (value) =>
          value === "" ||
          value === null
            ? undefined
            : value,
        z
          .string()
          .trim()
          .max(250)
          .optional(),
      ),
    purpose:
      z.preprocess(
        (value) =>
          typeof value === "string" &&
          value.trim() !== ""
            ? value.trim().toUpperCase()
            : "GALLERY",
        z.enum([
          "GALLERY",
          "TRY_ON_GARMENT",
        ]),
      ),
    sortOrder:
      z.preprocess(
        (value) =>
          value === undefined ||
          value === null ||
          value === ""
            ? 0
            : Number(value),
        z
          .number()
          .int()
          .nonnegative(),
      ),
    primary:
      z.preprocess(
        (value) => {
          if (
            value === true ||
            value === "true" ||
            value === "on" ||
            value === "1"
          ) {
            return true;
          }

          return false;
        },
        z.boolean(),
      ),
  });

@Injectable()
export class CatalogAssetsService {
  constructor(
    private readonly repository:
      CatalogAssetsRepository,
    private readonly storage:
      ManagedAssetStorageService,
    private readonly access:
      AccessContextService,

  ) {}

  async upload(
    principal:
      AuthPrincipal,
    productId: string,
    fields:
      Record<string, unknown>,
    file:
      UploadedImageFile | undefined,
  ): Promise<ImageResponse> {
    const actor =
      await this.access
        .resolve(
          principal,
        );

    if (
      actor.role !== "ADMIN" &&
      actor.role !== "STORE_MANAGER"
    ) {
      throw new ApiHttpError(
        403,
        "No tiene permisos para administrar assets del catÃ¡logo.",
      );
    }

    const product =
      await this.repository
        .findProduct(
          productId,
        );

    if (
      !product
    ) {
      throw new ApiHttpError(
        404,
        "Producto no encontrado.",
      );
    }

    if (
      actor.role === "STORE_MANAGER" &&
      actor.companyId !== product.companyId
    ) {
      throw new ApiHttpError(
        403,
        "No tiene permisos para administrar esta compaÃ±Ã­a.",
      );
    }

    const parsed =
      managedAssetFieldsSchema
        .safeParse(
          fields,
        );

    if (
      !parsed.success
    ) {
      throw new ApiHttpError(
        400,
        parsed.error.issues[0]?.message ??
          "Metadata de asset invÃ¡lida.",
      );
    }

    const metadata =
      parsed.data;

    if (
      metadata.variantId
    ) {
      const variant =
        await this.repository
          .findVariant(
            metadata.variantId,
          );

      if (
        !variant ||
        variant.productId !== productId
      ) {
        throw new ApiHttpError(
          400,
          "La variante no pertenece al producto indicado.",
        );
      }
    }

    if (
      !file ||
      !file.buffer ||
      file.size <= 0
    ) {
      throw new ApiHttpError(
        400,
        "Seleccione una imagen para el catÃ¡logo.",
      );
    }

    const image =
      validateImageBuffer(
        file.buffer,
        file.mimetype,
        "La imagen",
        MAX_TRY_ON_INPUT_BYTES,
      );

    if (
      metadata.purpose ===
        "TRY_ON_GARMENT" &&
      await this.repository
        .managedGarmentExists(
          productId,
          metadata.variantId ?? null,
        )
    ) {
      throw new ApiHttpError(
        409,
        "Ya existe una prenda TRY_ON_GARMENT administrada para esta selecciÃ³n.",
      );
    }

    const stored =
      await this.storage
        .store(
          image.bytes,
          image.contentType,
        );

    try {
      return await this.repository
        .createManagedImage(
          productId,
          metadata.variantId ?? null,
          `/api/catalog/assets/${stored.storageKey}`,
          metadata.altText ?? null,
          metadata.purpose,
          metadata.sortOrder,
          metadata.primary,
          stored.storageKey,
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

  async publicAsset(
    storageKey: string,
  ): Promise<LoadedManagedAsset> {
    if (
      !(
        await this.repository
          .storageKeyExists(
            storageKey,
          )
      )
    ) {
      throw new ApiHttpError(
        404,
        "Asset no encontrado.",
      );
    }

    try {
      return await this.storage
        .load(
          storageKey,
        );
    }
    catch {
      throw new ApiHttpError(
        404,
        "Asset no encontrado.",
      );
    }
  }
}


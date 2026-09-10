import {
  Injectable,
} from "@nestjs/common";

import {
  randomUUID,
} from "node:crypto";

import {
  and,
  eq,
  isNotNull,
  isNull,
} from "drizzle-orm";

import type {
  ImageResponse,
  ProductImagePurpose,
} from "@velora/contracts";

import {
  productImages,
  products,
  productVariants,
} from "@velora/database";

import {
  DatabaseService,
} from "../database/database.service.js";

export interface CatalogAssetProductRecord {
  id: string;
  companyId: string;
  status:
    | "DRAFT"
    | "ACTIVE"
    | "INACTIVE";
}

export interface CatalogAssetVariantRecord {
  id: string;
  productId: string;
  active: boolean;
}

@Injectable()
export class CatalogAssetsRepository {
  constructor(
    private readonly database:
      DatabaseService,
  ) {}

  async findProduct(
    productId: string,
  ): Promise<CatalogAssetProductRecord | null> {
    const rows =
      await this.database.db
        .select({
          id:
            products.id,
          companyId:
            products.companyId,
          status:
            products.status,
        })
        .from(
          products,
        )
        .where(
          eq(
            products.id,
            productId,
          ),
        )
        .limit(1);

    return rows[0] ?? null;
  }

  async findVariant(
    variantId: string,
  ): Promise<CatalogAssetVariantRecord | null> {
    const rows =
      await this.database.db
        .select({
          id:
            productVariants.id,
          productId:
            productVariants.productId,
          active:
            productVariants.active,
        })
        .from(
          productVariants,
        )
        .where(
          eq(
            productVariants.id,
            variantId,
          ),
        )
        .limit(1);

    return rows[0] ?? null;
  }

  async storageKeyExists(
    storageKey: string,
  ): Promise<boolean> {
    const rows =
      await this.database.db
        .select({
          id:
            productImages.id,
        })
        .from(
          productImages,
        )
        .where(
          eq(
            productImages.storageKey,
            storageKey,
          ),
        )
        .limit(1);

    return rows.length > 0;
  }

  async createManagedImage(
    productId: string,
    variantId:
      string | null,
    imageUrl: string,
    altText:
      string | null,
    purpose:
      ProductImagePurpose,
    sortOrder: number,
    primary: boolean,
    storageKey: string,
  ): Promise<ImageResponse> {
    return this.database.db
      .transaction(
        async (tx) => {
          if (
            primary
          ) {
            await tx
              .update(
                productImages,
              )
              .set({
                isPrimary:
                  false,
              })
              .where(
                eq(
                  productImages.productId,
                  productId,
                ),
              );
          }

          const rows =
            await tx
              .insert(
                productImages,
              )
              .values({
                id:
                  randomUUID(),
                productId,
                variantId,
                imageUrl,
                altText,
                purpose,
                sortOrder,
                isPrimary:
                  primary,
                storageKey,
                createdAt:
                  new Date(),
              })
              .returning({
                id:
                  productImages.id,
                variantId:
                  productImages.variantId,
                imageUrl:
                  productImages.imageUrl,
                altText:
                  productImages.altText,
                purpose:
                  productImages.purpose,
                sortOrder:
                  productImages.sortOrder,
                primary:
                  productImages.isPrimary,
              });

          const row =
            rows[0];

          if (
            !row
          ) {
            throw new Error(
              "No se pudo registrar el asset administrado.",
            );
          }

          return row;
        },
      );
  }

  async managedGarmentExists(
    productId: string,
    variantId:
      string | null,
  ): Promise<boolean> {
    const variantCondition =
      variantId === null
        ? isNull(
            productImages.variantId,
          )
        : eq(
            productImages.variantId,
            variantId,
          );

    const rows =
      await this.database.db
        .select({
          id:
            productImages.id,
        })
        .from(
          productImages,
        )
        .where(
          and(
            eq(
              productImages.productId,
              productId,
            ),
            eq(
              productImages.purpose,
              "TRY_ON_GARMENT",
            ),
            isNotNull(
              productImages.storageKey,
            ),
            variantCondition,
          ),
        )
        .limit(1);

    return rows.length > 0;
  }
}

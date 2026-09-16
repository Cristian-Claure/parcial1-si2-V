import {
  randomUUID,
} from "node:crypto";

import {
  Injectable,
} from "@nestjs/common";

import {
  and,
  asc,
  eq,
  sql,
} from "drizzle-orm";

import type {
  CategoryRequest,
  ImageRequest,
  ProductRequest,
  VariantRequest,
} from "@velora/contracts";

import {
  categories,
  companies,
  productImages,
  products,
  productVariants,
  type DatabaseProductImagePurpose,
  type DatabaseProductStatus,
  type DatabaseTryOnCategory,
} from "@velora/database";

import {
  DatabaseService,
} from "../database/database.service.js";

export interface CategoryRecord {
  id:
    string;

  companyId:
    string;

  parentId:
    string |
    null;

  name:
    string;

  slug:
    string;

  description:
    string |
    null;

  active:
    boolean;
}

export interface ProductRecord {
  id:
    string;

  companyId:
    string;

  categoryId:
    string;

  categoryName:
    string;

  name:
    string;

  slug:
    string;

  description:
    string |
    null;

  brand:
    string;

  composition:
    string |
    null;

  careInstructions:
    string |
    null;

  fitNotes:
    string |
    null;

  status:
    DatabaseProductStatus;

  tryOnEnabled:
    boolean;

  tryOnCategory:
    DatabaseTryOnCategory |
    null;
}

export interface VariantRecord {
  id:
    string;

  productId:
    string;

  companyId:
    string;

  sku:
    string;

  barcode:
    string |
    null;

  size:
    string;

  color:
    string;

  colorHex:
    string |
    null;

  price:
    string;

  compareAtPrice:
    string |
    null;

  currency:
    string;

  active:
    boolean;
}

export interface ImageRecord {
  id:
    string;

  productId:
    string;

  variantId:
    string |
    null;

  imageUrl:
    string;

  altText:
    string |
    null;

  purpose:
    DatabaseProductImagePurpose;

  storageKey:
    string |
    null;

  sortOrder:
    number;

  primary:
    boolean;
}

const categorySelection = {
  id:
    categories.id,

  companyId:
    categories.companyId,

  parentId:
    categories.parentId,

  name:
    categories.name,

  slug:
    categories.slug,

  description:
    categories.description,

  active:
    categories.active,
} as const;

const productSelection = {
  id:
    products.id,

  companyId:
    products.companyId,

  categoryId:
    products.categoryId,

  categoryName:
    categories.name,

  name:
    products.name,

  slug:
    products.slug,

  description:
    products.description,

  brand:
    products.brand,

  composition:
    products.composition,

  careInstructions:
    products.careInstructions,

  fitNotes:
    products.fitNotes,

  status:
    products.status,

  tryOnEnabled:
    products.tryOnEnabled,

  tryOnCategory:
    products.tryOnCategory,
} as const;

const imageSelection = {
  id:
    productImages.id,

  productId:
    productImages.productId,

  variantId:
    productImages.variantId,

  imageUrl:
    productImages.imageUrl,

  altText:
    productImages.altText,

  purpose:
    productImages.purpose,

  storageKey:
    productImages.storageKey,

  sortOrder:
    productImages.sortOrder,

  primary:
    productImages.isPrimary,
} as const;

@Injectable()
export class CatalogRepository {
  constructor(
    private readonly database:
      DatabaseService,
  ) {}

  async companyIsActive(
    companyId: string,
  ): Promise<boolean> {
    const rows =
      await this.database.db
        .select({
          id:
            companies.id,
        })
        .from(
          companies,
        )
        .where(
          and(
            eq(
              companies.id,
              companyId,
            ),
            eq(
              companies.active,
              true,
            ),
          ),
        )
        .limit(1);

    return rows.length > 0;
  }

  async allActiveCompanyIds():
    Promise<string[]> {
    const rows =
      await this.database.db
        .select({
          id:
            companies.id,
        })
        .from(
          companies,
        )
        .where(
          eq(
            companies.active,
            true,
          ),
        );

    return rows.map(
      (row) =>
        row.id,
    );
  }

  async listCategories(
    companyId: string,
    publicOnly: boolean,
  ): Promise<CategoryRecord[]> {
    const condition =
      publicOnly
        ? and(
            eq(
              categories.companyId,
              companyId,
            ),
            eq(
              categories.active,
              true,
            ),
          )
        : eq(
            categories.companyId,
            companyId,
          );

    return this.database.db
      .select(
        categorySelection,
      )
      .from(
        categories,
      )
      .where(
        condition,
      )
      .orderBy(
        asc(
          categories.name,
        ),
      );
  }

  async findCategory(
    companyId: string,
    id: string,
  ): Promise<CategoryRecord | null> {
    const rows =
      await this.database.db
        .select(
          categorySelection,
        )
        .from(
          categories,
        )
        .where(
          and(
            eq(
              categories.companyId,
              companyId,
            ),
            eq(
              categories.id,
              id,
            ),
          ),
        )
        .limit(1);

    return rows[0] ?? null;
  }

  async categorySlugExists(
    companyId: string,
    slug: string,
    excludedId:
      string |
      null = null,
  ): Promise<boolean> {
    const normalized =
      slug
        .trim()
        .toLowerCase();

    const slugCondition =
      sql<boolean>`
        lower(${categories.slug})
        =
        ${normalized}
      `;

    const condition =
      excludedId === null
        ? and(
            eq(
              categories.companyId,
              companyId,
            ),
            slugCondition,
          )
        : and(
            eq(
              categories.companyId,
              companyId,
            ),
            slugCondition,
            sql<boolean>`
              ${categories.id}
              <>
              ${excludedId}::uuid
            `,
          );

    const rows =
      await this.database.db
        .select({
          id:
            categories.id,
        })
        .from(
          categories,
        )
        .where(
          condition,
        )
        .limit(1);

    return rows.length > 0;
  }

  async createCategory(
    request:
      CategoryRequest,
    normalizedSlug: string,
  ): Promise<CategoryRecord> {
    const now =
      new Date();

    const rows =
      await this.database.db
        .insert(
          categories,
        )
        .values({
          id:
            randomUUID(),

          companyId:
            request.companyId,

          parentId:
            request.parentId ??
            null,

          name:
            request.name.trim(),

          slug:
            normalizedSlug,

          description:
            this.trimToNull(
              request.description,
            ),

          active:
            request.active ??
            true,

          createdAt:
            now,

          updatedAt:
            now,
        })
        .returning(
          categorySelection,
        );

    const created =
      rows[0];

    if (!created) {
      throw new Error(
        "No se pudo crear la categoría.",
      );
    }

    return created;
  }

  async updateCategory(
    id: string,
    request:
      CategoryRequest,
    normalizedSlug: string,
  ): Promise<CategoryRecord> {
    const rows =
      await this.database.db
        .update(
          categories,
        )
        .set({
          parentId:
            request.parentId ??
            null,

          name:
            request.name.trim(),

          slug:
            normalizedSlug,

          description:
            this.trimToNull(
              request.description,
            ),

          active:
            request.active ??
            undefined,

          updatedAt:
            new Date(),
        })
        .where(
          and(
            eq(
              categories.companyId,
              request.companyId,
            ),
            eq(
              categories.id,
              id,
            ),
          ),
        )
        .returning(
          categorySelection,
        );

    const updated =
      rows[0];

    if (!updated) {
      throw new Error(
        "No se pudo actualizar la categoría.",
      );
    }

    return updated;
  }

  async listProducts(
    companyId: string,
    publicOnly: boolean,
  ): Promise<ProductRecord[]> {
    const condition =
      publicOnly
        ? and(
            eq(
              products.companyId,
              companyId,
            ),
            eq(
              products.status,
              "ACTIVE",
            ),
          )
        : eq(
            products.companyId,
            companyId,
          );

    return this.database.db
      .select(
        productSelection,
      )
      .from(
        products,
      )
      .innerJoin(
        categories,
        and(
          eq(
            products.companyId,
            categories.companyId,
          ),
          eq(
            products.categoryId,
            categories.id,
          ),
        ),
      )
      .where(
        condition,
      )
      .orderBy(
        asc(
          products.name,
        ),
      );
  }

  async findProduct(
    companyId: string,
    id: string,
  ): Promise<ProductRecord | null> {
    const rows =
      await this.database.db
        .select(
          productSelection,
        )
        .from(
          products,
        )
        .innerJoin(
          categories,
          and(
            eq(
              products.companyId,
              categories.companyId,
            ),
            eq(
              products.categoryId,
              categories.id,
            ),
          ),
        )
        .where(
          and(
            eq(
              products.companyId,
              companyId,
            ),
            eq(
              products.id,
              id,
            ),
          ),
        )
        .limit(1);

    return rows[0] ?? null;
  }

  async productSlugExists(
    companyId: string,
    slug: string,
    excludedId:
      string |
      null = null,
  ): Promise<boolean> {
    const normalized =
      slug
        .trim()
        .toLowerCase();

    const slugCondition =
      sql<boolean>`
        lower(${products.slug})
        =
        ${normalized}
      `;

    const condition =
      excludedId === null
        ? and(
            eq(
              products.companyId,
              companyId,
            ),
            slugCondition,
          )
        : and(
            eq(
              products.companyId,
              companyId,
            ),
            slugCondition,
            sql<boolean>`
              ${products.id}
              <>
              ${excludedId}::uuid
            `,
          );

    const rows =
      await this.database.db
        .select({
          id:
            products.id,
        })
        .from(
          products,
        )
        .where(
          condition,
        )
        .limit(1);

    return rows.length > 0;
  }

  async createProduct(
    request:
      ProductRequest,
    normalizedSlug: string,
    actorId: string,
  ): Promise<ProductRecord> {
    const now =
      new Date();

    const rows =
      await this.database.db
        .insert(
          products,
        )
        .values({
          id:
            randomUUID(),

          companyId:
            request.companyId,

          categoryId:
            request.categoryId,

          name:
            request.name.trim(),

          slug:
            normalizedSlug,

          description:
            this.trimToNull(
              request.description,
            ),

          brand:
            this.trimToNull(
              request.brand,
            ) ??
            "VÉLORA",

          composition:
            this.trimToNull(
              request.composition,
            ),

          careInstructions:
            this.trimToNull(
              request.careInstructions,
            ),

          fitNotes:
            this.trimToNull(
              request.fitNotes,
            ),

          status:
            request.status ??
            "ACTIVE",

          createdBy:
            actorId,

          updatedBy:
            actorId,

          tryOnEnabled:
            request.tryOnEnabled ??
            false,

          tryOnCategory:
            request.tryOnEnabled ===
              true
              ? request.tryOnCategory ??
                null
              : null,

          createdAt:
            now,

          updatedAt:
            now,
        })
        .returning({
          id:
            products.id,
        });

    const created =
      rows[0];

    if (!created) {
      throw new Error(
        "No se pudo crear el producto.",
      );
    }

    const product =
      await this.findProduct(
        request.companyId,
        created.id,
      );

    if (!product) {
      throw new Error(
        "No se pudo recuperar el producto creado.",
      );
    }

    return product;
  }

  async updateProduct(
    id: string,
    request:
      ProductRequest,
    normalizedSlug: string,
    actorId: string,
    tryOnEnabled: boolean,
    tryOnCategory:
      DatabaseTryOnCategory |
      null,
  ): Promise<ProductRecord> {
    const rows =
      await this.database.db
        .update(
          products,
        )
        .set({
          categoryId:
            request.categoryId,

          name:
            request.name.trim(),

          slug:
            normalizedSlug,

          description:
            this.trimToNull(
              request.description,
            ),

          brand:
            this.trimToNull(
              request.brand,
            ) ??
            "VÉLORA",

          composition:
            this.trimToNull(
              request.composition,
            ),

          careInstructions:
            this.trimToNull(
              request.careInstructions,
            ),

          fitNotes:
            this.trimToNull(
              request.fitNotes,
            ),

          status:
            request.status ??
            undefined,

          updatedBy:
            actorId,

          tryOnEnabled,

          tryOnCategory,

          updatedAt:
            new Date(),
        })
        .where(
          and(
            eq(
              products.companyId,
              request.companyId,
            ),
            eq(
              products.id,
              id,
            ),
          ),
        )
        .returning({
          id:
            products.id,
        });

    if (!rows[0]) {
      throw new Error(
        "No se pudo actualizar el producto.",
      );
    }

    const product =
      await this.findProduct(
        request.companyId,
        id,
      );

    if (!product) {
      throw new Error(
        "No se pudo recuperar el producto actualizado.",
      );
    }

    return product;
  }

  async listVariants(
    productId: string,
    publicOnly: boolean,
  ): Promise<VariantRecord[]> {
    const condition =
      publicOnly
        ? and(
            eq(
              productVariants.productId,
              productId,
            ),
            eq(
              productVariants.active,
              true,
            ),
          )
        : eq(
            productVariants.productId,
            productId,
          );

    return this.database.db
      .select({
        id:
          productVariants.id,

        productId:
          productVariants.productId,

        companyId:
          products.companyId,

        sku:
          productVariants.sku,

        barcode:
          productVariants.barcode,

        size:
          productVariants.size,

        color:
          productVariants.color,

        colorHex:
          productVariants.colorHex,

        price:
          productVariants.price,

        compareAtPrice:
          productVariants.compareAtPrice,

        currency:
          productVariants.currency,

        active:
          productVariants.active,
      })
      .from(
        productVariants,
      )
      .innerJoin(
        products,
        eq(
          productVariants.productId,
          products.id,
        ),
      )
      .where(
        condition,
      )
      .orderBy(
        asc(
          productVariants.color,
        ),
        asc(
          productVariants.size,
        ),
      );
  }

  async findVariant(
    id: string,
  ): Promise<VariantRecord | null> {
    const rows =
      await this.database.db
        .select({
          id:
            productVariants.id,

          productId:
            productVariants.productId,

          companyId:
            products.companyId,

          sku:
            productVariants.sku,

          barcode:
            productVariants.barcode,

          size:
            productVariants.size,

          color:
            productVariants.color,

          colorHex:
            productVariants.colorHex,

          price:
            productVariants.price,

          compareAtPrice:
            productVariants.compareAtPrice,

          currency:
            productVariants.currency,

          active:
            productVariants.active,
        })
        .from(
          productVariants,
        )
        .innerJoin(
          products,
          eq(
            productVariants.productId,
            products.id,
          ),
        )
        .where(
          eq(
            productVariants.id,
            id,
          ),
        )
        .limit(1);

    return rows[0] ?? null;
  }

  async skuExists(
    sku: string,
    excludedId:
      string |
      null = null,
  ): Promise<boolean> {
    const normalized =
      sku
        .trim()
        .toUpperCase();

    const skuCondition =
      sql<boolean>`
        upper(${productVariants.sku})
        =
        ${normalized}
      `;

    const condition =
      excludedId === null
        ? skuCondition
        : and(
            skuCondition,
            sql<boolean>`
              ${productVariants.id}
              <>
              ${excludedId}::uuid
            `,
          );

    const rows =
      await this.database.db
        .select({
          id:
            productVariants.id,
        })
        .from(
          productVariants,
        )
        .where(
          condition,
        )
        .limit(1);

    return rows.length > 0;
  }

  async createVariant(
    productId: string,
    request:
      VariantRequest,
  ): Promise<VariantRecord> {
    const rows =
      await this.database.db
        .insert(
          productVariants,
        )
        .values({
          id:
            randomUUID(),

          productId,

          sku:
            request.sku
              .trim()
              .toUpperCase(),

          barcode:
            this.trimToNull(
              request.barcode,
            ),

          size:
            request.size.trim(),

          color:
            request.color.trim(),

          colorHex:
            this.trimToNull(
              request.colorHex,
            ),

          price:
            request.price.toFixed(2),

          compareAtPrice:
            request.compareAtPrice ===
              undefined ||
            request.compareAtPrice ===
              null
              ? null
              : request.compareAtPrice
                  .toFixed(2),

          currency:
            this.trimToNull(
              request.currency,
            ) ??
            "BOB",

          active:
            request.active ??
            true,

          createdAt:
            new Date(),

          updatedAt:
            new Date(),
        })
        .returning({
          id:
            productVariants.id,
        });

    const id =
      rows[0]?.id;

    if (!id) {
      throw new Error(
        "No se pudo crear la variante.",
      );
    }

    const created =
      await this.findVariant(
        id,
      );

    if (!created) {
      throw new Error(
        "No se pudo recuperar la variante creada.",
      );
    }

    return created;
  }

  async updateVariant(
    id: string,
    request:
      VariantRequest,
  ): Promise<VariantRecord> {
    await this.database.db
      .update(
        productVariants,
      )
      .set({
        sku:
          request.sku
            .trim()
            .toUpperCase(),

        barcode:
          this.trimToNull(
            request.barcode,
          ),

        size:
          request.size.trim(),

        color:
          request.color.trim(),

        colorHex:
          this.trimToNull(
            request.colorHex,
          ),

        price:
          request.price.toFixed(2),

        compareAtPrice:
          request.compareAtPrice ===
            undefined ||
          request.compareAtPrice ===
            null
            ? null
            : request.compareAtPrice
                .toFixed(2),

        currency:
          this.trimToNull(
            request.currency,
          ) ??
          "BOB",

        active:
          request.active ??
          undefined,

        updatedAt:
          new Date(),
      })
      .where(
        eq(
          productVariants.id,
          id,
        ),
      );

    const updated =
      await this.findVariant(
        id,
      );

    if (!updated) {
      throw new Error(
        "No se pudo recuperar la variante actualizada.",
      );
    }

    return updated;
  }

  async listImages(
    productId: string,
  ): Promise<ImageRecord[]> {
    return this.database.db
      .select(
        imageSelection,
      )
      .from(
        productImages,
      )
      .where(
        eq(
          productImages.productId,
          productId,
        ),
      )
      .orderBy(
        asc(
          productImages.sortOrder,
        ),
      );
  }

  async clearPrimaryImages(
    productId: string,
  ): Promise<void> {
    await this.database.db
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

  async createImage(
    productId: string,
    request:
      ImageRequest,
  ): Promise<ImageRecord> {
    const rows =
      await this.database.db
        .insert(
          productImages,
        )
        .values({
          id:
            randomUUID(),

          productId,

          variantId:
            request.variantId ??
            null,

          imageUrl:
            request.imageUrl.trim(),

          altText:
            this.trimToNull(
              request.altText,
            ),

          purpose:
            request.purpose ??
            "GALLERY",

          sortOrder:
            request.sortOrder ??
            0,

          isPrimary:
            request.primary ??
            false,

          storageKey:
            null,

          createdAt:
            new Date(),
        })
        .returning(
          imageSelection,
        );

    const created =
      rows[0];

    if (!created) {
      throw new Error(
        "No se pudo crear la imagen.",
      );
    }

    return created;
  }

  isUniqueViolation(
    error: unknown,
  ): boolean {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error)
    ) {
      return false;
    }

    return (
      (
        error as {
          code?: unknown;
        }
      ).code ===
      "23505"
    );
  }

  private trimToNull(
    value:
      string |
      null |
      undefined,
  ): string | null {
    if (
      value ===
        undefined ||
      value ===
        null
    ) {
      return null;
    }

    const trimmed =
      value.trim();

    return trimmed.length ===
      0
      ? null
      : trimmed;
  }
}

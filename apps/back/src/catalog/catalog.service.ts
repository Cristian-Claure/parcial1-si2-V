import {
  Injectable,
} from "@nestjs/common";

import type {
  CategoryRequest,
  CategoryResponse,
  ImageRequest,
  ImageResponse,
  ProductRequest,
  ProductResponse,
  VariantRequest,
  VariantResponse,
} from "@velora/contracts";

import type {
  AuthPrincipal,
} from "../auth/security.js";

import {
  AccessContextService,
} from "../common/authz/access-context.service.js";

import {
  RuntimeConfigService,
} from "../common/config/runtime-config.service.js";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import {
  CatalogRepository,
  type CategoryRecord,
  type ImageRecord,
  type ProductRecord,
  type VariantRecord,
} from "./catalog.repository.js";

@Injectable()
export class CatalogService {
  constructor(
    private readonly catalog:
      CatalogRepository,

    private readonly access:
      AccessContextService,

    private readonly config:
      RuntimeConfigService,
  ) {}

  async listPublicCategories(
    companyId: string,
  ): Promise<CategoryResponse[]> {
    await this.requireActiveCompany(
      companyId,
    );

    const rows =
      await this.catalog
        .listCategories(
          companyId,
          true,
        );

    return this.categoryResponses(
      rows,
    );
  }

  async listManagedCategories(
    principal:
      AuthPrincipal,
    companyId: string,
  ): Promise<CategoryResponse[]> {
    await this.requireManageCompany(
      principal,
      companyId,
    );

    const rows =
      await this.catalog
        .listCategories(
          companyId,
          false,
        );

    return this.categoryResponses(
      rows,
    );
  }

  async createCategory(
    principal:
      AuthPrincipal,
    request:
      CategoryRequest,
  ): Promise<CategoryResponse> {
    await this.requireManageCompany(
      principal,
      request.companyId,
    );

    const slug =
      this.normalizeSlug(
        request.slug,
      );

    if (
      await this.catalog
        .categorySlugExists(
          request.companyId,
          slug,
        )
    ) {
      throw new ApiHttpError(
        409,
        "Ya existe una categorÃ­a con ese slug.",
      );
    }

    const parent =
      await this.resolveParent(
        request.companyId,
        request.parentId,
      );

    if (
      request.parentId &&
      !parent
    ) {
      throw new ApiHttpError(
        400,
        "La categorÃ­a padre no pertenece a la compaÃ±Ã­a seleccionada.",
      );
    }

    try {
      const created =
        await this.catalog
          .createCategory(
            request,
            slug,
          );

      return this.categoryResponse(
        created,
        parent,
      );
    }
    catch (error) {
      if (
        this.catalog
          .isUniqueViolation(
            error,
          )
      ) {
        throw new ApiHttpError(
          409,
          "Ya existe una categorÃ­a con ese slug.",
        );
      }

      throw error;
    }
  }

  async updateCategory(
    principal:
      AuthPrincipal,
    id: string,
    request:
      CategoryRequest,
  ): Promise<CategoryResponse> {
    await this.requireManageCompany(
      principal,
      request.companyId,
    );

    const current =
      await this.requireCategory(
        request.companyId,
        id,
      );

    const slug =
      this.normalizeSlug(
        request.slug,
      );

    if (
      await this.catalog
        .categorySlugExists(
          request.companyId,
          slug,
          id,
        )
    ) {
      throw new ApiHttpError(
        409,
        "Ya existe una categorÃ­a con ese slug.",
      );
    }

    const parent =
      await this.resolveParent(
        request.companyId,
        request.parentId,
      );

    if (
      request.parentId &&
      !parent
    ) {
      throw new ApiHttpError(
        400,
        "La categorÃ­a padre no pertenece a la compaÃ±Ã­a seleccionada.",
      );
    }

    await this.validateCategoryHierarchy(
      current,
      parent,
    );

    try {
      const updated =
        await this.catalog
          .updateCategory(
            id,
            request,
            slug,
          );

      return this.categoryResponse(
        updated,
        parent,
      );
    }
    catch (error) {
      if (
        this.catalog
          .isUniqueViolation(
            error,
          )
      ) {
        throw new ApiHttpError(
          409,
          "Ya existe una categorÃ­a con ese slug.",
        );
      }

      throw error;
    }
  }

  async listPublicProducts(
    companyId: string,
  ): Promise<ProductResponse[]> {
    await this.requireActiveCompany(
      companyId,
    );

    const products =
      await this.catalog
        .listProducts(
          companyId,
          true,
        );

    return Promise.all(
      products.map(
        (product) =>
          this.productResponse(
            product,
            true,
          ),
      ),
    );
  }

  async listManagedProducts(
    principal:
      AuthPrincipal,
    companyId: string,
  ): Promise<ProductResponse[]> {
    await this.requireManageCompany(
      principal,
      companyId,
    );

    const products =
      await this.catalog
        .listProducts(
          companyId,
          false,
        );

    return Promise.all(
      products.map(
        (product) =>
          this.productResponse(
            product,
            false,
          ),
      ),
    );
  }

  async getPublicProduct(
    companyId: string,
    id: string,
  ): Promise<ProductResponse> {
    await this.requireActiveCompany(
      companyId,
    );

    const product =
      await this.requireProduct(
        companyId,
        id,
      );

    if (
      product.status !==
      "ACTIVE"
    ) {
      throw new ApiHttpError(
        404,
        "Producto no encontrado.",
      );
    }

    return this.productResponse(
      product,
      true,
    );
  }

  async getManagedProduct(
    principal:
      AuthPrincipal,
    companyId: string,
    id: string,
  ): Promise<ProductResponse> {
    await this.requireManageCompany(
      principal,
      companyId,
    );

    return this.productResponse(
      await this.requireProduct(
        companyId,
        id,
      ),
      false,
    );
  }

  async listPublicVariants(
    companyId: string,
    productId: string,
  ): Promise<VariantResponse[]> {
    await this.requireActiveCompany(
      companyId,
    );

    const product =
      await this.requireProduct(
        companyId,
        productId,
      );

    if (
      product.status !==
      "ACTIVE"
    ) {
      throw new ApiHttpError(
        404,
        "Producto no encontrado.",
      );
    }

    const variants =
      await this.catalog
        .listVariants(
          productId,
          true,
        );

    return variants.map(
      (variant) =>
        this.variantResponse(
          variant,
        ),
    );
  }

  async createProduct(
    principal:
      AuthPrincipal,
    request:
      ProductRequest,
  ): Promise<ProductResponse> {
    const actor =
      await this.requireManageCompany(
        principal,
        request.companyId,
      );

    const slug =
      this.normalizeSlug(
        request.slug,
      );

    if (
      await this.catalog
        .productSlugExists(
          request.companyId,
          slug,
        )
    ) {
      throw new ApiHttpError(
        409,
        "Ya existe un producto con ese slug.",
      );
    }

    const category =
      await this.catalog
        .findCategory(
          request.companyId,
          request.categoryId,
        );

    if (!category) {
      throw new ApiHttpError(
        400,
        "La categorÃ­a seleccionada no pertenece a la compaÃ±Ã­a.",
      );
    }

    if (!category.active) {
      throw new ApiHttpError(
        400,
        "La categorÃ­a seleccionada estÃ¡ inactiva.",
      );
    }

    try {
      const created =
        await this.catalog
          .createProduct(
            request,
            slug,
            actor.userId,
          );

      return this.productResponse(
        created,
        false,
      );
    }
    catch (error) {
      if (
        this.catalog
          .isUniqueViolation(
            error,
          )
      ) {
        throw new ApiHttpError(
          409,
          "Ya existe un producto con ese slug.",
        );
      }

      throw error;
    }
  }

  async updateProduct(
    principal:
      AuthPrincipal,
    id: string,
    request:
      ProductRequest,
  ): Promise<ProductResponse> {
    const actor =
      await this.requireManageCompany(
        principal,
        request.companyId,
      );

    const current =
      await this.requireProduct(
        request.companyId,
        id,
      );

    const slug =
      this.normalizeSlug(
        request.slug,
      );

    if (
      await this.catalog
        .productSlugExists(
          request.companyId,
          slug,
          id,
        )
    ) {
      throw new ApiHttpError(
        409,
        "Ya existe un producto con ese slug.",
      );
    }

    const category =
      await this.catalog
        .findCategory(
          request.companyId,
          request.categoryId,
        );

    if (!category) {
      throw new ApiHttpError(
        400,
        "La categorÃ­a seleccionada no pertenece a la compaÃ±Ã­a.",
      );
    }

    const tryOnEnabled =
      request.tryOnEnabled ??
      current.tryOnEnabled;

    let tryOnCategory =
      request.tryOnCategory ??
      current.tryOnCategory;

    if (!tryOnEnabled) {
      tryOnCategory =
        null;
    }

    if (
      tryOnEnabled &&
      !tryOnCategory
    ) {
      throw new ApiHttpError(
        400,
        "Seleccione una categorÃ­a de probador virtual antes de habilitar el producto.",
      );
    }

    try {
      const updated =
        await this.catalog
          .updateProduct(
            id,
            request,
            slug,
            actor.userId,
            tryOnEnabled,
            tryOnCategory,
          );

      return this.productResponse(
        updated,
        false,
      );
    }
    catch (error) {
      if (
        this.catalog
          .isUniqueViolation(
            error,
          )
      ) {
        throw new ApiHttpError(
          409,
          "Ya existe un producto con ese slug.",
        );
      }

      throw error;
    }
  }

  async createVariant(
    principal:
      AuthPrincipal,
    productId: string,
    request:
      VariantRequest,
  ): Promise<VariantResponse> {
    const product =
      await this.requireProductById(
        productId,
      );

    await this.requireManageCompany(
      principal,
      product.companyId,
    );

    const sku =
      request.sku
        .trim()
        .toUpperCase();

    if (
      await this.catalog
        .skuExists(
          sku,
        )
    ) {
      throw new ApiHttpError(
        409,
        "Ya existe una variante con ese SKU.",
      );
    }

    try {
      return this.variantResponse(
        await this.catalog
          .createVariant(
            productId,
            request,
          ),
      );
    }
    catch (error) {
      if (
        this.catalog
          .isUniqueViolation(
            error,
          )
      ) {
        throw new ApiHttpError(
          409,
          "Ya existe una variante con ese SKU o cÃ³digo de barras.",
        );
      }

      throw error;
    }
  }

  async updateVariant(
    principal:
      AuthPrincipal,
    id: string,
    request:
      VariantRequest,
  ): Promise<VariantResponse> {
    const current =
      await this.catalog
        .findVariant(
          id,
        );

    if (!current) {
      throw new ApiHttpError(
        404,
        "Variante no encontrada.",
      );
    }

    await this.requireManageCompany(
      principal,
      current.companyId,
    );

    const sku =
      request.sku
        .trim()
        .toUpperCase();

    if (
      await this.catalog
        .skuExists(
          sku,
          id,
        )
    ) {
      throw new ApiHttpError(
        409,
        "Ya existe una variante con ese SKU.",
      );
    }

    try {
      return this.variantResponse(
        await this.catalog
          .updateVariant(
            id,
            request,
          ),
      );
    }
    catch (error) {
      if (
        this.catalog
          .isUniqueViolation(
            error,
          )
      ) {
        throw new ApiHttpError(
          409,
          "Ya existe una variante con ese SKU o cÃ³digo de barras.",
        );
      }

      throw error;
    }
  }

  async createImage(
    principal:
      AuthPrincipal,
    productId: string,
    request:
      ImageRequest,
  ): Promise<ImageResponse> {
    const product =
      await this.requireProductById(
        productId,
      );

    await this.requireManageCompany(
      principal,
      product.companyId,
    );

    if (request.variantId) {
      const variant =
        await this.catalog
          .findVariant(
            request.variantId,
          );

      if (
        !variant ||
        variant.productId !==
          productId
      ) {
        throw new ApiHttpError(
          400,
          "La variante no pertenece al producto indicado.",
        );
      }
    }

    if (
      request.primary ===
      true
    ) {
      await this.catalog
        .clearPrimaryImages(
          productId,
        );
    }

    return this.imageResponse(
      await this.catalog
        .createImage(
          productId,
          request,
        ),
    );
  }

  private async requireActiveCompany(
    companyId: string,
  ): Promise<void> {
    if (
      !(
        await this.catalog
          .companyIsActive(
            companyId,
          )
      )
    ) {
      throw new ApiHttpError(
        404,
        "CatÃ¡logo no encontrado.",
      );
    }
  }

  private async requireManageCompany(
    principal:
      AuthPrincipal,
    companyId: string,
  ) {
    await this.requireActiveCompany(
      companyId,
    );

    const context =
      await this.access
        .resolve(
          principal,
        );

    if (
      context.role ===
        "STORE_MANAGER" &&
      context.companyId !==
        companyId
    ) {
      throw new ApiHttpError(
        403,
        "No tiene permisos para administrar esta compaÃ±Ã­a.",
      );
    }

    return context;
  }

  private async requireCategory(
    companyId: string,
    id: string,
  ): Promise<CategoryRecord> {
    const category =
      await this.catalog
        .findCategory(
          companyId,
          id,
        );

    if (!category) {
      throw new ApiHttpError(
        404,
        "CategorÃ­a no encontrada.",
      );
    }

    return category;
  }

  private async resolveParent(
    companyId: string,
    id:
      string |
      null |
      undefined,
  ): Promise<CategoryRecord | null> {
    if (!id) {
      return null;
    }

    return this.catalog
      .findCategory(
        companyId,
        id,
      );
  }

  private async validateCategoryHierarchy(
    entity:
      CategoryRecord,
    parent:
      CategoryRecord |
      null,
  ): Promise<void> {
    let cursor =
      parent;

    while (cursor) {
      if (
        cursor.id ===
        entity.id
      ) {
        throw new ApiHttpError(
          400,
          "Una categorÃ­a no puede ser descendiente de sÃ­ misma.",
        );
      }

      if (!cursor.parentId) {
        return;
      }

      cursor =
        await this.catalog
          .findCategory(
            entity.companyId,
            cursor.parentId,
          );
    }
  }

  private async requireProduct(
    companyId: string,
    id: string,
  ): Promise<ProductRecord> {
    const product =
      await this.catalog
        .findProduct(
          companyId,
          id,
        );

    if (!product) {
      throw new ApiHttpError(
        404,
        "Producto no encontrado.",
      );
    }

    return product;
  }

  private async requireProductById(
    id: string,
  ): Promise<ProductRecord> {
    const companies =
      await this.catalogCompanyCandidates();

    for (const companyId of companies) {
      const product =
        await this.catalog
          .findProduct(
            companyId,
            id,
          );

      if (product) {
        return product;
      }
    }

    throw new ApiHttpError(
      404,
      "Producto no encontrado.",
    );
  }

  private async catalogCompanyCandidates():
    Promise<string[]> {
    const rows =
      await this.catalog
        .allActiveCompanyIds();

    return rows;
  }

  private categoryResponses(
    rows:
      CategoryRecord[],
  ): CategoryResponse[] {
    const names =
      new Map(
        rows.map(
          (row) => [
            row.id,
            row.name,
          ],
        ),
      );

    return rows.map(
      (row) =>
        this.categoryResponse(
          row,
          row.parentId
            ? {
                ...row,
                id:
                  row.parentId,

                name:
                  names.get(
                    row.parentId,
                  ) ??
                  "",
              }
            : null,
        ),
    );
  }

  private categoryResponse(
    row:
      CategoryRecord,
    parent:
      CategoryRecord |
      null,
  ): CategoryResponse {
    return {
      companyId:
        row.companyId,

      id:
        row.id,

      parentId:
        row.parentId,

      parentName:
        parent?.name ??
        null,

      name:
        row.name,

      slug:
        row.slug,

      description:
        row.description,

      active:
        row.active,
    };
  }

  private async productResponse(
    product:
      ProductRecord,
    publicOnly: boolean,
  ): Promise<ProductResponse> {
    const variants =
      await this.catalog
        .listVariants(
          product.id,
          publicOnly,
        );

    const images =
      await this.catalog
        .listImages(
          product.id,
        );

    const imageResponses =
      images.map(
        (image) =>
          this.imageResponse(
            image,
          ),
      );

    return {
      companyId:
        product.companyId,

      id:
        product.id,

      categoryId:
        product.categoryId,

      categoryName:
        product.categoryName,

      name:
        product.name,

      slug:
        product.slug,

      description:
        product.description,

      brand:
        product.brand,

      composition:
        product.composition,

      careInstructions:
        product.careInstructions,

      fitNotes:
        product.fitNotes,

      status:
        product.status,

      tryOnEnabled:
        product.tryOnEnabled,

      tryOnCategory:
        product.tryOnCategory,

      tryOnReady:
        product.tryOnEnabled &&
        product.tryOnCategory !==
          null &&
        images.some(
          (image) =>
            image.purpose ===
              "TRY_ON_GARMENT" &&
            image.storageKey !==
              null,
        ),

      variants:
        variants.map(
          (variant) =>
            this.variantResponse(
              variant,
            ),
        ),

      images:
        imageResponses,
    };
  }

  private variantResponse(
    variant:
      VariantRecord,
  ): VariantResponse {
    return {
      id:
        variant.id,

      sku:
        variant.sku,

      barcode:
        variant.barcode,

      size:
        variant.size,

      color:
        variant.color,

      colorHex:
        variant.colorHex,

      price:
        Number(
          variant.price,
        ),

      compareAtPrice:
        variant.compareAtPrice ===
          null
          ? null
          : Number(
              variant.compareAtPrice,
            ),

      currency:
        variant.currency,

      active:
        variant.active,
    };
  }

  private imageResponse(
    image:
      ImageRecord,
  ): ImageResponse {
    return {
      id:
        image.id,

      variantId:
        image.variantId,

      imageUrl:
        this.resolveImageUrl(
          image,
        ),

      altText:
        image.altText,

      purpose:
        image.purpose,

      sortOrder:
        image.sortOrder,

      primary:
        image.primary,
    };
  }

  private resolveImageUrl(
    image:
      ImageRecord,
  ): string {
    if (
      image.storageKey
    ) {
      const baseUrl =
        this.config.value
          .VELORA_PUBLIC_BACKEND_URL
          .replace(
            /\/$/,
            "",
          );

      return `${baseUrl}/api/catalog/assets/${image.storageKey}`;
    }

    return image.imageUrl;
  }
  private normalizeSlug(
    slug: string,
  ): string {
    return slug
      .trim()
      .toLowerCase();
  }
}


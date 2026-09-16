import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  catalogCompanyQuerySchema,
  categoryRequestSchema,
  imageRequestSchema,
  productRequestSchema,
  variantRequestSchema,
  type CatalogCompanyQuery,
  type CategoryRequest,
  type CategoryResponse,
  type ImageRequest,
  type ImageResponse,
  type ProductRequest,
  type ProductResponse,
  type VariantRequest,
  type VariantResponse,
} from "@velora/contracts";

import {
  BearerAuthGuard,
} from "../auth/bearer-auth.guard.js";

import type {
  AuthPrincipal,
} from "../auth/security.js";

import {
  RequireRoles,
} from "../common/authz/roles.decorator.js";

import {
  RolesGuard,
} from "../common/authz/roles.guard.js";

import type {
  AuthenticatedRequest,
} from "../common/http/authenticated-request.js";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import {
  ZodValidationPipe,
} from "../common/http/zod-validation.pipe.js";

import {
  CatalogService,
} from "./catalog.service.js";

@Controller("api/catalog")
export class CatalogPublicController {
  constructor(
    private readonly catalog:
      CatalogService,
  ) {}

  @Get("categories")
  categories(
    @Query(
      new ZodValidationPipe(
        catalogCompanyQuerySchema,
      ),
    )
    query:
      CatalogCompanyQuery,
  ): Promise<CategoryResponse[]> {
    return this.catalog
      .listPublicCategories(
        query.companyId,
      );
  }

  @Get("products")
  products(
    @Query(
      new ZodValidationPipe(
        catalogCompanyQuerySchema,
      ),
    )
    query:
      CatalogCompanyQuery,
  ): Promise<ProductResponse[]> {
    return this.catalog
      .listPublicProducts(
        query.companyId,
      );
  }

  @Get("products/:id")
  product(
    @Param(
      "id",
      new ParseUUIDPipe(),
    )
    id: string,

    @Query(
      new ZodValidationPipe(
        catalogCompanyQuerySchema,
      ),
    )
    query:
      CatalogCompanyQuery,
  ): Promise<ProductResponse> {
    return this.catalog
      .getPublicProduct(
        query.companyId,
        id,
      );
  }

  @Get("products/:id/variants")
  variants(
    @Param(
      "id",
      new ParseUUIDPipe(),
    )
    id: string,

    @Query(
      new ZodValidationPipe(
        catalogCompanyQuerySchema,
      ),
    )
    query:
      CatalogCompanyQuery,
  ): Promise<VariantResponse[]> {
    return this.catalog
      .listPublicVariants(
        query.companyId,
        id,
      );
  }
}

@Controller("api/catalog/manage")
@UseGuards(
  BearerAuthGuard,
  RolesGuard,
)
@RequireRoles(
  "ADMIN",
  "STORE_MANAGER",
)
export class CatalogManageController {
  constructor(
    private readonly catalog:
      CatalogService,
  ) {}

  @Get("categories")
  categories(
    @Req()
    request:
      AuthenticatedRequest,

    @Query(
      new ZodValidationPipe(
        catalogCompanyQuerySchema,
      ),
    )
    query:
      CatalogCompanyQuery,
  ): Promise<CategoryResponse[]> {
    return this.catalog
      .listManagedCategories(
        this.principal(
          request,
        ),
        query.companyId,
      );
  }

  @Post("categories")
  createCategory(
    @Req()
    request:
      AuthenticatedRequest,

    @Body(
      new ZodValidationPipe(
        categoryRequestSchema,
      ),
    )
    body:
      CategoryRequest,
  ): Promise<CategoryResponse> {
    return this.catalog
      .createCategory(
        this.principal(
          request,
        ),
        body,
      );
  }

  @Put("categories/:id")
  updateCategory(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "id",
      new ParseUUIDPipe(),
    )
    id: string,

    @Body(
      new ZodValidationPipe(
        categoryRequestSchema,
      ),
    )
    body:
      CategoryRequest,
  ): Promise<CategoryResponse> {
    return this.catalog
      .updateCategory(
        this.principal(
          request,
        ),
        id,
        body,
      );
  }

  @Get("products")
  products(
    @Req()
    request:
      AuthenticatedRequest,

    @Query(
      new ZodValidationPipe(
        catalogCompanyQuerySchema,
      ),
    )
    query:
      CatalogCompanyQuery,
  ): Promise<ProductResponse[]> {
    return this.catalog
      .listManagedProducts(
        this.principal(
          request,
        ),
        query.companyId,
      );
  }

  @Get("products/:id")
  product(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "id",
      new ParseUUIDPipe(),
    )
    id: string,

    @Query(
      new ZodValidationPipe(
        catalogCompanyQuerySchema,
      ),
    )
    query:
      CatalogCompanyQuery,
  ): Promise<ProductResponse> {
    return this.catalog
      .getManagedProduct(
        this.principal(
          request,
        ),
        query.companyId,
        id,
      );
  }

  @Post("products")
  createProduct(
    @Req()
    request:
      AuthenticatedRequest,

    @Body(
      new ZodValidationPipe(
        productRequestSchema,
      ),
    )
    body:
      ProductRequest,
  ): Promise<ProductResponse> {
    return this.catalog
      .createProduct(
        this.principal(
          request,
        ),
        body,
      );
  }

  @Put("products/:id")
  updateProduct(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "id",
      new ParseUUIDPipe(),
    )
    id: string,

    @Body(
      new ZodValidationPipe(
        productRequestSchema,
      ),
    )
    body:
      ProductRequest,
  ): Promise<ProductResponse> {
    return this.catalog
      .updateProduct(
        this.principal(
          request,
        ),
        id,
        body,
      );
  }

  @Post("products/:productId/variants")
  @HttpCode(
    HttpStatus.OK,
  )
  createVariant(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "productId",
      new ParseUUIDPipe(),
    )
    productId: string,

    @Body(
      new ZodValidationPipe(
        variantRequestSchema,
      ),
    )
    body:
      VariantRequest,
  ): Promise<VariantResponse> {
    return this.catalog
      .createVariant(
        this.principal(
          request,
        ),
        productId,
        body,
      );
  }

  @Put("variants/:id")
  updateVariant(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "id",
      new ParseUUIDPipe(),
    )
    id: string,

    @Body(
      new ZodValidationPipe(
        variantRequestSchema,
      ),
    )
    body:
      VariantRequest,
  ): Promise<VariantResponse> {
    return this.catalog
      .updateVariant(
        this.principal(
          request,
        ),
        id,
        body,
      );
  }

  @Post("products/:productId/images")
  @HttpCode(
    HttpStatus.OK,
  )
  createImage(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "productId",
      new ParseUUIDPipe(),
    )
    productId: string,

    @Body(
      new ZodValidationPipe(
        imageRequestSchema,
      ),
    )
    body:
      ImageRequest,
  ): Promise<ImageResponse> {
    return this.catalog
      .createImage(
        this.principal(
          request,
        ),
        productId,
        body,
      );
  }

  private principal(
    request:
      AuthenticatedRequest,
  ): AuthPrincipal {
    const principal =
      request.authPrincipal;

    if (!principal) {
      throw new ApiHttpError(
        401,
        "No autenticado.",
      );
    }

    return principal;
  }
}

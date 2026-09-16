import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from "@nestjs/common";

import {
  FileInterceptor,
} from "@nestjs/platform-express";

import type {
  ImageResponse,
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
  MAX_TRY_ON_INPUT_BYTES,
} from "../common/media/image-validation.js";

import {
  CatalogAssetsService,
  type UploadedImageFile,
} from "./catalog-assets.service.js";

interface BinaryResponse {
  setHeader(
    name: string,
    value: string | number,
  ): void;
  status(
    code: number,
  ): BinaryResponse;
  send(
    body: Buffer,
  ): void;
}

@Controller("api/catalog/assets")
export class CatalogAssetsPublicController {
  constructor(
    private readonly assets:
      CatalogAssetsService,
  ) {}

  @Get(":storageKey")
  async load(
    @Param("storageKey")
    storageKey: string,
    @Res()
    response:
      BinaryResponse,
  ): Promise<void> {
    const asset =
      await this.assets
        .publicAsset(
          storageKey,
        );

    response.setHeader(
      "Content-Type",
      asset.contentType,
    );
    response.setHeader(
      "Content-Length",
      asset.sizeBytes,
    );
    response.setHeader(
      "Cache-Control",
      "public, max-age=3600",
    );
    response
      .status(
        HttpStatus.OK,
      )
      .send(
        asset.bytes,
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
export class CatalogAssetsManageController {
  constructor(
    private readonly assets:
      CatalogAssetsService,
  ) {}

  @Post("products/:productId/assets")
  @HttpCode(
    HttpStatus.OK,
  )
  @UseInterceptors(
    FileInterceptor(
      "file",
      {
        limits: {
          fileSize:
            MAX_TRY_ON_INPUT_BYTES,
        },
      },
    ),
  )
  upload(
    @Req()
    request:
      AuthenticatedRequest,
    @Param(
      "productId",
      new ParseUUIDPipe(),
    )
    productId: string,
    @Body()
    body:
      Record<string, unknown>,
    @UploadedFile()
    file:
      UploadedImageFile | undefined,
  ): Promise<ImageResponse> {
    return this.assets
      .upload(
        this.principal(
          request,
        ),
        productId,
        body,
        file,
      );
  }

  private principal(
    request:
      AuthenticatedRequest,
  ): AuthPrincipal {
    const principal =
      request.authPrincipal;

    if (
      !principal
    ) {
      throw new ApiHttpError(
        401,
        "No autenticado.",
      );
    }

    return principal;
  }
}

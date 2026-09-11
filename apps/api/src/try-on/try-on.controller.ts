import {
  Body,
  Controller,
  Delete,
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
} from "@nestjs/common";

import {
  FileInterceptor,
} from "@nestjs/platform-express";

import type {
  TryOnJobResponse,
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
  TryOnService,
  type TryOnUploadedFile,
} from "./try-on.service.js";

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

@Controller("api/customer/try-on")
@UseGuards(
  BearerAuthGuard,
  RolesGuard,
)
@RequireRoles(
  "CUSTOMER",
)
export class TryOnController {
  constructor(
    private readonly tryOn:
      TryOnService,
  ) {}

  @Post("jobs")
  @HttpCode(
    HttpStatus.ACCEPTED,
  )
  @UseInterceptors(
    FileInterceptor(
      "person",
      {
        limits: {
          fileSize:
            MAX_TRY_ON_INPUT_BYTES,
        },
      },
    ),
  )
  create(
    @Req()
    request:
      AuthenticatedRequest,
    @Body()
    body:
      Record<string, unknown>,
    @UploadedFile()
    file:
      TryOnUploadedFile | undefined,
  ): Promise<TryOnJobResponse> {
    return this.tryOn
      .create(
        this.principal(
          request,
        ),
        body,
        file,
      );
  }

  @Get("jobs")
  list(
    @Req()
    request:
      AuthenticatedRequest,
  ): Promise<TryOnJobResponse[]> {
    return this.tryOn
      .list(
        this.principal(
          request,
        ),
      );
  }

  @Get("jobs/:jobId")
  get(
    @Req()
    request:
      AuthenticatedRequest,
    @Param(
      "jobId",
      new ParseUUIDPipe(),
    )
    jobId: string,
  ): Promise<TryOnJobResponse> {
    return this.tryOn
      .get(
        this.principal(
          request,
        ),
        jobId,
      );
  }

  @Delete("jobs/:jobId")
  cancel(
    @Req()
    request:
      AuthenticatedRequest,
    @Param(
      "jobId",
      new ParseUUIDPipe(),
    )
    jobId: string,
  ): Promise<TryOnJobResponse> {
    return this.tryOn
      .cancel(
        this.principal(
          request,
        ),
        jobId,
      );
  }

  @Get("jobs/:jobId/result")
  async result(
    @Req()
    request:
      AuthenticatedRequest,
    @Param(
      "jobId",
      new ParseUUIDPipe(),
    )
    jobId: string,
    @Res()
    response:
      BinaryResponse,
  ): Promise<void> {
    const result =
      await this.tryOn
        .result(
          this.principal(
            request,
          ),
          jobId,
        );

    response.setHeader(
      "Content-Type",
      result.contentType,
    );
    response.setHeader(
      "Content-Length",
      result.sizeBytes,
    );
    response.setHeader(
      "Cache-Control",
      "private, no-store",
    );
    response
      .status(
        HttpStatus.OK,
      )
      .send(
        result.bytes,
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

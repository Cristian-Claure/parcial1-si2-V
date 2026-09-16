import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  productAssistantRequestSchema,
  type ProductAssistantRequest,
  type ProductAssistantResponse,
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
  ProductAssistantService,
} from "./product-assistant.service.js";

@Controller("api/customer/assistant")
@UseGuards(
  BearerAuthGuard,
  RolesGuard,
)
@RequireRoles(
  "CUSTOMER",
)
export class ProductAssistantController {
  constructor(
    private readonly assistant:
      ProductAssistantService,
  ) {}

  @Post("products")
  recommend(
    @Req()
    request:
      AuthenticatedRequest,
    @Body(
      new ZodValidationPipe(
        productAssistantRequestSchema,
      ),
    )
    body:
      ProductAssistantRequest,
  ): Promise<ProductAssistantResponse> {
    return this.assistant
      .recommend(
        this.principal(
          request,
        ),
        body,
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

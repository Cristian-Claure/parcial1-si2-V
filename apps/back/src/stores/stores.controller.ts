import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  createStoreRequestSchema,
  listStoresQuerySchema,
  type CreateStoreRequest,
  type ListStoresQuery,
  type StoreResponse,
} from "@velora/contracts";

import {
  BearerAuthGuard,
} from "../auth/bearer-auth.guard.js";

import {
  RequireRoles,
} from "../common/authz/roles.decorator.js";

import {
  RolesGuard,
} from "../common/authz/roles.guard.js";

import {
  TenantScopeService,
} from "../common/authz/tenant-scope.service.js";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import type {
  AuthenticatedRequest,
} from "../common/http/authenticated-request.js";

import {
  ZodValidationPipe,
} from "../common/http/zod-validation.pipe.js";

import {
  StoresService,
} from "./stores.service.js";

import {
  PlanLimitsService,
} from "../plans/plan-limits.service.js";

@Controller("api/admin/stores")
@UseGuards(
  BearerAuthGuard,
  RolesGuard,
)
@RequireRoles(
  "ADMIN",
)
export class StoresController {
  constructor(
    private readonly stores:
      StoresService,
    private readonly scope:
      TenantScopeService,
    private readonly limits:
      PlanLimitsService,
  ) {}

  @Get()
  async listStores(
    @Req()
    request:
      AuthenticatedRequest,
    @Query(
      new ZodValidationPipe(
        listStoresQuerySchema,
      ),
    )
    query:
      ListStoresQuery,
  ): Promise<StoreResponse[]> {
    await this.scope
      .requireCompany(
        this.principal(
          request,
        ),
        query.companyId,
      );

    return this.stores
      .listStores(
        query.companyId,
      );
  }

  @Post()
  async createStore(
    @Req()
    authenticated:
      AuthenticatedRequest,
    @Body(
      new ZodValidationPipe(
        createStoreRequestSchema,
      ),
    )
    request:
      CreateStoreRequest,
  ): Promise<StoreResponse> {
    await this.scope
      .requireCompany(
        this.principal(
          authenticated,
        ),
        request.companyId,
      );

    await this.limits
      .assertCanCreateStore(
        request.companyId,
      );

    return this.stores
      .createStore(
        request,
      );
  }

  private principal(
    request:
      AuthenticatedRequest,
  ) {
    if (
      !request.authPrincipal
    ) {
      throw new ApiHttpError(
        401,
        "No autenticado.",
      );
    }

    return request.authPrincipal;
  }
}

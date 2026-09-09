import {
  Body,
  Controller,
  Get,
  Post,
  Query,
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
  ZodValidationPipe,
} from "../common/http/zod-validation.pipe.js";

import {
  StoresService,
} from "./stores.service.js";

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
  ) {}

  @Get()
  listStores(
    @Query(
      new ZodValidationPipe(
        listStoresQuerySchema,
      ),
    )
    query:
      ListStoresQuery,
  ): Promise<StoreResponse[]> {
    return this.stores
      .listStores(
        query.companyId,
      );
  }

  @Post()
  createStore(
    @Body(
      new ZodValidationPipe(
        createStoreRequestSchema,
      ),
    )
    request:
      CreateStoreRequest,
  ): Promise<StoreResponse> {
    return this.stores
      .createStore(
        request,
      );
  }
}

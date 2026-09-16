import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  inventoryMovementRequestSchema,
  inventoryTransferRequestSchema,
  warehouseRequestSchema,
  type InventoryMovementRequest,
  type InventoryMovementResponse,
  type InventoryStock,
  type InventoryTransferRequest,
  type InventoryTransferResponse,
  type WarehouseRequest,
  type WarehouseResponse,
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
  InventoryService,
} from "./inventory.service.js";

@Controller("api/inventory")
@UseGuards(
  BearerAuthGuard,
  RolesGuard,
)
@RequireRoles(
  "ADMIN",
  "STORE_MANAGER",
)
export class InventoryController {
  constructor(
    private readonly inventory:
      InventoryService,
  ) {}

  @Get("warehouses")
  warehouses(
    @Req()
    request:
      AuthenticatedRequest,
  ): Promise<WarehouseResponse[]> {
    return this.inventory
      .listWarehouses(
        this.principal(
          request,
        ),
      );
  }

  @Post("warehouses")
  createWarehouse(
    @Req()
    request:
      AuthenticatedRequest,

    @Body(
      new ZodValidationPipe(
        warehouseRequestSchema,
      ),
    )
    body:
      WarehouseRequest,
  ): Promise<WarehouseResponse> {
    return this.inventory
      .createWarehouse(
        this.principal(
          request,
        ),
        body,
      );
  }

  @Get("warehouses/:warehouseId/stock")
  stock(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "warehouseId",
      new ParseUUIDPipe(),
    )
    warehouseId: string,
  ): Promise<InventoryStock[]> {
    return this.inventory
      .listStock(
        this.principal(
          request,
        ),
        warehouseId,
      );
  }

  @Post("movements")
  movement(
    @Req()
    request:
      AuthenticatedRequest,

    @Body(
      new ZodValidationPipe(
        inventoryMovementRequestSchema,
      ),
    )
    body:
      InventoryMovementRequest,
  ): Promise<InventoryStock> {
    return this.inventory
      .registerMovement(
        this.principal(
          request,
        ),
        body,
      );
  }

  @Post("transfers")
  transfer(
    @Req()
    request:
      AuthenticatedRequest,

    @Body(
      new ZodValidationPipe(
        inventoryTransferRequestSchema,
      ),
    )
    body:
      InventoryTransferRequest,
  ): Promise<InventoryTransferResponse> {
    return this.inventory
      .transfer(
        this.principal(
          request,
        ),
        body,
      );
  }

  @Get("warehouses/:warehouseId/movements")
  history(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "warehouseId",
      new ParseUUIDPipe(),
    )
    warehouseId: string,
  ): Promise<InventoryMovementResponse[]> {
    return this.inventory
      .history(
        this.principal(
          request,
        ),
        warehouseId,
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

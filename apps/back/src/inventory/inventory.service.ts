import {
  Injectable,
} from "@nestjs/common";

import type {
  InventoryMovementRequest,
  InventoryMovementResponse,
  InventoryMovementType,
  InventoryStock,
  InventoryTransferRequest,
  InventoryTransferResponse,
  WarehouseRequest,
  WarehouseResponse,
} from "@velora/contracts";

import type {
  AuthPrincipal,
} from "../auth/security.js";

import {
  AccessContextService,
  type ActorAccessContext,
} from "../common/authz/access-context.service.js";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import {
  InventoryRepository,
  type MovementRecord,
  type StockRecord,
  type WarehouseRecord,
} from "./inventory.repository.js";

@Injectable()
export class InventoryService {
  constructor(
    private readonly inventory:
      InventoryRepository,

    private readonly access:
      AccessContextService,
  ) {}

  async listWarehouses(
    principal:
      AuthPrincipal,
  ): Promise<WarehouseResponse[]> {
    const context =
      await this.access
        .resolve(
          principal,
        );

    const storeId =
      context.role ===
        "STORE_MANAGER"
        ? context.storeId
        : null;

    if (
      context.role ===
        "STORE_MANAGER" &&
      !storeId
    ) {
      throw new ApiHttpError(
        403,
        "El encargado no tiene una sucursal asignada.",
      );
    }

    const rows =
      await this.inventory
        .listWarehouses(
          storeId,
        );

    return rows.map(
      (warehouse) =>
        this.warehouseResponse(
          warehouse,
        ),
    );
  }

  async createWarehouse(
    principal:
      AuthPrincipal,
    request:
      WarehouseRequest,
  ): Promise<WarehouseResponse> {
    const context =
      await this.access
        .resolve(
          principal,
        );

    const store =
      await this.inventory
        .findStore(
          request.storeId,
        );

    if (!store) {
      throw new ApiHttpError(
        404,
        "Sucursal no encontrada.",
      );
    }

    this.requireStoreAccess(
      context,
      store.id,
    );

    if (!store.active) {
      throw new ApiHttpError(
        400,
        "La sucursal está inactiva.",
      );
    }

    const result =
      await this.inventory
        .createWarehouse(
          request,
        );

    if (
      result.kind ===
      "DUPLICATE_CODE"
    ) {
      throw new ApiHttpError(
        409,
        "Ya existe un almacén con ese código en la sucursal.",
      );
    }

    return this.warehouseResponse(
      result.warehouse,
    );
  }

  async listStock(
    principal:
      AuthPrincipal,
    warehouseId: string,
  ): Promise<InventoryStock[]> {
    const context =
      await this.access
        .resolve(
          principal,
        );

    const warehouse =
      await this.requireWarehouse(
        warehouseId,
      );

    this.requireStoreAccess(
      context,
      warehouse.storeId,
    );

    return (
      await this.inventory
        .listStock(
          warehouseId,
        )
    ).map(
      (stock) =>
        this.stockResponse(
          stock,
        ),
    );
  }

  async registerMovement(
    principal:
      AuthPrincipal,
    request:
      InventoryMovementRequest,
  ): Promise<InventoryStock> {
    const context =
      await this.access
        .resolve(
          principal,
        );

    const warehouse =
      await this.requireWarehouse(
        request.warehouseId,
      );

    this.requireStoreAccess(
      context,
      warehouse.storeId,
    );

    if (!warehouse.active) {
      throw new ApiHttpError(
        400,
        "El almacén está inactivo.",
      );
    }

    const variant =
      await this.inventory
        .findVariant(
          request.variantId,
        );

    if (!variant) {
      throw new ApiHttpError(
        404,
        "Variante no encontrada.",
      );
    }

    if (!variant.active) {
      throw new ApiHttpError(
        400,
        "La variante está inactiva.",
      );
    }

    if (
      variant.companyId !==
      warehouse.storeCompanyId
    ) {
      throw new ApiHttpError(
        400,
        "La variante no pertenece a la compañía de la sucursal.",
      );
    }

    this.validateManualMovementType(
      request.movementType,
    );

    const physicalDelta =
      this.physicalDelta(
        request.movementType,
        request.quantity,
      );

    const result =
      await this.inventory
        .applyMovement(
          request,
          physicalDelta,
          context.userId,
        );

    if (
      result.kind ===
      "INSUFFICIENT_PHYSICAL"
    ) {
      throw new ApiHttpError(
        409,
        "Stock físico insuficiente.",
      );
    }

    if (
      result.kind ===
      "COMMITTED_EXCEEDS_PHYSICAL"
    ) {
      throw new ApiHttpError(
        409,
        "El movimiento dejaría stock físico por debajo del stock comprometido.",
      );
    }

    return this.stockResponse(
      result.stock,
    );
  }

  async transfer(
    principal:
      AuthPrincipal,
    request:
      InventoryTransferRequest,
  ): Promise<InventoryTransferResponse> {
    const context =
      await this.access
        .resolve(
          principal,
        );

    if (
      request.sourceWarehouseId ===
      request.destinationWarehouseId
    ) {
      throw new ApiHttpError(
        400,
        "El almacén de origen y destino deben ser diferentes.",
      );
    }

    const source =
      await this.requireWarehouse(
        request.sourceWarehouseId,
      );

    const destination =
      await this.requireWarehouse(
        request.destinationWarehouseId,
      );

    this.requireStoreAccess(
      context,
      source.storeId,
    );

    this.requireStoreAccess(
      context,
      destination.storeId,
    );

    if (
      source.storeId !==
      destination.storeId
    ) {
      throw new ApiHttpError(
        400,
        "Las transferencias solo pueden realizarse entre almacenes de la misma sucursal.",
      );
    }

    if (
      !source.active ||
      !destination.active
    ) {
      throw new ApiHttpError(
        400,
        "Los almacenes de origen y destino deben estar activos.",
      );
    }

    const variant =
      await this.inventory
        .findVariant(
          request.variantId,
        );

    if (!variant) {
      throw new ApiHttpError(
        404,
        "Variante no encontrada.",
      );
    }

    if (!variant.active) {
      throw new ApiHttpError(
        400,
        "La variante está inactiva.",
      );
    }

    if (
      variant.companyId !==
      source.storeCompanyId ||
      variant.companyId !==
      destination.storeCompanyId
    ) {
      throw new ApiHttpError(
        400,
        "La variante no pertenece a la compañía de la sucursal.",
      );
    }

    const result =
      await this.inventory
        .transfer(
          request,
          context.userId,
        );

    if (
      result.kind ===
      "INSUFFICIENT_PHYSICAL"
    ) {
      throw new ApiHttpError(
        409,
        "Stock físico insuficiente en el almacén de origen.",
      );
    }

    if (
      result.kind ===
      "COMMITTED_EXCEEDS_PHYSICAL"
    ) {
      throw new ApiHttpError(
        409,
        "No puede transferirse stock comprometido por pedidos.",
      );
    }

    return {
      transferId:
        result.transferId,

      source:
        this.stockResponse(
          result.source,
        ),

      destination:
        this.stockResponse(
          result.destination,
        ),
    };
  }

  async history(
    principal:
      AuthPrincipal,
    warehouseId: string,
  ): Promise<InventoryMovementResponse[]> {
    const context =
      await this.access
        .resolve(
          principal,
        );

    const warehouse =
      await this.requireWarehouse(
        warehouseId,
      );

    this.requireStoreAccess(
      context,
      warehouse.storeId,
    );

    return (
      await this.inventory
        .history(
          warehouseId,
        )
    ).map(
      (movement) =>
        this.movementResponse(
          movement,
        ),
    );
  }

  private async requireWarehouse(
    id: string,
  ): Promise<WarehouseRecord> {
    const warehouse =
      await this.inventory
        .findWarehouse(
          id,
        );

    if (!warehouse) {
      throw new ApiHttpError(
        404,
        "Almacén no encontrado.",
      );
    }

    return warehouse;
  }

  private requireStoreAccess(
    context:
      ActorAccessContext,
    storeId: string,
  ): void {
    if (
      context.role ===
      "ADMIN"
    ) {
      return;
    }

    if (
      context.role !==
        "STORE_MANAGER"
    ) {
      throw new ApiHttpError(
        403,
        "No tiene permisos para gestionar inventario.",
      );
    }

    if (
      context.storeId !==
      storeId
    ) {
      throw new ApiHttpError(
        403,
        "No puede gestionar inventario de otra sucursal.",
      );
    }
  }

  private validateManualMovementType(
    movementType:
      InventoryMovementType,
  ): void {
    if (
      movementType ===
        "RESERVE" ||
      movementType ===
        "RELEASE" ||
      movementType ===
        "SALE" ||
      movementType ===
        "TRANSFER_IN" ||
      movementType ===
        "TRANSFER_OUT"
    ) {
      throw new ApiHttpError(
        400,
        "RESERVE, RELEASE, SALE y TRANSFER_* son movimientos internos. Las transferencias deben usar la operación atómica de transferencia.",
      );
    }
  }

  private physicalDelta(
    movementType:
      InventoryMovementType,
    quantity: number,
  ): number {
    switch (movementType) {
      case "ENTRY":
      case "ADJUSTMENT_IN":
      case "RETURN":
      case "TRANSFER_IN":
        return quantity;

      case "ADJUSTMENT_OUT":
      case "TRANSFER_OUT":
        return -quantity;

      case "RESERVE":
      case "RELEASE":
      case "SALE":
        throw new ApiHttpError(
          400,
          "Movimiento no disponible manualmente.",
        );
    }
  }

  private warehouseResponse(
    warehouse:
      WarehouseRecord,
  ): WarehouseResponse {
    return {
      id:
        warehouse.id,

      storeId:
        warehouse.storeId,

      storeName:
        warehouse.storeName,

      code:
        warehouse.code,

      name:
        warehouse.name,

      description:
        warehouse.description,

      active:
        warehouse.active,

      defaultWarehouse:
        warehouse.defaultWarehouse,
    };
  }

  private stockResponse(
    stock:
      StockRecord,
  ): InventoryStock {
    return {
      id:
        stock.id,

      warehouseId:
        stock.warehouseId,

      variantId:
        stock.variantId,

      productName:
        stock.productName,

      sku:
        stock.sku,

      size:
        stock.size,

      color:
        stock.color,

      physicalQuantity:
        stock.physicalQuantity,

      committedQuantity:
        stock.committedQuantity,

      availableQuantity:
        stock.availableQuantity,

      version:
        stock.version,
    };
  }

  private movementResponse(
    movement:
      MovementRecord,
  ): InventoryMovementResponse {
    const firstName =
      movement.performedByFirstName;

    const lastName =
      movement.performedByLastName;

    const performedBy =
      firstName &&
      lastName
        ? `${firstName} ${lastName}`
        : firstName ??
          lastName ??
          null;

    return {
      id:
        movement.id,

      warehouseId:
        movement.warehouseId,

      variantId:
        movement.variantId,

      sku:
        movement.sku,

      movementType:
        movement.movementType,

      quantity:
        movement.quantity,

      physicalDelta:
        movement.physicalDelta,

      committedDelta:
        movement.committedDelta,

      physicalBefore:
        movement.physicalBefore,

      physicalAfter:
        movement.physicalAfter,

      committedBefore:
        movement.committedBefore,

      committedAfter:
        movement.committedAfter,

      reason:
        movement.reason,

      performedBy,

      createdAt:
        movement.createdAt
          .toISOString(),
    };
  }
}

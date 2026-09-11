import {
  randomUUID,
} from "node:crypto";

import {
  Injectable,
} from "@nestjs/common";

import {
  and,
  asc,
  desc,
  eq,
  sql,
} from "drizzle-orm";

import type {
  InventoryMovementRequest,
  InventoryTransferRequest,
  WarehouseRequest,
  WarehouseResponse,
} from "@velora/contracts";

import {
  appUsers,
  inventoryMovements,
  inventoryStocks,
  productVariants,
  products,
  stores,
  warehouses,
  type DatabaseInventoryMovementType,
} from "@velora/database";

import {
  DatabaseService,
} from "../database/database.service.js";

export interface StoreInventoryRecord {
  id:
    string;

  companyId:
    string;

  name:
    string;

  active:
    boolean;
}

export interface WarehouseRecord
  extends WarehouseResponse {
  storeCompanyId:
    string;
}

export interface VariantInventoryRecord {
  id:
    string;

  companyId:
    string;

  active:
    boolean;

  sku:
    string;
}

export interface StockRecord {
  id:
    string;

  warehouseId:
    string;

  variantId:
    string;

  productName:
    string;

  sku:
    string;

  size:
    string;

  color:
    string;

  physicalQuantity:
    number;

  committedQuantity:
    number;

  availableQuantity:
    number;

  version:
    number;
}

export interface MovementRecord {
  id:
    string;

  warehouseId:
    string;

  variantId:
    string;

  sku:
    string;

  movementType:
    DatabaseInventoryMovementType;

  quantity:
    number;

  physicalDelta:
    number;

  committedDelta:
    number;

  physicalBefore:
    number;

  physicalAfter:
    number;

  committedBefore:
    number;

  committedAfter:
    number;

  reason:
    string |
    null;

  performedByFirstName:
    string |
    null;

  performedByLastName:
    string |
    null;

  createdAt:
    Date;
}

class InventoryMovementAbortError
  extends Error {
  constructor(
    readonly kind:
      | "INSUFFICIENT_PHYSICAL"
      | "COMMITTED_EXCEEDS_PHYSICAL",
  ) {
    super(kind);
  }
}

export type ApplyMovementResult =
  | {
      kind:
        "OK";

      stock:
        StockRecord;
    }
  | {
      kind:
        "INSUFFICIENT_PHYSICAL";
    }
  | {
      kind:
        "COMMITTED_EXCEEDS_PHYSICAL";
    };

export type InventoryTransferResult =
  | {
      kind:
        "OK";

      transferId:
        string;

      source:
        StockRecord;

      destination:
        StockRecord;
    }
  | {
      kind:
        "INSUFFICIENT_PHYSICAL";
    }
  | {
      kind:
        "COMMITTED_EXCEEDS_PHYSICAL";
    };

const warehouseSelection = {
  id:
    warehouses.id,

  storeId:
    warehouses.storeId,

  storeName:
    stores.name,

  storeCompanyId:
    stores.companyId,

  code:
    warehouses.code,

  name:
    warehouses.name,

  description:
    warehouses.description,

  active:
    warehouses.active,

  defaultWarehouse:
    warehouses.defaultWarehouse,
} as const;

const stockSelection = {
  id:
    inventoryStocks.id,

  warehouseId:
    inventoryStocks.warehouseId,

  variantId:
    inventoryStocks.variantId,

  productName:
    products.name,

  sku:
    productVariants.sku,

  size:
    productVariants.size,

  color:
    productVariants.color,

  physicalQuantity:
    inventoryStocks.physicalQuantity,

  committedQuantity:
    inventoryStocks.committedQuantity,

  availableQuantity:
    sql<number>`
      ${inventoryStocks.availableQuantity}
    `.as(
      "available_quantity",
    ),

  version:
    inventoryStocks.version,
} as const;

@Injectable()
export class InventoryRepository {
  constructor(
    private readonly database:
      DatabaseService,
  ) {}

  async findStore(
    id: string,
  ): Promise<StoreInventoryRecord | null> {
    const rows =
      await this.database.db
        .select({
          id:
            stores.id,

          companyId:
            stores.companyId,

          name:
            stores.name,

          active:
            stores.active,
        })
        .from(
          stores,
        )
        .where(
          eq(
            stores.id,
            id,
          ),
        )
        .limit(1);

    return rows[0] ?? null;
  }

  async listWarehouses(
    storeId:
      string |
      null,
  ): Promise<WarehouseRecord[]> {
    if (
      storeId ===
      null
    ) {
      return this.database.db
        .select(
          warehouseSelection,
        )
        .from(
          warehouses,
        )
        .innerJoin(
          stores,
          eq(
            warehouses.storeId,
            stores.id,
          ),
        )
        .orderBy(
          asc(
            warehouses.name,
          ),
        );
    }

    return this.database.db
      .select(
        warehouseSelection,
      )
      .from(
        warehouses,
      )
      .innerJoin(
        stores,
        eq(
          warehouses.storeId,
          stores.id,
        ),
      )
      .where(
        eq(
          warehouses.storeId,
          storeId,
        ),
      )
      .orderBy(
        asc(
          warehouses.name,
        ),
      );
  }

  async findWarehouse(
    id: string,
  ): Promise<WarehouseRecord | null> {
    const rows =
      await this.database.db
        .select(
          warehouseSelection,
        )
        .from(
          warehouses,
        )
        .innerJoin(
          stores,
          eq(
            warehouses.storeId,
            stores.id,
          ),
        )
        .where(
          eq(
            warehouses.id,
            id,
          ),
        )
        .limit(1);

    return rows[0] ?? null;
  }

  async createWarehouse(
    request:
      WarehouseRequest,
  ): Promise<
    | {
        kind:
          "CREATED";

        warehouse:
          WarehouseRecord;
      }
    | {
        kind:
          "DUPLICATE_CODE";
      }
  > {
    return this.database.db
      .transaction(
        async (tx) => {
          await tx.execute(
            sql`
              select id
              from stores
              where id =
                ${request.storeId}::uuid
              for update
            `,
          );

          const normalizedCode =
            request.code
              .trim()
              .toUpperCase();

          const duplicate =
            await tx
              .select({
                id:
                  warehouses.id,
              })
              .from(
                warehouses,
              )
              .where(
                and(
                  eq(
                    warehouses.storeId,
                    request.storeId,
                  ),
                  sql<boolean>`
                    upper(${warehouses.code})
                    =
                    ${normalizedCode}
                  `,
                ),
              )
              .limit(1);

          if (
            duplicate.length >
            0
          ) {
            return {
              kind:
                "DUPLICATE_CODE" as const,
            };
          }

          const active =
            request.active ??
            true;

          const currentDefault =
            active
              ? await tx
                  .select({
                    id:
                      warehouses.id,
                  })
                  .from(
                    warehouses,
                  )
                  .where(
                    and(
                      eq(
                        warehouses.storeId,
                        request.storeId,
                      ),
                      eq(
                        warehouses.defaultWarehouse,
                        true,
                      ),
                    ),
                  )
                  .limit(1)
              : [];

          const defaultWarehouse =
            active &&
            currentDefault.length ===
              0;

          const now =
            new Date();

          const inserted =
            await tx
              .insert(
                warehouses,
              )
              .values({
                id:
                  randomUUID(),

                storeId:
                  request.storeId,

                code:
                  normalizedCode,

                name:
                  request.name.trim(),

                description:
                  this.trimToNull(
                    request.description,
                  ),

                active,

                defaultWarehouse,

                createdAt:
                  now,

                updatedAt:
                  now,
              })
              .returning({
                id:
                  warehouses.id,
              });

          const id =
            inserted[0]?.id;

          if (!id) {
            throw new Error(
              "No se pudo crear el almacén.",
            );
          }

          const rows =
            await tx
              .select(
                warehouseSelection,
              )
              .from(
                warehouses,
              )
              .innerJoin(
                stores,
                eq(
                  warehouses.storeId,
                  stores.id,
                ),
              )
              .where(
                eq(
                  warehouses.id,
                  id,
                ),
              )
              .limit(1);

          const warehouse =
            rows[0];

          if (!warehouse) {
            throw new Error(
              "No se pudo recuperar el almacén creado.",
            );
          }

          return {
            kind:
              "CREATED" as const,

            warehouse,
          };
        },
      );
  }

  async findVariant(
    id: string,
  ): Promise<VariantInventoryRecord | null> {
    const rows =
      await this.database.db
        .select({
          id:
            productVariants.id,

          companyId:
            products.companyId,

          active:
            productVariants.active,

          sku:
            productVariants.sku,
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

  async listStock(
    warehouseId: string,
  ): Promise<StockRecord[]> {
    return this.database.db
      .select(
        stockSelection,
      )
      .from(
        inventoryStocks,
      )
      .innerJoin(
        productVariants,
        eq(
          inventoryStocks.variantId,
          productVariants.id,
        ),
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
          inventoryStocks.warehouseId,
          warehouseId,
        ),
      )
      .orderBy(
        asc(
          products.name,
        ),
        asc(
          productVariants.sku,
        ),
      );
  }

  async applyMovement(
    request:
      InventoryMovementRequest,
    physicalDelta: number,
    actorId: string,
  ): Promise<ApplyMovementResult> {
    try {
      return await this.database.db
        .transaction(
          async (tx) => {
            const now =
              new Date();

            await tx
              .insert(
                inventoryStocks,
              )
              .values({
                id:
                  randomUUID(),

                warehouseId:
                  request.warehouseId,

                variantId:
                  request.variantId,

                physicalQuantity:
                  0,

                committedQuantity:
                  0,

                version:
                  0,

                createdAt:
                  now,

                updatedAt:
                  now,
              })
              .onConflictDoNothing({
                target: [
                  inventoryStocks.warehouseId,
                  inventoryStocks.variantId,
                ],
              });

            await tx.execute(
              sql`
                select id
                from inventory_stocks
                where warehouse_id =
                  ${request.warehouseId}::uuid
                  and variant_id =
                  ${request.variantId}::uuid
                for update
              `,
            );

            const locked =
              await tx
                .select({
                  id:
                    inventoryStocks.id,

                  physicalQuantity:
                    inventoryStocks.physicalQuantity,

                  committedQuantity:
                    inventoryStocks.committedQuantity,

                  version:
                    inventoryStocks.version,
                })
                .from(
                  inventoryStocks,
                )
                .where(
                  and(
                    eq(
                      inventoryStocks.warehouseId,
                      request.warehouseId,
                    ),
                    eq(
                      inventoryStocks.variantId,
                      request.variantId,
                    ),
                  ),
                )
                .limit(1);

            const current =
              locked[0];

            if (!current) {
              throw new Error(
                "No se pudo bloquear el stock.",
              );
            }

            const physicalAfter =
              current.physicalQuantity +
              physicalDelta;

            const committedAfter =
              current.committedQuantity;

            if (
              physicalAfter <
              0
            ) {
              throw new InventoryMovementAbortError(
                "INSUFFICIENT_PHYSICAL",
              );
            }

            if (
              committedAfter >
              physicalAfter
            ) {
              throw new InventoryMovementAbortError(
                "COMMITTED_EXCEEDS_PHYSICAL",
              );
            }

            await tx
              .update(
                inventoryStocks,
              )
              .set({
                physicalQuantity:
                  physicalAfter,

                version:
                  sql<number>`
                    ${inventoryStocks.version}
                    +
                    1
                  `,

                updatedAt:
                  now,
              })
              .where(
                eq(
                  inventoryStocks.id,
                  current.id,
                ),
              );

            await tx
              .insert(
                inventoryMovements,
              )
              .values({
                id:
                  randomUUID(),

                warehouseId:
                  request.warehouseId,

                variantId:
                  request.variantId,

                movementType:
                  request.movementType as
                    DatabaseInventoryMovementType,

                quantity:
                  request.quantity,

                physicalDelta,

                committedDelta:
                  0,

                physicalBefore:
                  current.physicalQuantity,

                physicalAfter,

                committedBefore:
                  current.committedQuantity,

                committedAfter,

                referenceType:
                  this.trimToNull(
                    request.referenceType,
                  ),

                referenceId:
                  request.referenceId ??
                  null,

                reason:
                  request.reason.trim(),

                performedBy:
                  actorId,

                createdAt:
                  now,
              });

            const stockRows =
              await tx
                .select(
                  stockSelection,
                )
                .from(
                  inventoryStocks,
                )
                .innerJoin(
                  productVariants,
                  eq(
                    inventoryStocks.variantId,
                    productVariants.id,
                  ),
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
                    inventoryStocks.id,
                    current.id,
                  ),
                )
                .limit(1);

            const stock =
              stockRows[0];

            if (!stock) {
              throw new Error(
                "No se pudo recuperar el stock actualizado.",
              );
            }

            return {
              kind:
                "OK" as const,

              stock,
            };
          },
        );
    }
    catch (error) {
      if (
        error instanceof
        InventoryMovementAbortError
      ) {
        return {
          kind:
            error.kind,
        };
      }

      throw error;
    }
  }

  async transfer(
    request:
      InventoryTransferRequest,
    actorId:
      string,
  ): Promise<InventoryTransferResult> {
    try {
      return await this.database.db
        .transaction(
          async (tx) => {
            const now =
              new Date();

            await tx
              .insert(
                inventoryStocks,
              )
              .values({
                id:
                  randomUUID(),

                warehouseId:
                  request.destinationWarehouseId,

                variantId:
                  request.variantId,

                physicalQuantity:
                  0,

                committedQuantity:
                  0,

                version:
                  0,

                createdAt:
                  now,

                updatedAt:
                  now,
              })
              .onConflictDoNothing({
                target: [
                  inventoryStocks.warehouseId,
                  inventoryStocks.variantId,
                ],
              });

            const orderedWarehouseIds =
              [
                request.sourceWarehouseId,
                request.destinationWarehouseId,
              ]
                .sort();

            for (
              const warehouseId of
              orderedWarehouseIds
            ) {
              await tx.execute(
                sql`
                  select id
                  from inventory_stocks
                  where warehouse_id =
                    ${warehouseId}::uuid
                    and variant_id =
                      ${request.variantId}::uuid
                  for update
                `,
              );
            }

            const sourceRows =
              await tx
                .select({
                  id:
                    inventoryStocks.id,

                  physicalQuantity:
                    inventoryStocks.physicalQuantity,

                  committedQuantity:
                    inventoryStocks.committedQuantity,
                })
                .from(
                  inventoryStocks,
                )
                .where(
                  and(
                    eq(
                      inventoryStocks.warehouseId,
                      request.sourceWarehouseId,
                    ),
                    eq(
                      inventoryStocks.variantId,
                      request.variantId,
                    ),
                  ),
                )
                .limit(1);

            const destinationRows =
              await tx
                .select({
                  id:
                    inventoryStocks.id,

                  physicalQuantity:
                    inventoryStocks.physicalQuantity,

                  committedQuantity:
                    inventoryStocks.committedQuantity,
                })
                .from(
                  inventoryStocks,
                )
                .where(
                  and(
                    eq(
                      inventoryStocks.warehouseId,
                      request.destinationWarehouseId,
                    ),
                    eq(
                      inventoryStocks.variantId,
                      request.variantId,
                    ),
                  ),
                )
                .limit(1);

            const source =
              sourceRows[0];

            const destination =
              destinationRows[0];

            if (
              !source ||
              source.physicalQuantity <
                request.quantity
            ) {
              throw new InventoryMovementAbortError(
                "INSUFFICIENT_PHYSICAL",
              );
            }

            if (!destination) {
              throw new Error(
                "No se pudo crear el stock del almacén de destino.",
              );
            }

            const sourcePhysicalAfter =
              source.physicalQuantity -
              request.quantity;

            if (
              source.committedQuantity >
              sourcePhysicalAfter
            ) {
              throw new InventoryMovementAbortError(
                "COMMITTED_EXCEEDS_PHYSICAL",
              );
            }

            const destinationPhysicalAfter =
              destination.physicalQuantity +
              request.quantity;

            const transferId =
              randomUUID();

            await tx
              .update(
                inventoryStocks,
              )
              .set({
                physicalQuantity:
                  sourcePhysicalAfter,

                version:
                  sql<number>`
                    ${inventoryStocks.version}
                    +
                    1
                  `,

                updatedAt:
                  now,
              })
              .where(
                eq(
                  inventoryStocks.id,
                  source.id,
                ),
              );

            await tx
              .update(
                inventoryStocks,
              )
              .set({
                physicalQuantity:
                  destinationPhysicalAfter,

                version:
                  sql<number>`
                    ${inventoryStocks.version}
                    +
                    1
                  `,

                updatedAt:
                  now,
              })
              .where(
                eq(
                  inventoryStocks.id,
                  destination.id,
                ),
              );

            await tx
              .insert(
                inventoryMovements,
              )
              .values([
                {
                  id:
                    randomUUID(),

                  warehouseId:
                    request.sourceWarehouseId,

                  variantId:
                    request.variantId,

                  movementType:
                    "TRANSFER_OUT",

                  quantity:
                    request.quantity,

                  physicalDelta:
                    -request.quantity,

                  committedDelta:
                    0,

                  physicalBefore:
                    source.physicalQuantity,

                  physicalAfter:
                    sourcePhysicalAfter,

                  committedBefore:
                    source.committedQuantity,

                  committedAfter:
                    source.committedQuantity,

                  referenceType:
                    "TRANSFER",

                  referenceId:
                    transferId,

                  reason:
                    request.reason.trim(),

                  performedBy:
                    actorId,

                  createdAt:
                    now,
                },
                {
                  id:
                    randomUUID(),

                  warehouseId:
                    request.destinationWarehouseId,

                  variantId:
                    request.variantId,

                  movementType:
                    "TRANSFER_IN",

                  quantity:
                    request.quantity,

                  physicalDelta:
                    request.quantity,

                  committedDelta:
                    0,

                  physicalBefore:
                    destination.physicalQuantity,

                  physicalAfter:
                    destinationPhysicalAfter,

                  committedBefore:
                    destination.committedQuantity,

                  committedAfter:
                    destination.committedQuantity,

                  referenceType:
                    "TRANSFER",

                  referenceId:
                    transferId,

                  reason:
                    request.reason.trim(),

                  performedBy:
                    actorId,

                  createdAt:
                    now,
                },
              ]);

            const sourceStockRows =
              await tx
                .select(
                  stockSelection,
                )
                .from(
                  inventoryStocks,
                )
                .innerJoin(
                  productVariants,
                  eq(
                    inventoryStocks.variantId,
                    productVariants.id,
                  ),
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
                    inventoryStocks.id,
                    source.id,
                  ),
                )
                .limit(1);

            const destinationStockRows =
              await tx
                .select(
                  stockSelection,
                )
                .from(
                  inventoryStocks,
                )
                .innerJoin(
                  productVariants,
                  eq(
                    inventoryStocks.variantId,
                    productVariants.id,
                  ),
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
                    inventoryStocks.id,
                    destination.id,
                  ),
                )
                .limit(1);

            const sourceStock =
              sourceStockRows[0];

            const destinationStock =
              destinationStockRows[0];

            if (
              !sourceStock ||
              !destinationStock
            ) {
              throw new Error(
                "No se pudo recuperar el stock de la transferencia.",
              );
            }

            return {
              kind:
                "OK" as const,

              transferId,

              source:
                sourceStock,

              destination:
                destinationStock,
            };
          },
        );
    }
    catch (error) {
      if (
        error instanceof
        InventoryMovementAbortError
      ) {
        return {
          kind:
            error.kind,
        };
      }

      throw error;
    }
  }

  async history(
    warehouseId: string,
  ): Promise<MovementRecord[]> {
    return this.database.db
      .select({
        id:
          inventoryMovements.id,

        warehouseId:
          inventoryMovements.warehouseId,

        variantId:
          inventoryMovements.variantId,

        sku:
          productVariants.sku,

        movementType:
          inventoryMovements.movementType,

        quantity:
          inventoryMovements.quantity,

        physicalDelta:
          inventoryMovements.physicalDelta,

        committedDelta:
          inventoryMovements.committedDelta,

        physicalBefore:
          inventoryMovements.physicalBefore,

        physicalAfter:
          inventoryMovements.physicalAfter,

        committedBefore:
          inventoryMovements.committedBefore,

        committedAfter:
          inventoryMovements.committedAfter,

        reason:
          inventoryMovements.reason,

        performedByFirstName:
          appUsers.firstName,

        performedByLastName:
          appUsers.lastName,

        createdAt:
          inventoryMovements.createdAt,
      })
      .from(
        inventoryMovements,
      )
      .innerJoin(
        productVariants,
        eq(
          inventoryMovements.variantId,
          productVariants.id,
        ),
      )
      .leftJoin(
        appUsers,
        eq(
          inventoryMovements.performedBy,
          appUsers.id,
        ),
      )
      .where(
        eq(
          inventoryMovements.warehouseId,
          warehouseId,
        ),
      )
      .orderBy(
        desc(
          inventoryMovements.createdAt,
        ),
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

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
  ne,
  sql,
} from "drizzle-orm";

import type {
  CashMovementRequest,
  CashMovementResponse,
  CashSessionResponse,
  CloseCashSessionRequest,
  ConfirmPosPaymentRequest,
  CreatePointOfSaleRequest,
  CreatePosSaleRequest,
  OpenCashSessionRequest,
  PointOfSaleResponse,
  PosPaymentResolutionResponse,
  PosSaleItemRequest,
  PosSaleResponse,
  UpdatePointOfSaleRequest,
} from "@velora/contracts";

import {
  appUsers,
  cashMovements,
  cashSessions,
  inventoryMovements,
  inventoryStocks,
  orderItems,
  orders,
  paymentStatusHistory,
  payments,
  pointsOfSale,
  productVariants,
  products,
  stores,
  warehouses,
  type VeloraDatabaseClient,
} from "@velora/database";

import type {
  ActorAccessContext,
} from "../common/authz/access-context.service.js";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import {
  DatabaseService,
} from "../database/database.service.js";

import {
  calculateExpectedCash,
  normalizePosItems,
  samePosReplay,
} from "./pos.rules.js";

type VeloraTransaction =
  Parameters<
    Parameters<
      VeloraDatabaseClient["db"]["transaction"]
    >[0]
  >[0];

type VeloraQueryExecutor =
  Pick<
    VeloraDatabaseClient["db"],
    "select"
  >;

interface PointRecord {
  id: string;
  storeId: string;
  storeName: string;
  storeCompanyId: string;
  storeActive: boolean;
  warehouseId: string;
  warehouseName: string;
  warehouseActive: boolean;
  code: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface SessionHeader {
  id: string;
  sessionNumber: string;
  pointOfSaleId: string;
  pointOfSaleCode: string;
  pointOfSaleName: string;
  pointOfSaleActive: boolean;
  storeId: string;
  storeName: string;
  storeCompanyId: string;
  storeActive: boolean;
  warehouseId: string;
  warehouseName: string;
  warehouseActive: boolean;
  openedBy: string;
  closedBy: string | null;
  status: "OPEN" | "CLOSED";
  currency: string;
  openingAmount: string;
  expectedCashAmount: string | null;
  countedCashAmount: string | null;
  cashDifference: string | null;
  openingNotes: string | null;
  closingNotes: string | null;
  openedAt: Date;
  closedAt: Date | null;
  version: number;
}

interface SaleVariant {
  variantId: string;
  productName: string;
  productStatus: "DRAFT" | "ACTIVE" | "INACTIVE";
  productCompanyId: string;
  sku: string;
  size: string;
  color: string;
  price: string;
  currency: string;
  variantActive: boolean;
}

interface LockedStock {
  id: string;
  physicalQuantity: number;
  committedQuantity: number;
}

interface PosPaymentHeader {
  paymentId: string;
  paymentMethod: "COD" | "CASH" | "CARD" | "WEB" | "QR";
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";
  orderId: string;
  orderNumber: string;
  orderStatus: "RESERVED" | "CANCELLED" | "FULFILLED";
  orderChannel: "ECOMMERCE" | "POS";
  total: string;
  currency: string;
  pointOfSaleId: string | null;
  cashSessionId: string | null;
  warehouseId: string;
  storeId: string;
  cashSessionStatus: "OPEN" | "CLOSED" | null;
}

const pointSelection = {
  id:
    pointsOfSale.id,
  storeId:
    pointsOfSale.storeId,
  storeName:
    stores.name,
  storeCompanyId:
    stores.companyId,
  storeActive:
    stores.active,
  warehouseId:
    pointsOfSale.warehouseId,
  warehouseName:
    warehouses.name,
  warehouseActive:
    warehouses.active,
  code:
    pointsOfSale.code,
  name:
    pointsOfSale.name,
  active:
    pointsOfSale.active,
  createdAt:
    pointsOfSale.createdAt,
  updatedAt:
    pointsOfSale.updatedAt,
} as const;

@Injectable()
export class PosRepository {
  constructor(
    private readonly database:
      DatabaseService,
  ) {}

  async listPoints(
    actor: ActorAccessContext,
    companyId: string | null,
  ): Promise<PointOfSaleResponse[]> {
    this.requireOperationalActor(actor);

    const condition =
      actor.role === "ADMIN"
        ? eq(
            stores.companyId,
            this.requireCompanyId(
              companyId,
            ),
          )
        : eq(
            pointsOfSale.storeId,
            this.requireManagerStore(
              actor,
            ),
          );

    const rows =
      await this.database.db
        .select(
          pointSelection,
        )
        .from(
          pointsOfSale,
        )
        .innerJoin(
          stores,
          eq(
            pointsOfSale.storeId,
            stores.id,
          ),
        )
        .innerJoin(
          warehouses,
          eq(
            pointsOfSale.warehouseId,
            warehouses.id,
          ),
        )
        .where(
          condition,
        )
        .orderBy(
          asc(
            pointsOfSale.name,
          ),
        );

    return rows.map(
      (row) =>
        this.toPointResponse(
          row,
        ),
    );
  }

  async getPoint(
    actor: ActorAccessContext,
    pointOfSaleId: string,
  ): Promise<PointOfSaleResponse> {
    this.requireOperationalActor(actor);

    const point =
      await this.pointRecord(
        this.database.db,
        pointOfSaleId,
      );

    if (!point) {
      throw new ApiHttpError(
        404,
        "Punto de venta no encontrado.",
      );
    }

    this.requireStoreAccess(
      actor,
      point.storeId,
    );

    return this.toPointResponse(
      point,
    );
  }

  async createPoint(
    actor: ActorAccessContext,
    request: CreatePointOfSaleRequest,
  ): Promise<PointOfSaleResponse> {
    this.requireAdmin(
      actor,
    );

    const pointId =
      await this.database.db
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

            const storeRows =
              await tx
                .select({
                  id:
                    stores.id,
                  active:
                    stores.active,
                })
                .from(
                  stores,
                )
                .where(
                  eq(
                    stores.id,
                    request.storeId,
                  ),
                )
                .limit(1);

            const store =
              storeRows[0];

            if (!store) {
              throw new ApiHttpError(
                404,
                "Sucursal no encontrada.",
              );
            }

            if (!store.active) {
              throw new ApiHttpError(
                409,
                "La sucursal está inactiva.",
              );
            }

            const warehouseRows =
              await tx
                .select({
                  id:
                    warehouses.id,
                  storeId:
                    warehouses.storeId,
                  active:
                    warehouses.active,
                })
                .from(
                  warehouses,
                )
                .where(
                  eq(
                    warehouses.id,
                    request.warehouseId,
                  ),
                )
                .limit(1);

            const warehouse =
              warehouseRows[0];

            if (!warehouse) {
              throw new ApiHttpError(
                404,
                "Almacén no encontrado.",
              );
            }

            if (!warehouse.active) {
              throw new ApiHttpError(
                409,
                "El almacén está inactivo.",
              );
            }

            if (
              warehouse.storeId !==
              store.id
            ) {
              throw new ApiHttpError(
                409,
                "El almacén no pertenece a la sucursal seleccionada.",
              );
            }

            const code =
              this.normalizeCode(
                request.code,
              );

            const duplicates =
              await tx
                .select({
                  id:
                    pointsOfSale.id,
                })
                .from(
                  pointsOfSale,
                )
                .where(
                  and(
                    eq(
                      pointsOfSale.storeId,
                      store.id,
                    ),
                    sql<boolean>`
                      upper(${pointsOfSale.code})
                      = ${code}
                    `,
                  ),
                )
                .limit(1);

            if (duplicates[0]) {
              throw new ApiHttpError(
                409,
                "Ya existe un punto de venta con ese código en la sucursal.",
              );
            }

            const id =
              randomUUID();

            const now =
              new Date();

            await tx
              .insert(
                pointsOfSale,
              )
              .values({
                id,
                storeId:
                  store.id,
                warehouseId:
                  warehouse.id,
                code,
                name:
                  request.name.trim(),
                active:
                  true,
                createdAt:
                  now,
                updatedAt:
                  now,
              });

            return id;
          },
        );

    const created =
      await this.pointRecord(
        this.database.db,
        pointId,
      );

    if (!created) {
      throw new Error(
        "No se pudo recuperar el punto de venta creado.",
      );
    }

    return this.toPointResponse(
      created,
    );
  }

  async updatePoint(
    actor: ActorAccessContext,
    pointOfSaleId: string,
    request: UpdatePointOfSaleRequest,
  ): Promise<PointOfSaleResponse> {
    this.requireAdmin(
      actor,
    );

    await this.database.db
      .transaction(
        async (tx) => {
          await tx.execute(
            sql`
              select id
              from points_of_sale
              where id =
                ${pointOfSaleId}::uuid
              for update
            `,
          );

          const point =
            await this.pointRecord(
              tx,
              pointOfSaleId,
            );

          if (!point) {
            throw new ApiHttpError(
              404,
              "Punto de venta no encontrado.",
            );
          }

          const warehouseRows =
            await tx
              .select({
                id:
                  warehouses.id,
                storeId:
                  warehouses.storeId,
                active:
                  warehouses.active,
              })
              .from(
                warehouses,
              )
              .where(
                eq(
                  warehouses.id,
                  request.warehouseId,
                ),
              )
              .limit(1);

          const warehouse =
            warehouseRows[0];

          if (!warehouse) {
            throw new ApiHttpError(
              404,
              "Almacén no encontrado.",
            );
          }

          if (!warehouse.active) {
            throw new ApiHttpError(
              409,
              "El almacén está inactivo.",
            );
          }

          if (
            warehouse.storeId !==
            point.storeId
          ) {
            throw new ApiHttpError(
              409,
              "El almacén no pertenece a la sucursal seleccionada.",
            );
          }

          if (
            warehouse.id !==
            point.warehouseId
          ) {
            const openSession =
              await tx
                .select({
                  id:
                    cashSessions.id,
                })
                .from(
                  cashSessions,
                )
                .where(
                  and(
                    eq(
                      cashSessions.pointOfSaleId,
                      point.id,
                    ),
                    eq(
                      cashSessions.status,
                      "OPEN",
                    ),
                  ),
                )
                .limit(1);

            if (openSession[0]) {
              throw new ApiHttpError(
                409,
                "No se puede cambiar el almacén de un punto de venta con una caja abierta.",
              );
            }

            const historicalSale =
              await tx
                .select({
                  id:
                    orders.id,
                })
                .from(
                  orders,
                )
                .where(
                  and(
                    eq(
                      orders.orderChannel,
                      "POS",
                    ),
                    eq(
                      orders.pointOfSaleId,
                      point.id,
                    ),
                  ),
                )
                .limit(1);

            if (historicalSale[0]) {
              throw new ApiHttpError(
                409,
                "No se puede cambiar el almacén de un punto de venta con ventas registradas.",
              );
            }
          }

          const code =
            this.normalizeCode(
              request.code,
            );

          const duplicate =
            await tx
              .select({
                id:
                  pointsOfSale.id,
              })
              .from(
                pointsOfSale,
              )
              .where(
                and(
                  eq(
                    pointsOfSale.storeId,
                    point.storeId,
                  ),
                  ne(
                    pointsOfSale.id,
                    point.id,
                  ),
                  sql<boolean>`
                    upper(${pointsOfSale.code})
                    = ${code}
                  `,
                ),
              )
              .limit(1);

          if (duplicate[0]) {
            throw new ApiHttpError(
              409,
              "Ya existe un punto de venta con ese código en la sucursal.",
            );
          }

          if (
            point.active &&
            !request.active
          ) {
            const open =
              await tx
                .select({
                  id:
                    cashSessions.id,
                })
                .from(
                  cashSessions,
                )
                .where(
                  and(
                    eq(
                      cashSessions.pointOfSaleId,
                      point.id,
                    ),
                    eq(
                      cashSessions.status,
                      "OPEN",
                    ),
                  ),
                )
                .limit(1);

            if (open[0]) {
              throw new ApiHttpError(
                409,
                "No se puede desactivar un punto de venta con una caja abierta.",
              );
            }
          }

          await tx
            .update(
              pointsOfSale,
            )
            .set({
              warehouseId:
                warehouse.id,
              code,
              name:
                request.name.trim(),
              active:
                request.active,
              updatedAt:
                new Date(),
            })
            .where(
              eq(
                pointsOfSale.id,
                point.id,
              ),
            );
        },
      );

    const updated =
      await this.pointRecord(
        this.database.db,
        pointOfSaleId,
      );

    if (!updated) {
      throw new Error(
        "No se pudo recuperar el punto de venta actualizado.",
      );
    }

    return this.toPointResponse(
      updated,
    );
  }

  async openSession(
    actor: ActorAccessContext,
    request: OpenCashSessionRequest,
  ): Promise<CashSessionResponse> {
    this.requireOperationalActor(
      actor,
    );

    const sessionId =
      await this.database.db
        .transaction(
          async (tx) => {
            await tx.execute(
              sql`
                select id
                from points_of_sale
                where id =
                  ${request.pointOfSaleId}::uuid
                for update
              `,
            );

            const point =
              await this.pointRecord(
                tx,
                request.pointOfSaleId,
              );

            if (!point) {
              throw new ApiHttpError(
                404,
                "Punto de venta no encontrado.",
              );
            }

            this.requireStoreAccess(
              actor,
              point.storeId,
            );

            this.requireOperationalPoint(
              point,
            );

            const open =
              await tx
                .select({
                  id:
                    cashSessions.id,
                })
                .from(
                  cashSessions,
                )
                .where(
                  and(
                    eq(
                      cashSessions.pointOfSaleId,
                      point.id,
                    ),
                    eq(
                      cashSessions.status,
                      "OPEN",
                    ),
                  ),
                )
                .limit(1);

            if (open[0]) {
              throw new ApiHttpError(
                409,
                "El punto de venta ya tiene una caja abierta.",
              );
            }

            const id =
              randomUUID();

            const now =
              new Date();

            await tx
              .insert(
                cashSessions,
              )
              .values({
                id,
                sessionNumber:
                  this.generateSessionNumber(),
                pointOfSaleId:
                  point.id,
                openedBy:
                  actor.userId,
                closedBy:
                  null,
                status:
                  "OPEN",
                currency:
                  "BOB",
                openingAmount:
                  request.openingAmount.toFixed(2),
                expectedCashAmount:
                  null,
                countedCashAmount:
                  null,
                cashDifference:
                  null,
                openingNotes:
                  this.trimToNull(
                    request.openingNotes,
                  ),
                closingNotes:
                  null,
                openedAt:
                  now,
                closedAt:
                  null,
                createdAt:
                  now,
                updatedAt:
                  now,
                version:
                  0,
              });

            return id;
          },
        );

    return this.requireSessionResponse(
      sessionId,
    );
  }

  async getOpenSession(
    actor: ActorAccessContext,
    pointOfSaleId: string,
  ): Promise<CashSessionResponse> {
    this.requireOperationalActor(
      actor,
    );

    const point =
      await this.pointRecord(
        this.database.db,
        pointOfSaleId,
      );

    if (!point) {
      throw new ApiHttpError(
        404,
        "Punto de venta no encontrado.",
      );
    }

    this.requireStoreAccess(
      actor,
      point.storeId,
    );

    const rows =
      await this.database.db
        .select({
          id:
            cashSessions.id,
        })
        .from(
          cashSessions,
        )
        .where(
          and(
            eq(
              cashSessions.pointOfSaleId,
              pointOfSaleId,
            ),
            eq(
              cashSessions.status,
              "OPEN",
            ),
          ),
        )
        .limit(1);

    const id =
      rows[0]?.id;

    if (!id) {
      throw new ApiHttpError(
        404,
        "El punto de venta no tiene una caja abierta.",
      );
    }

    return this.requireSessionResponse(
      id,
    );
  }

  async registerMovement(
    actor: ActorAccessContext,
    sessionId: string,
    request: CashMovementRequest,
  ): Promise<CashMovementResponse> {
    this.requireOperationalActor(
      actor,
    );

    const movementId =
      await this.database.db
        .transaction(
          async (tx) => {
            const session =
              await this.lockSession(
                tx,
                sessionId,
              );

            this.requireStoreAccess(
              actor,
              session.storeId,
            );

            if (
              session.status !==
              "OPEN"
            ) {
              throw new ApiHttpError(
                409,
                "No se pueden registrar movimientos en una caja cerrada.",
              );
            }

            const id =
              randomUUID();

            const now =
              new Date();

            await tx
              .insert(
                cashMovements,
              )
              .values({
                id,
                cashSessionId:
                  session.id,
                movementType:
                  request.movementType,
                amount:
                  request.amount.toFixed(2),
                reason:
                  request.reason.trim(),
                createdBy:
                  actor.userId,
                createdAt:
                  now,
              });

            return id;
          },
        );

    const rows =
      await this.database.db
        .select({
          id:
            cashMovements.id,
          cashSessionId:
            cashMovements.cashSessionId,
          movementType:
            cashMovements.movementType,
          amount:
            cashMovements.amount,
          reason:
            cashMovements.reason,
          createdBy:
            cashMovements.createdBy,
          createdAt:
            cashMovements.createdAt,
        })
        .from(
          cashMovements,
        )
        .where(
          eq(
            cashMovements.id,
            movementId,
          ),
        )
        .limit(1);

    const movement =
      rows[0];

    if (!movement) {
      throw new Error(
        "No se pudo recuperar el movimiento de caja.",
      );
    }

    return this.toMovementResponse(
      movement,
    );
  }

  async listMovements(
    actor: ActorAccessContext,
    sessionId: string,
  ): Promise<CashMovementResponse[]> {
    this.requireOperationalActor(
      actor,
    );

    const session =
      await this.sessionHeader(
        this.database.db,
        sessionId,
      );

    if (!session) {
      throw new ApiHttpError(
        404,
        "Sesión de caja no encontrada.",
      );
    }

    this.requireStoreAccess(
      actor,
      session.storeId,
    );

    const rows =
      await this.database.db
        .select({
          id:
            cashMovements.id,
          cashSessionId:
            cashMovements.cashSessionId,
          movementType:
            cashMovements.movementType,
          amount:
            cashMovements.amount,
          reason:
            cashMovements.reason,
          createdBy:
            cashMovements.createdBy,
          createdAt:
            cashMovements.createdAt,
        })
        .from(
          cashMovements,
        )
        .where(
          eq(
            cashMovements.cashSessionId,
            sessionId,
          ),
        )
        .orderBy(
          asc(
            cashMovements.createdAt,
          ),
        );

    return rows.map(
      (row) =>
        this.toMovementResponse(
          row,
        ),
    );
  }

  async closeSession(
    actor: ActorAccessContext,
    sessionId: string,
    request: CloseCashSessionRequest,
  ): Promise<CashSessionResponse> {
    this.requireOperationalActor(
      actor,
    );

    await this.database.db
      .transaction(
        async (tx) => {
          const session =
            await this.lockSession(
              tx,
              sessionId,
            );

          this.requireStoreAccess(
            actor,
            session.storeId,
          );

          if (
            session.status !==
            "OPEN"
          ) {
            throw new ApiHttpError(
              409,
              "La caja ya se encuentra cerrada.",
            );
          }

          const pendingRows =
            await tx
              .select({
                count:
                  sql<number>`count(*)::int`,
              })
              .from(
                payments,
              )
              .innerJoin(
                orders,
                eq(
                  payments.orderId,
                  orders.id,
                ),
              )
              .where(
                and(
                  eq(
                    orders.cashSessionId,
                    session.id,
                  ),
                  eq(
                    orders.orderChannel,
                    "POS",
                  ),
                  eq(
                    payments.status,
                    "PENDING",
                  ),
                ),
              );

          if (
            Number(
              pendingRows[0]?.count ??
              0,
            ) > 0
          ) {
            throw new ApiHttpError(
              409,
              "No puede cerrarse la caja mientras existan pagos POS pendientes.",
            );
          }

          const movementRows =
            await tx
              .select({
                movementType:
                  cashMovements.movementType,
                amount:
                  cashMovements.amount,
              })
              .from(
                cashMovements,
              )
              .where(
                eq(
                  cashMovements.cashSessionId,
                  session.id,
                ),
              );

          const cashRows =
            await tx
              .select({
                amount:
                  payments.amount,
              })
              .from(
                payments,
              )
              .innerJoin(
                orders,
                eq(
                  payments.orderId,
                  orders.id,
                ),
              )
              .where(
                and(
                  eq(
                    orders.cashSessionId,
                    session.id,
                  ),
                  eq(
                    orders.orderChannel,
                    "POS",
                  ),
                  eq(
                    payments.method,
                    "CASH",
                  ),
                  eq(
                    payments.status,
                    "PAID",
                  ),
                ),
              );

          const expected =
            calculateExpectedCash(
              Number(
                session.openingAmount,
              ),
              movementRows.map(
                (movement) => ({
                  movementType:
                    movement.movementType,
                  amount:
                    Number(
                      movement.amount,
                    ),
                }),
              ),
              cashRows.reduce(
                (
                  total,
                  payment,
                ) =>
                  total +
                  Number(
                    payment.amount,
                  ),
                0,
              ),
            );

          if (
            expected <
            0
          ) {
            throw new ApiHttpError(
              409,
              "El efectivo esperado de la caja no puede ser negativo.",
            );
          }

          const difference =
            Number(
              (
                request.countedCashAmount -
                expected
              ).toFixed(2),
            );

          const now =
            new Date();

          await tx
            .update(
              cashSessions,
            )
            .set({
              expectedCashAmount:
                expected.toFixed(2),
              countedCashAmount:
                request.countedCashAmount.toFixed(2),
              cashDifference:
                difference.toFixed(2),
              closingNotes:
                this.trimToNull(
                  request.closingNotes,
                ),
              closedBy:
                actor.userId,
              closedAt:
                now,
              status:
                "CLOSED",
              version:
                sql<number>`
                  ${cashSessions.version}
                  + 1
                `,
              updatedAt:
                now,
            })
            .where(
              eq(
                cashSessions.id,
                session.id,
              ),
            );
        },
      );

    return this.requireSessionResponse(
      sessionId,
    );
  }

  async createSale(
    actor: ActorAccessContext,
    request: CreatePosSaleRequest,
  ): Promise<PosSaleResponse> {
    this.requireOperationalActor(
      actor,
    );

    let normalizedItems:
      PosSaleItemRequest[];

    try {
      normalizedItems =
        normalizePosItems(
          request.items,
        );
    }
    catch {
      throw new ApiHttpError(
        400,
        "Una variante no puede repetirse en la venta.",
      );
    }

    const orderId =
      await this.database.db
        .transaction(
          async (tx) => {
            await tx.execute(
              sql`
                select
                  pg_advisory_xact_lock(
                    hashtextextended(
                      ${request.clientOperationId}::text,
                      0
                    )
                  )
              `,
            );

            const existing =
              await this.existingOperation(
                tx,
                request.clientOperationId,
              );

            if (existing) {
              if (
                existing.orderChannel !==
                "POS"
              ) {
                throw new ApiHttpError(
                  409,
                  "El identificador de operación ya está en uso.",
                );
              }

              if (
                !existing.pointOfSaleId ||
                !existing.cashSessionId ||
                !existing.paymentId ||
                !existing.paymentMethod
              ) {
                throw new ApiHttpError(
                  409,
                  "La operación POS existente es inconsistente.",
                );
              }

              this.requireStoreAccess(
                actor,
                existing.storeId,
              );

              const storedItems =
                await tx
                  .select({
                    variantId:
                      orderItems.variantId,
                    quantity:
                      orderItems.quantity,
                  })
                  .from(
                    orderItems,
                  )
                  .where(
                    eq(
                      orderItems.orderId,
                      existing.orderId,
                    ),
                  );

              const same =
                samePosReplay(
                  {
                    cashSessionId:
                      existing.cashSessionId,
                    customerId:
                      existing.customerId,
                    paymentMethod:
                      existing.paymentMethod,
                  },
                  {
                    cashSessionId:
                      request.cashSessionId,
                    customerId:
                      request.customerId ??
                      null,
                    paymentMethod:
                      request.paymentMethod,
                  },
                  storedItems,
                  normalizedItems,
                );

              if (!same) {
                throw new ApiHttpError(
                  409,
                  "El identificador de operación fue reutilizado con datos diferentes.",
                );
              }

              return existing.orderId;
            }

            const session =
              await this.lockSession(
                tx,
                request.cashSessionId,
              );

            this.requireStoreAccess(
              actor,
              session.storeId,
            );

            if (
              session.status !==
              "OPEN"
            ) {
              throw new ApiHttpError(
                409,
                "La venta requiere una caja abierta.",
              );
            }

            if (
              !session.pointOfSaleActive
            ) {
              throw new ApiHttpError(
                409,
                "El punto de venta está inactivo.",
              );
            }

            if (
              !session.storeActive
            ) {
              throw new ApiHttpError(
                409,
                "La sucursal del punto de venta está inactiva.",
              );
            }

            if (
              !session.warehouseActive
            ) {
              throw new ApiHttpError(
                409,
                "El almacén del punto de venta está inactivo.",
              );
            }

            const customerId =
              request.customerId ??
              null;

            if (customerId) {
              const customerRows =
                await tx
                  .select({
                    role:
                      appUsers.role,
                    status:
                      appUsers.status,
                  })
                  .from(
                    appUsers,
                  )
                  .where(
                    eq(
                      appUsers.id,
                      customerId,
                    ),
                  )
                  .limit(1);

              const customer =
                customerRows[0];

              if (!customer) {
                throw new ApiHttpError(
                  404,
                  "Cliente no encontrado.",
                );
              }

              if (
                customer.role !==
                "CUSTOMER"
              ) {
                throw new ApiHttpError(
                  400,
                  "El usuario indicado no es un cliente.",
                );
              }

              if (
                customer.status !==
                "ACTIVE"
              ) {
                throw new ApiHttpError(
                  409,
                  "El cliente está inactivo.",
                );
              }
            }

            const variants =
              new Map<
                string,
                SaleVariant
              >();

            const stocks =
              new Map<
                string,
                LockedStock
              >();

            let currency:
              string |
              null =
              null;

            let subtotal =
              0;

            for (
              const item of
              normalizedItems
            ) {
              const variantRows =
                await tx
                  .select({
                    variantId:
                      productVariants.id,
                    productName:
                      products.name,
                    productStatus:
                      products.status,
                    productCompanyId:
                      products.companyId,
                    sku:
                      productVariants.sku,
                    size:
                      productVariants.size,
                    color:
                      productVariants.color,
                    price:
                      productVariants.price,
                    currency:
                      productVariants.currency,
                    variantActive:
                      productVariants.active,
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
                      item.variantId,
                    ),
                  )
                  .limit(1);

              const variant =
                variantRows[0];

              if (!variant) {
                throw new ApiHttpError(
                  404,
                  "Variante no encontrada: " +
                    item.variantId,
                );
              }

              if (
                !variant.variantActive ||
                variant.productStatus !==
                  "ACTIVE"
              ) {
                throw new ApiHttpError(
                  409,
                  "La variante no está disponible para la venta.",
                );
              }

              if (
                variant.productCompanyId !==
                session.storeCompanyId
              ) {
                throw new ApiHttpError(
                  409,
                  "La variante no pertenece a la compañía del punto de venta.",
                );
              }

              if (
                currency ===
                null
              ) {
                currency =
                  variant.currency;
              }
              else if (
                currency !==
                variant.currency
              ) {
                throw new ApiHttpError(
                  409,
                  "La venta contiene variantes con monedas diferentes.",
                );
              }

              await tx.execute(
                sql`
                  select id
                  from inventory_stocks
                  where warehouse_id =
                    ${session.warehouseId}::uuid
                    and variant_id =
                      ${item.variantId}::uuid
                  for update
                `,
              );

              const stockRows =
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
                        session.warehouseId,
                      ),
                      eq(
                        inventoryStocks.variantId,
                        item.variantId,
                      ),
                    ),
                  )
                  .limit(1);

              const stock =
                stockRows[0];

              if (!stock) {
                throw new ApiHttpError(
                  409,
                  "La variante " +
                    variant.sku +
                    " no tiene stock en el almacén del POS.",
                );
              }

              const available =
                stock.physicalQuantity -
                stock.committedQuantity;

              if (
                available <
                item.quantity
              ) {
                throw new ApiHttpError(
                  409,
                  "Stock disponible insuficiente para " +
                    variant.sku +
                    ". Disponible: " +
                    available +
                    ", solicitado: " +
                    item.quantity +
                    ".",
                );
              }

              variants.set(
                item.variantId,
                variant,
              );

              stocks.set(
                item.variantId,
                stock,
              );

              subtotal +=
                Number(
                  variant.price,
                ) *
                item.quantity;
            }

            if (!currency) {
              throw new ApiHttpError(
                400,
                "La venta debe contener productos.",
              );
            }

            const id =
              randomUUID();

            const orderNumber =
              this.generateOrderNumber();

            const now =
              new Date();

            const cashPayment =
              request.paymentMethod ===
              "CASH";

            await tx
              .insert(
                orders,
              )
              .values({
                id,
                orderNumber,
                orderChannel:
                  "POS",
                customerId,
                sourceCartId:
                  null,
                warehouseId:
                  session.warehouseId,
                addressId:
                  null,
                pointOfSaleId:
                  session.pointOfSaleId,
                cashSessionId:
                  session.id,
                fulfillmentType:
                  "IN_STORE",
                status:
                  cashPayment
                    ? "FULFILLED"
                    : "RESERVED",
                currency,
                subtotal:
                  subtotal.toFixed(2),
                total:
                  subtotal.toFixed(2),
                recipientName:
                  null,
                recipientPhone:
                  null,
                department:
                  null,
                city:
                  null,
                zone:
                  null,
                addressLine:
                  null,
                addressReference:
                  null,
                notes:
                  this.trimToNull(
                    request.notes,
                  ),
                clientOperationId:
                  request.clientOperationId,
                clientCreatedAt:
                  request.clientCreatedAt
                    ? new Date(
                        request.clientCreatedAt,
                      )
                    : null,
                syncedAt:
                  now,
                cancelledAt:
                  null,
                fulfilledAt:
                  cashPayment
                    ? now
                    : null,
                createdAt:
                  now,
                updatedAt:
                  now,
              });

            for (
              const item of
              normalizedItems
            ) {
              const variant =
                variants.get(
                  item.variantId,
                );

              const stock =
                stocks.get(
                  item.variantId,
                );

              if (
                !variant ||
                !stock
              ) {
                throw new Error(
                  "No se encontró el snapshot bloqueado de la venta POS.",
                );
              }

              const lineSubtotal =
                Number(
                  variant.price,
                ) *
                item.quantity;

              await tx
                .insert(
                  orderItems,
                )
                .values({
                  id:
                    randomUUID(),
                  orderId:
                    id,
                  variantId:
                    item.variantId,
                  productName:
                    variant.productName,
                  sku:
                    variant.sku,
                  size:
                    variant.size,
                  color:
                    variant.color,
                  unitPrice:
                    variant.price,
                  currency:
                    variant.currency,
                  quantity:
                    item.quantity,
                  subtotal:
                    lineSubtotal.toFixed(2),
                  createdAt:
                    now,
                });

              if (cashPayment) {
                const physicalAfter =
                  stock.physicalQuantity -
                  item.quantity;

                if (
                  physicalAfter <
                    0 ||
                  stock.committedQuantity >
                    physicalAfter
                ) {
                  throw new ApiHttpError(
                    409,
                    "El inventario no permite completar la venta POS.",
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
                        + 1
                      `,
                    updatedAt:
                      now,
                  })
                  .where(
                    eq(
                      inventoryStocks.id,
                      stock.id,
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
                      session.warehouseId,
                    variantId:
                      item.variantId,
                    movementType:
                      "SALE",
                    quantity:
                      item.quantity,
                    physicalDelta:
                      -item.quantity,
                    committedDelta:
                      0,
                    physicalBefore:
                      stock.physicalQuantity,
                    physicalAfter,
                    committedBefore:
                      stock.committedQuantity,
                    committedAfter:
                      stock.committedQuantity,
                    referenceType:
                      "ORDER",
                    referenceId:
                      id,
                    reason:
                      "Venta POS " +
                      orderNumber,
                    performedBy:
                      actor.userId,
                    createdAt:
                      now,
                  });
              }
              else {
                const committedAfter =
                  stock.committedQuantity +
                  item.quantity;

                if (
                  committedAfter >
                  stock.physicalQuantity
                ) {
                  throw new ApiHttpError(
                    409,
                    "No existe stock suficiente para reservar la venta POS.",
                  );
                }

                await tx
                  .update(
                    inventoryStocks,
                  )
                  .set({
                    committedQuantity:
                      committedAfter,
                    version:
                      sql<number>`
                        ${inventoryStocks.version}
                        + 1
                      `,
                    updatedAt:
                      now,
                  })
                  .where(
                    eq(
                      inventoryStocks.id,
                      stock.id,
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
                      session.warehouseId,
                    variantId:
                      item.variantId,
                    movementType:
                      "RESERVE",
                    quantity:
                      item.quantity,
                    physicalDelta:
                      0,
                    committedDelta:
                      item.quantity,
                    physicalBefore:
                      stock.physicalQuantity,
                    physicalAfter:
                      stock.physicalQuantity,
                    committedBefore:
                      stock.committedQuantity,
                    committedAfter,
                    referenceType:
                      "ORDER",
                    referenceId:
                      id,
                    reason:
                      "Reserva por pago POS pendiente " +
                      orderNumber,
                    performedBy:
                      actor.userId,
                    createdAt:
                      now,
                  });
              }
            }

            const paymentId =
              randomUUID();

            await tx
              .insert(
                payments,
              )
              .values({
                id:
                  paymentId,
                orderId:
                  id,
                method:
                  request.paymentMethod,
                status:
                  cashPayment
                    ? "PAID"
                    : "PENDING",
                amount:
                  subtotal.toFixed(2),
                currency,
                provider:
                  null,
                externalReference:
                  null,
                notes:
                  cashPayment
                    ? "Pago en efectivo registrado en POS."
                    : "Pago POS pendiente de confirmación.",
                createdBy:
                  actor.userId,
                processedBy:
                  cashPayment
                    ? actor.userId
                    : null,
                paidAt:
                  cashPayment
                    ? now
                    : null,
                failedAt:
                  null,
                cancelledAt:
                  null,
                refundedAt:
                  null,
                createdAt:
                  now,
                updatedAt:
                  now,
              });

            await tx
              .insert(
                paymentStatusHistory,
              )
              .values({
                id:
                  randomUUID(),
                paymentId,
                fromStatus:
                  null,
                toStatus:
                  cashPayment
                    ? "PAID"
                    : "PENDING",
                changedBy:
                  actor.userId,
                reason:
                  cashPayment
                    ? "Pago en efectivo confirmado en POS."
                    : "Pago POS iniciado y pendiente de confirmación.",
                createdAt:
                  now,
              });

            return id;
          },
        );

    return this.requireSaleResponse(
      orderId,
    );
  }

  async pendingSales(
    actor: ActorAccessContext,
    sessionId: string,
  ): Promise<PosSaleResponse[]> {
    this.requireOperationalActor(
      actor,
    );

    const session =
      await this.sessionHeader(
        this.database.db,
        sessionId,
      );

    if (!session) {
      throw new ApiHttpError(
        404,
        "Sesión de caja no encontrada.",
      );
    }

    this.requireStoreAccess(
      actor,
      session.storeId,
    );

    const rows =
      await this.database.db
        .select({
          orderId:
            orders.id,
        })
        .from(
          orders,
        )
        .innerJoin(
          payments,
          eq(
            payments.orderId,
            orders.id,
          ),
        )
        .where(
          and(
            eq(
              orders.orderChannel,
              "POS",
            ),
            eq(
              orders.cashSessionId,
              sessionId,
            ),
            eq(
              payments.status,
              "PENDING",
            ),
          ),
        )
        .orderBy(
          asc(
            orders.createdAt,
          ),
        );

    const result:
      PosSaleResponse[] =
      [];

    for (
      const row of
      rows
    ) {
      result.push(
        await this.requireSaleResponse(
          row.orderId,
        ),
      );
    }

    return result;
  }

  async confirmPayment(
    actor: ActorAccessContext,
    paymentId: string,
    request: ConfirmPosPaymentRequest,
  ): Promise<PosPaymentResolutionResponse> {
    this.requireOperationalActor(
      actor,
    );

    return this.database.db
      .transaction(
        async (tx) => {
          const initial =
            await this.paymentHeader(
              tx,
              paymentId,
            );

          if (!initial) {
            throw new ApiHttpError(
              404,
              "Pago no encontrado.",
            );
          }

          this.requirePosPayment(
            actor,
            initial,
          );

          await tx.execute(
            sql`
              select id
              from orders
              where id =
                ${initial.orderId}::uuid
              for update
            `,
          );

          await tx.execute(
            sql`
              select id
              from payments
              where id =
                ${paymentId}::uuid
              for update
            `,
          );

          const payment =
            await this.paymentHeader(
              tx,
              paymentId,
            );

          if (!payment) {
            throw new ApiHttpError(
              404,
              "Pago no encontrado.",
            );
          }

          this.requirePosPayment(
            actor,
            payment,
          );

          if (
            payment.paymentMethod !==
              "CARD" &&
            payment.paymentMethod !==
              "QR"
          ) {
            throw new ApiHttpError(
              409,
              "Solo se confirma por este flujo un pago CARD o QR.",
            );
          }

          if (
            payment.paymentStatus !==
            "PENDING"
          ) {
            throw new ApiHttpError(
              409,
              "El pago POS no se encuentra pendiente.",
            );
          }

          if (
            payment.orderStatus !==
            "RESERVED"
          ) {
            throw new ApiHttpError(
              409,
              "La venta POS ya no se encuentra reservada.",
            );
          }

          if (
            payment.cashSessionStatus !==
            "OPEN"
          ) {
            throw new ApiHttpError(
              409,
              "La caja asociada a la venta ya no está abierta.",
            );
          }

          const lines =
            await tx
              .select({
                variantId:
                  orderItems.variantId,
                quantity:
                  orderItems.quantity,
              })
              .from(
                orderItems,
              )
              .where(
                eq(
                  orderItems.orderId,
                  payment.orderId,
                ),
              )
              .orderBy(
                asc(
                  orderItems.variantId,
                ),
              );

          const stocks =
            await this.lockOrderStocks(
              tx,
              payment.warehouseId,
              lines,
            );

          const now =
            new Date();

          await tx
            .update(
              payments,
            )
            .set({
              status:
                "PAID",
              processedBy:
                actor.userId,
              paidAt:
                now,
              updatedAt:
                now,
            })
            .where(
              eq(
                payments.id,
                payment.paymentId,
              ),
            );

          await tx
            .insert(
              paymentStatusHistory,
            )
            .values({
              id:
                randomUUID(),
              paymentId:
                payment.paymentId,
              fromStatus:
                "PENDING",
              toStatus:
                "PAID",
              changedBy:
                actor.userId,
              reason:
                this.reasonOrFallback(
                  request.reason,
                  "Pago POS confirmado.",
                ),
              createdAt:
                now,
            });

          for (
            const line of
            lines
          ) {
            const stock =
              stocks.get(
                line.variantId,
              );

            if (!stock) {
              throw new Error(
                "No se encontró el stock bloqueado para completar la venta POS.",
              );
            }

            const physicalAfter =
              stock.physicalQuantity -
              line.quantity;

            const committedAfter =
              stock.committedQuantity -
              line.quantity;

            if (
              physicalAfter <
                0 ||
              committedAfter <
                0 ||
              committedAfter >
                physicalAfter
            ) {
              throw new ApiHttpError(
                409,
                "El inventario no permite completar la venta POS.",
              );
            }

            await tx
              .update(
                inventoryStocks,
              )
              .set({
                physicalQuantity:
                  physicalAfter,
                committedQuantity:
                  committedAfter,
                version:
                  sql<number>`
                    ${inventoryStocks.version}
                    + 1
                  `,
                updatedAt:
                  now,
              })
              .where(
                eq(
                  inventoryStocks.id,
                  stock.id,
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
                  payment.warehouseId,
                variantId:
                  line.variantId,
                movementType:
                  "SALE",
                quantity:
                  line.quantity,
                physicalDelta:
                  -line.quantity,
                committedDelta:
                  -line.quantity,
                physicalBefore:
                  stock.physicalQuantity,
                physicalAfter,
                committedBefore:
                  stock.committedQuantity,
                committedAfter,
                referenceType:
                  "ORDER",
                referenceId:
                  payment.orderId,
                reason:
                  "Venta por cumplimiento del pedido " +
                  payment.orderNumber,
                performedBy:
                  actor.userId,
                createdAt:
                  now,
              });
          }

          await tx
            .update(
              orders,
            )
            .set({
              status:
                "FULFILLED",
              fulfilledAt:
                now,
              updatedAt:
                now,
            })
            .where(
              eq(
                orders.id,
                payment.orderId,
              ),
            );

          return {
            orderId:
              payment.orderId,
            orderNumber:
              payment.orderNumber,
            orderStatus:
              "FULFILLED",
            paymentId:
              payment.paymentId,
            paymentMethod:
              payment.paymentMethod,
            paymentStatus:
              "PAID",
            total:
              Number(
                payment.total,
              ),
            currency:
              payment.currency,
            resolvedAt:
              now.toISOString(),
          };
        },
      );
  }

  async failPayment(
    actor: ActorAccessContext,
    paymentId: string,
    reason: string | null | undefined,
  ): Promise<PosPaymentResolutionResponse> {
    return this.resolvePayment(
      actor,
      paymentId,
      "FAILED",
      reason,
    );
  }

  async cancelPayment(
    actor: ActorAccessContext,
    paymentId: string,
    reason: string | null | undefined,
  ): Promise<PosPaymentResolutionResponse> {
    return this.resolvePayment(
      actor,
      paymentId,
      "CANCELLED",
      reason,
    );
  }

  private async resolvePayment(
    actor: ActorAccessContext,
    paymentId: string,
    target:
      "FAILED" |
      "CANCELLED",
    reason:
      string |
      null |
      undefined,
  ): Promise<PosPaymentResolutionResponse> {
    this.requireOperationalActor(
      actor,
    );

    return this.database.db
      .transaction(
        async (tx) => {
          const initial =
            await this.paymentHeader(
              tx,
              paymentId,
            );

          if (!initial) {
            throw new ApiHttpError(
              404,
              "Pago no encontrado.",
            );
          }

          this.requirePosPayment(
            actor,
            initial,
          );

          await tx.execute(
            sql`
              select id
              from orders
              where id =
                ${initial.orderId}::uuid
              for update
            `,
          );

          await tx.execute(
            sql`
              select id
              from payments
              where id =
                ${paymentId}::uuid
              for update
            `,
          );

          const payment =
            await this.paymentHeader(
              tx,
              paymentId,
            );

          if (!payment) {
            throw new ApiHttpError(
              404,
              "Pago no encontrado.",
            );
          }

          this.requirePosPayment(
            actor,
            payment,
          );

          if (
            payment.orderStatus !==
            "RESERVED"
          ) {
            throw new ApiHttpError(
              409,
              "La venta POS ya no se encuentra reservada.",
            );
          }

          if (
            payment.paymentMethod !==
              "CARD" &&
            payment.paymentMethod !==
              "QR"
          ) {
            throw new ApiHttpError(
              409,
              "Solo pueden resolverse por este flujo pagos CARD o QR.",
            );
          }

          if (
            payment.paymentStatus !==
            "PENDING"
          ) {
            throw new ApiHttpError(
              409,
              "El pago POS ya no se encuentra pendiente.",
            );
          }

          const lines =
            await tx
              .select({
                variantId:
                  orderItems.variantId,
                quantity:
                  orderItems.quantity,
              })
              .from(
                orderItems,
              )
              .where(
                eq(
                  orderItems.orderId,
                  payment.orderId,
                ),
              )
              .orderBy(
                asc(
                  orderItems.variantId,
                ),
              );

          const stocks =
            await this.lockOrderStocks(
              tx,
              payment.warehouseId,
              lines,
            );

          const now =
            new Date();

          for (
            const line of
            lines
          ) {
            const stock =
              stocks.get(
                line.variantId,
              );

            if (!stock) {
              throw new Error(
                "No se encontró el stock bloqueado para liberar la venta POS.",
              );
            }

            const committedAfter =
              stock.committedQuantity -
              line.quantity;

            if (
              committedAfter <
              0
            ) {
              throw new ApiHttpError(
                409,
                "La reserva POS no puede liberarse porque el stock comprometido es inconsistente.",
              );
            }

            await tx
              .update(
                inventoryStocks,
              )
              .set({
                committedQuantity:
                  committedAfter,
                version:
                  sql<number>`
                    ${inventoryStocks.version}
                    + 1
                  `,
                updatedAt:
                  now,
              })
              .where(
                eq(
                  inventoryStocks.id,
                  stock.id,
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
                  payment.warehouseId,
                variantId:
                  line.variantId,
                movementType:
                  "RELEASE",
                quantity:
                  line.quantity,
                physicalDelta:
                  0,
                committedDelta:
                  -line.quantity,
                physicalBefore:
                  stock.physicalQuantity,
                physicalAfter:
                  stock.physicalQuantity,
                committedBefore:
                  stock.committedQuantity,
                committedAfter,
                referenceType:
                  "ORDER",
                referenceId:
                  payment.orderId,
                reason:
                  target ===
                  "FAILED"
                    ? "Liberación por pago POS fallido " +
                      payment.orderNumber
                    : "Liberación por cancelación de pago POS " +
                      payment.orderNumber,
                performedBy:
                  actor.userId,
                createdAt:
                  now,
              });
          }

          await tx
            .update(
              payments,
            )
            .set({
              status:
                target,
              processedBy:
                actor.userId,
              failedAt:
                target ===
                "FAILED"
                  ? now
                  : null,
              cancelledAt:
                target ===
                "CANCELLED"
                  ? now
                  : null,
              updatedAt:
                now,
            })
            .where(
              eq(
                payments.id,
                payment.paymentId,
              ),
            );

          await tx
            .insert(
              paymentStatusHistory,
            )
            .values({
              id:
                randomUUID(),
              paymentId:
                payment.paymentId,
              fromStatus:
                "PENDING",
              toStatus:
                target,
              changedBy:
                actor.userId,
              reason:
                this.reasonOrFallback(
                  reason,
                  target ===
                    "FAILED"
                    ? "Pago POS fallido."
                    : "Pago POS cancelado.",
                ),
              createdAt:
                now,
            });

          await tx
            .update(
              orders,
            )
            .set({
              status:
                "CANCELLED",
              cancelledAt:
                now,
              updatedAt:
                now,
            })
            .where(
              eq(
                orders.id,
                payment.orderId,
              ),
            );

          return {
            orderId:
              payment.orderId,
            orderNumber:
              payment.orderNumber,
            orderStatus:
              "CANCELLED",
            paymentId:
              payment.paymentId,
            paymentMethod:
              payment.paymentMethod,
            paymentStatus:
              target,
            total:
              Number(
                payment.total,
              ),
            currency:
              payment.currency,
            resolvedAt:
              now.toISOString(),
          };
        },
      );
  }

  private async pointRecord(
    executor: VeloraQueryExecutor,
    pointOfSaleId: string,
  ): Promise<PointRecord | null> {
    const rows =
      await executor
        .select(
          pointSelection,
        )
        .from(
          pointsOfSale,
        )
        .innerJoin(
          stores,
          eq(
            pointsOfSale.storeId,
            stores.id,
          ),
        )
        .innerJoin(
          warehouses,
          eq(
            pointsOfSale.warehouseId,
            warehouses.id,
          ),
        )
        .where(
          eq(
            pointsOfSale.id,
            pointOfSaleId,
          ),
        )
        .limit(1);

    return rows[0] ??
      null;
  }

  private async sessionHeader(
    executor: VeloraQueryExecutor,
    sessionId: string,
  ): Promise<SessionHeader | null> {
    const rows =
      await executor
        .select({
          id:
            cashSessions.id,
          sessionNumber:
            cashSessions.sessionNumber,
          pointOfSaleId:
            pointsOfSale.id,
          pointOfSaleCode:
            pointsOfSale.code,
          pointOfSaleName:
            pointsOfSale.name,
          pointOfSaleActive:
            pointsOfSale.active,
          storeId:
            stores.id,
          storeName:
            stores.name,
          storeCompanyId:
            stores.companyId,
          storeActive:
            stores.active,
          warehouseId:
            warehouses.id,
          warehouseName:
            warehouses.name,
          warehouseActive:
            warehouses.active,
          openedBy:
            cashSessions.openedBy,
          closedBy:
            cashSessions.closedBy,
          status:
            cashSessions.status,
          currency:
            cashSessions.currency,
          openingAmount:
            cashSessions.openingAmount,
          expectedCashAmount:
            cashSessions.expectedCashAmount,
          countedCashAmount:
            cashSessions.countedCashAmount,
          cashDifference:
            cashSessions.cashDifference,
          openingNotes:
            cashSessions.openingNotes,
          closingNotes:
            cashSessions.closingNotes,
          openedAt:
            cashSessions.openedAt,
          closedAt:
            cashSessions.closedAt,
          version:
            cashSessions.version,
        })
        .from(
          cashSessions,
        )
        .innerJoin(
          pointsOfSale,
          eq(
            cashSessions.pointOfSaleId,
            pointsOfSale.id,
          ),
        )
        .innerJoin(
          stores,
          eq(
            pointsOfSale.storeId,
            stores.id,
          ),
        )
        .innerJoin(
          warehouses,
          eq(
            pointsOfSale.warehouseId,
            warehouses.id,
          ),
        )
        .where(
          eq(
            cashSessions.id,
            sessionId,
          ),
        )
        .limit(1);

    return rows[0] ??
      null;
  }

  private async lockSession(
    tx: VeloraTransaction,
    sessionId: string,
  ): Promise<SessionHeader> {
    await tx.execute(
      sql`
        select id
        from cash_sessions
        where id =
          ${sessionId}::uuid
        for update
      `,
    );

    const session =
      await this.sessionHeader(
        tx,
        sessionId,
      );

    if (!session) {
      throw new ApiHttpError(
        404,
        "Sesión de caja no encontrada.",
      );
    }

    return session;
  }

  private async requireSessionResponse(
    sessionId: string,
  ): Promise<CashSessionResponse> {
    const session =
      await this.sessionHeader(
        this.database.db,
        sessionId,
      );

    if (!session) {
      throw new Error(
        "No se pudo recuperar la sesión de caja.",
      );
    }

    return {
      id:
        session.id,
      sessionNumber:
        session.sessionNumber,
      pointOfSaleId:
        session.pointOfSaleId,
      pointOfSaleCode:
        session.pointOfSaleCode,
      pointOfSaleName:
        session.pointOfSaleName,
      storeId:
        session.storeId,
      storeName:
        session.storeName,
      warehouseId:
        session.warehouseId,
      warehouseName:
        session.warehouseName,
      openedBy:
        session.openedBy,
      closedBy:
        session.closedBy,
      status:
        session.status,
      currency:
        session.currency,
      openingAmount:
        Number(
          session.openingAmount,
        ),
      expectedCashAmount:
        session.expectedCashAmount ===
          null
          ? null
          : Number(
              session.expectedCashAmount,
            ),
      countedCashAmount:
        session.countedCashAmount ===
          null
          ? null
          : Number(
              session.countedCashAmount,
            ),
      cashDifference:
        session.cashDifference ===
          null
          ? null
          : Number(
              session.cashDifference,
            ),
      openingNotes:
        session.openingNotes,
      closingNotes:
        session.closingNotes,
      openedAt:
        session.openedAt.toISOString(),
      closedAt:
        session.closedAt
          ?.toISOString() ??
        null,
      version:
        session.version,
    };
  }

  private async existingOperation(
    tx: VeloraTransaction,
    clientOperationId: string,
  ) {
    const rows =
      await tx
        .select({
          orderId:
            orders.id,
          orderChannel:
            orders.orderChannel,
          pointOfSaleId:
            orders.pointOfSaleId,
          cashSessionId:
            orders.cashSessionId,
          customerId:
            orders.customerId,
          storeId:
            stores.id,
          paymentId:
            payments.id,
          paymentMethod:
            payments.method,
        })
        .from(
          orders,
        )
        .innerJoin(
          warehouses,
          eq(
            orders.warehouseId,
            warehouses.id,
          ),
        )
        .innerJoin(
          stores,
          eq(
            warehouses.storeId,
            stores.id,
          ),
        )
        .leftJoin(
          payments,
          eq(
            payments.orderId,
            orders.id,
          ),
        )
        .where(
          eq(
            orders.clientOperationId,
            clientOperationId,
          ),
        )
        .orderBy(
          desc(
            payments.createdAt,
          ),
        )
        .limit(1);

    const row =
      rows[0];

    if (!row) {
      return null;
    }

    return {
      ...row,
      paymentMethod:
        row.paymentMethod ===
          "CASH" ||
        row.paymentMethod ===
          "CARD" ||
        row.paymentMethod ===
          "QR"
          ? row.paymentMethod
          : null,
    };
  }

  private async saleResponse(
    executor: VeloraQueryExecutor,
    orderId: string,
  ): Promise<PosSaleResponse | null> {
    const headers =
      await executor
        .select({
          orderId:
            orders.id,
          orderNumber:
            orders.orderNumber,
          clientOperationId:
            orders.clientOperationId,
          clientCreatedAt:
            orders.clientCreatedAt,
          syncedAt:
            orders.syncedAt,
          orderChannel:
            orders.orderChannel,
          orderStatus:
            orders.status,
          pointOfSaleId:
            pointsOfSale.id,
          pointOfSaleCode:
            pointsOfSale.code,
          cashSessionId:
            cashSessions.id,
          cashSessionNumber:
            cashSessions.sessionNumber,
          customerId:
            orders.customerId,
          paymentMethod:
            payments.method,
          paymentId:
            payments.id,
          paymentStatus:
            payments.status,
          currency:
            orders.currency,
          subtotal:
            orders.subtotal,
          total:
            orders.total,
          createdAt:
            orders.createdAt,
        })
        .from(
          orders,
        )
        .innerJoin(
          pointsOfSale,
          eq(
            orders.pointOfSaleId,
            pointsOfSale.id,
          ),
        )
        .innerJoin(
          cashSessions,
          eq(
            orders.cashSessionId,
            cashSessions.id,
          ),
        )
        .innerJoin(
          payments,
          eq(
            payments.orderId,
            orders.id,
          ),
        )
        .where(
          eq(
            orders.id,
            orderId,
          ),
        )
        .orderBy(
          desc(
            payments.createdAt,
          ),
        )
        .limit(1);

    const header =
      headers[0];

    if (
      !header ||
      header.orderChannel !==
        "POS" ||
      !header.clientOperationId ||
      !header.syncedAt ||
      (
        header.paymentMethod !==
          "CASH" &&
        header.paymentMethod !==
          "CARD" &&
        header.paymentMethod !==
          "QR"
      )
    ) {
      return null;
    }

    const items =
      await executor
        .select({
          id:
            orderItems.id,
          variantId:
            orderItems.variantId,
          productName:
            orderItems.productName,
          sku:
            orderItems.sku,
          size:
            orderItems.size,
          color:
            orderItems.color,
          unitPrice:
            orderItems.unitPrice,
          currency:
            orderItems.currency,
          quantity:
            orderItems.quantity,
          subtotal:
            orderItems.subtotal,
        })
        .from(
          orderItems,
        )
        .where(
          eq(
            orderItems.orderId,
            orderId,
          ),
        )
        .orderBy(
          asc(
            orderItems.productName,
          ),
          asc(
            orderItems.sku,
          ),
        );

    return {
      orderId:
        header.orderId,
      orderNumber:
        header.orderNumber,
      clientOperationId:
        header.clientOperationId,
      clientCreatedAt:
        header.clientCreatedAt
          ?.toISOString() ??
        null,
      syncedAt:
        header.syncedAt.toISOString(),
      orderChannel:
        "POS",
      orderStatus:
        header.orderStatus,
      pointOfSaleId:
        header.pointOfSaleId,
      pointOfSaleCode:
        header.pointOfSaleCode,
      cashSessionId:
        header.cashSessionId,
      cashSessionNumber:
        header.cashSessionNumber,
      customerId:
        header.customerId,
      paymentMethod:
        header.paymentMethod,
      paymentId:
        header.paymentId,
      paymentStatus:
        header.paymentStatus,
      currency:
        header.currency,
      subtotal:
        Number(
          header.subtotal,
        ),
      total:
        Number(
          header.total,
        ),
      createdAt:
        header.createdAt.toISOString(),
      items:
        items.map(
          (item) => ({
            id:
              item.id,
            variantId:
              item.variantId,
            productName:
              item.productName,
            sku:
              item.sku,
            size:
              item.size,
            color:
              item.color,
            unitPrice:
              Number(
                item.unitPrice,
              ),
            currency:
              item.currency,
            quantity:
              item.quantity,
            subtotal:
              Number(
                item.subtotal,
              ),
          }),
        ),
    };
  }

  private async requireSaleResponse(
    orderId: string,
  ): Promise<PosSaleResponse> {
    const sale =
      await this.saleResponse(
        this.database.db,
        orderId,
      );

    if (!sale) {
      throw new Error(
        "No se pudo recuperar la venta POS.",
      );
    }

    return sale;
  }

  private async paymentHeader(
    executor: VeloraQueryExecutor,
    paymentId: string,
  ): Promise<PosPaymentHeader | null> {
    const rows =
      await executor
        .select({
          paymentId:
            payments.id,
          paymentMethod:
            payments.method,
          paymentStatus:
            payments.status,
          orderId:
            orders.id,
          orderNumber:
            orders.orderNumber,
          orderStatus:
            orders.status,
          orderChannel:
            orders.orderChannel,
          total:
            orders.total,
          currency:
            orders.currency,
          pointOfSaleId:
            orders.pointOfSaleId,
          cashSessionId:
            orders.cashSessionId,
          warehouseId:
            orders.warehouseId,
          storeId:
            stores.id,
          cashSessionStatus:
            cashSessions.status,
        })
        .from(
          payments,
        )
        .innerJoin(
          orders,
          eq(
            payments.orderId,
            orders.id,
          ),
        )
        .innerJoin(
          warehouses,
          eq(
            orders.warehouseId,
            warehouses.id,
          ),
        )
        .innerJoin(
          stores,
          eq(
            warehouses.storeId,
            stores.id,
          ),
        )
        .leftJoin(
          cashSessions,
          eq(
            orders.cashSessionId,
            cashSessions.id,
          ),
        )
        .where(
          eq(
            payments.id,
            paymentId,
          ),
        )
        .limit(1);

    const row =
      rows[0];

    if (!row) {
      return null;
    }

    return row;
  }

  private async lockOrderStocks(
    tx: VeloraTransaction,
    warehouseId: string,
    lines:
      Array<{
        variantId: string;
        quantity: number;
      }>,
  ): Promise<Map<string, LockedStock>> {
    const result =
      new Map<
        string,
        LockedStock
      >();

    for (
      const line of
      lines
    ) {
      await tx.execute(
        sql`
          select id
          from inventory_stocks
          where warehouse_id =
            ${warehouseId}::uuid
            and variant_id =
              ${line.variantId}::uuid
          for update
        `,
      );

      const rows =
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
                warehouseId,
              ),
              eq(
                inventoryStocks.variantId,
                line.variantId,
              ),
            ),
          )
          .limit(1);

      const stock =
        rows[0];

      if (!stock) {
        throw new ApiHttpError(
          409,
          "No existe el stock asociado a la reserva POS.",
        );
      }

      if (
        stock.committedQuantity <
        line.quantity
      ) {
        throw new ApiHttpError(
          409,
          "La reserva de inventario POS es inconsistente.",
        );
      }

      result.set(
        line.variantId,
        stock,
      );
    }

    return result;
  }

  private requirePosPayment(
    actor: ActorAccessContext,
    payment: PosPaymentHeader,
  ): void {
    this.requireStoreAccess(
      actor,
      payment.storeId,
    );

    if (
      payment.orderChannel !==
        "POS" ||
      !payment.pointOfSaleId ||
      !payment.cashSessionId
    ) {
      throw new ApiHttpError(
        409,
        "El pago no pertenece a una venta POS.",
      );
    }
  }

  private requireOperationalPoint(
    point: PointRecord,
  ): void {
    if (!point.active) {
      throw new ApiHttpError(
        409,
        "El punto de venta está inactivo.",
      );
    }

    if (!point.storeActive) {
      throw new ApiHttpError(
        409,
        "La sucursal del punto de venta está inactiva.",
      );
    }

    if (!point.warehouseActive) {
      throw new ApiHttpError(
        409,
        "El almacén del punto de venta está inactivo.",
      );
    }
  }

  private requireOperationalActor(
    actor: ActorAccessContext,
  ): void {
    if (
      actor.role !==
        "ADMIN" &&
      actor.role !==
        "STORE_MANAGER"
    ) {
      throw new ApiHttpError(
        403,
        "El usuario no tiene permisos para operar POS.",
      );
    }
  }

  private requireAdmin(
    actor: ActorAccessContext,
  ): void {
    if (
      actor.role !==
      "ADMIN"
    ) {
      throw new ApiHttpError(
        403,
        "Se requiere rol ADMIN.",
      );
    }
  }

  private requireStoreAccess(
    actor: ActorAccessContext,
    storeId: string,
  ): void {
    if (
      actor.role ===
      "ADMIN"
    ) {
      return;
    }

    if (
      actor.role !==
      "STORE_MANAGER"
    ) {
      throw new ApiHttpError(
        403,
        "No tiene permisos para operar esta caja.",
      );
    }

    const managerStore =
      this.requireManagerStore(
        actor,
      );

    if (
      managerStore !==
      storeId
    ) {
      throw new ApiHttpError(
        403,
        "No puede operar un punto de venta de otra sucursal.",
      );
    }
  }

  private requireManagerStore(
    actor: ActorAccessContext,
  ): string {
    if (!actor.storeId) {
      throw new ApiHttpError(
        403,
        "El encargado no tiene una sucursal asignada.",
      );
    }

    return actor.storeId;
  }

  private requireCompanyId(
    companyId: string | null,
  ): string {
    if (!companyId) {
      throw new ApiHttpError(
        400,
        "companyId es obligatorio para ADMIN.",
      );
    }

    return companyId;
  }

  private toPointResponse(
    point: PointRecord,
  ): PointOfSaleResponse {
    return {
      id:
        point.id,
      storeId:
        point.storeId,
      storeName:
        point.storeName,
      warehouseId:
        point.warehouseId,
      warehouseName:
        point.warehouseName,
      code:
        point.code,
      name:
        point.name,
      active:
        point.active,
      createdAt:
        point.createdAt.toISOString(),
      updatedAt:
        point.updatedAt.toISOString(),
    };
  }

  private toMovementResponse(
    movement: {
      id: string;
      cashSessionId: string;
      movementType:
        "CASH_IN" |
        "CASH_OUT";
      amount: string;
      reason: string;
      createdBy: string;
      createdAt: Date;
    },
  ): CashMovementResponse {
    return {
      id:
        movement.id,
      cashSessionId:
        movement.cashSessionId,
      movementType:
        movement.movementType,
      amount:
        Number(
          movement.amount,
        ),
      reason:
        movement.reason,
      createdBy:
        movement.createdBy,
      createdAt:
        movement.createdAt.toISOString(),
    };
  }

  private normalizeCode(
    code: string,
  ): string {
    return code
      .trim()
      .toUpperCase();
  }

  private trimToNull(
    value:
      string |
      null |
      undefined,
  ): string | null {
    const trimmed =
      value?.trim();

    return trimmed
      ? trimmed
      : null;
  }

  private reasonOrFallback(
    value:
      string |
      null |
      undefined,
    fallback: string,
  ): string {
    return this.trimToNull(
      value,
    ) ??
      fallback;
  }

  private generateSessionNumber(): string {
    const date =
      new Date()
        .toISOString()
        .slice(0, 10)
        .replaceAll(
          "-",
          "",
        );

    return (
      "CS-" +
      date +
      "-" +
      randomUUID()
        .replaceAll(
          "-",
          "",
        )
        .slice(0, 12)
        .toUpperCase()
    );
  }

  private generateOrderNumber(): string {
    const date =
      new Date()
        .toISOString()
        .slice(0, 10)
        .replaceAll(
          "-",
          "",
        );

    return (
      "VEL-POS-" +
      date +
      "-" +
      randomUUID()
        .replaceAll(
          "-",
          "",
        )
        .slice(0, 12)
        .toUpperCase()
    );
  }
}

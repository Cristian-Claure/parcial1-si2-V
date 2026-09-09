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
  PaymentHistoryResponse,
  PaymentMethod,
  PaymentResponse,
  PaymentStatus,
} from "@velora/contracts";

import {
  appUsers,
  orders,
  payments,
  paymentStatusHistory,
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

import type {
  StripeCheckoutInput,
  StripeCheckoutSession,
  StripePaymentSnapshot,
} from "./stripe-gateway.service.js";

type VeloraTransaction =
  Parameters<
    Parameters<
      VeloraDatabaseClient["db"]["transaction"]
    >[0]
  >[0];

interface LockedOrder {
  id:
    string;

  orderNumber:
    string;

  customerId:
    string |
    null;

  warehouseId:
    string;

  storeId:
    string;

  storeName:
    string;

  status:
    "RESERVED" |
    "CANCELLED" |
    "FULFILLED";

  total:
    string;

  currency:
    string;
}

interface LockedPayment
  extends StripePaymentSnapshot {
  status:
    PaymentStatus;

  createdBy:
    string;
}

@Injectable()
export class PaymentsRepository {
  constructor(
    private readonly database:
      DatabaseService,
  ) {}

  async create(
    customerId:
      string,
    orderId:
      string,
    method:
      PaymentMethod,
    notes:
      string |
      null,
  ): Promise<string> {
    return this.database.db
      .transaction(
        async (tx) => {
          const order =
            await this.lockOrder(
              tx,
              orderId,
            );

          if (
            !order ||
            order.customerId !==
              customerId
          ) {
            throw new ApiHttpError(
              404,
              "Pedido no encontrado.",
            );
          }

          this.requireReservedForPayment(
            order,
          );

          await this.ensureNoActivePayment(
            tx,
            order.id,
          );

          const paymentId =
            randomUUID();

          const now =
            new Date();

          await tx
            .insert(
              payments,
            )
            .values({
              id:
                paymentId,

              orderId:
                order.id,

              method,

              status:
                "PENDING",

              amount:
                order.total,

              currency:
                order.currency,

              provider:
                null,

              externalReference:
                null,

              notes,

              createdBy:
                customerId,

              processedBy:
                null,

              paidAt:
                null,

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

          await this.addHistory(
            tx,
            paymentId,
            null,
            "PENDING",
            customerId,
            "Pago iniciado por el cliente.",
            now,
          );

          return paymentId;
        },
      );
  }

  async createStripeCheckout(
    customerId:
      string,
    orderId:
      string,
    createSession:
      (
        input:
          StripeCheckoutInput,
      ) =>
        Promise<StripeCheckoutSession>,
  ): Promise<{
    paymentId:
      string;

    session:
      StripeCheckoutSession;
  }> {
    return this.database.db
      .transaction(
        async (tx) => {
          const order =
            await this.lockOrder(
              tx,
              orderId,
            );

          if (
            !order ||
            order.customerId !==
              customerId
          ) {
            throw new ApiHttpError(
              404,
              "Pedido no encontrado.",
            );
          }

          this.requireReservedForPayment(
            order,
          );

          await this.ensureNoActivePayment(
            tx,
            order.id,
          );

          const paymentId =
            randomUUID();

          const now =
            new Date();

          await tx
            .insert(
              payments,
            )
            .values({
              id:
                paymentId,

              orderId:
                order.id,

              method:
                "WEB",

              status:
                "PENDING",

              amount:
                order.total,

              currency:
                order.currency,

              provider:
                null,

              externalReference:
                null,

              notes:
                "Pago online mediante Stripe Checkout.",

              createdBy:
                customerId,

              processedBy:
                null,

              paidAt:
                null,

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

          await this.addHistory(
            tx,
            paymentId,
            null,
            "PENDING",
            customerId,
            "Pago iniciado por el cliente.",
            now,
          );

          const session =
            await createSession({
              paymentId,

              orderId:
                order.id,

              orderNumber:
                order.orderNumber,

              storeName:
                order.storeName,

              amount:
                order.total,

              currency:
                order.currency,
            });

          await tx
            .update(
              payments,
            )
            .set({
              provider:
                "STRIPE",

              externalReference:
                session.id,

              updatedAt:
                new Date(),
            })
            .where(
              eq(
                payments.id,
                paymentId,
              ),
            );

          return {
            paymentId,
            session,
          };
        },
      );
  }

  async listForCustomerOrder(
    customerId:
      string,
    orderId:
      string,
  ): Promise<
    PaymentResponse[]
  > {
    const owned =
      await this.database.db
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
              orders.id,
              orderId,
            ),
            eq(
              orders.customerId,
              customerId,
            ),
          ),
        )
        .limit(1);

    if (
      !owned[0]
    ) {
      throw new ApiHttpError(
        404,
        "Pedido no encontrado.",
      );
    }

    const rows =
      await this.database.db
        .select({
          id:
            payments.id,
        })
        .from(
          payments,
        )
        .where(
          eq(
            payments.orderId,
            orderId,
          ),
        )
        .orderBy(
          desc(
            payments.createdAt,
          ),
        );

    const result:
      PaymentResponse[] =
      [];

    for (
      const row of
      rows
    ) {
      const payment =
        await this.responseById(
          row.id,
          customerId,
        );

      if (payment) {
        result.push(
          payment,
        );
      }
    }

    return result;
  }

  async getForCustomer(
    customerId:
      string,
    paymentId:
      string,
  ): Promise<
    PaymentResponse |
    null
  > {
    return this.responseById(
      paymentId,
      customerId,
    );
  }

  async get(
    paymentId:
      string,
  ): Promise<
    PaymentResponse |
    null
  > {
    return this.responseById(
      paymentId,
      null,
    );
  }

  async historyForCustomer(
    customerId:
      string,
    paymentId:
      string,
  ): Promise<
    PaymentHistoryResponse[]
  > {
    const owned =
      await this.getForCustomer(
        customerId,
        paymentId,
      );

    if (!owned) {
      throw new ApiHttpError(
        404,
        "Pago no encontrado.",
      );
    }

    const rows =
      await this.database.db
        .select({
          id:
            paymentStatusHistory.id,

          fromStatus:
            paymentStatusHistory.fromStatus,

          toStatus:
            paymentStatusHistory.toStatus,

          changedById:
            paymentStatusHistory.changedBy,

          firstName:
            appUsers.firstName,

          lastName:
            appUsers.lastName,

          reason:
            paymentStatusHistory.reason,

          createdAt:
            paymentStatusHistory.createdAt,
        })
        .from(
          paymentStatusHistory,
        )
        .innerJoin(
          appUsers,
          eq(
            paymentStatusHistory.changedBy,
            appUsers.id,
          ),
        )
        .where(
          eq(
            paymentStatusHistory.paymentId,
            paymentId,
          ),
        )
        .orderBy(
          asc(
            paymentStatusHistory.createdAt,
          ),
        );

    return rows.map(
      (row) => ({
        id:
          row.id,

        fromStatus:
          row.fromStatus,

        toStatus:
          row.toStatus,

        changedById:
          row.changedById,

        changedByName:
          `${row.firstName} ${row.lastName}`,

        reason:
          row.reason,

        createdAt:
          row.createdAt
            .toISOString(),
      }),
    );
  }

  async confirm(
    actor:
      ActorAccessContext,
    paymentId:
      string,
    reason:
      string,
  ): Promise<string> {
    return this.database.db
      .transaction(
        async (tx) => {
          const initial =
            await this.initialPayment(
              tx,
              paymentId,
            );

          if (!initial) {
            throw new ApiHttpError(
              404,
              "Pago no encontrado.",
            );
          }

          this.requireStoreAccess(
            actor,
            initial.storeId,
          );

          const order =
            await this.lockOrder(
              tx,
              initial.orderId,
            );

          if (!order) {
            throw new ApiHttpError(
              404,
              "Pedido no encontrado.",
            );
          }

          this.requireStoreAccess(
            actor,
            order.storeId,
          );

          if (
            order.status ===
            "CANCELLED"
          ) {
            throw new ApiHttpError(
              409,
              "No puede confirmarse un pago de un pedido cancelado.",
            );
          }

          const payment =
            await this.lockPayment(
              tx,
              paymentId,
            );

          this.requireMatchingOrder(
            payment,
            order.id,
          );

          if (
            payment.status !==
            "PENDING"
          ) {
            throw new ApiHttpError(
              409,
              "Solo pueden confirmarse pagos pendientes.",
            );
          }

          if (
            this.isStripe(
              payment,
            )
          ) {
            throw new ApiHttpError(
              409,
              "Los pagos Stripe se confirman exclusivamente mediante webhook firmado.",
            );
          }

          const paid =
            await tx
              .select({
                id:
                  payments.id,
              })
              .from(
                payments,
              )
              .where(
                and(
                  eq(
                    payments.orderId,
                    order.id,
                  ),
                  eq(
                    payments.status,
                    "PAID",
                  ),
                ),
              )
              .limit(1);

          if (
            paid[0]
          ) {
            throw new ApiHttpError(
              409,
              "El pedido ya tiene un pago confirmado.",
            );
          }

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
                payment.id,
              ),
            );

          await this.addHistory(
            tx,
            payment.id,
            "PENDING",
            "PAID",
            actor.userId,
            reason,
            now,
          );

          return payment.id;
        },
      );
  }

  async fail(
    actor:
      ActorAccessContext,
    paymentId:
      string,
    reason:
      string,
  ): Promise<string> {
    return this.database.db
      .transaction(
        async (tx) => {
          const initial =
            await this.initialPayment(
              tx,
              paymentId,
            );

          if (!initial) {
            throw new ApiHttpError(
              404,
              "Pago no encontrado.",
            );
          }

          this.requireStoreAccess(
            actor,
            initial.storeId,
          );

          const order =
            await this.lockOrder(
              tx,
              initial.orderId,
            );

          if (!order) {
            throw new ApiHttpError(
              404,
              "Pedido no encontrado.",
            );
          }

          this.requireStoreAccess(
            actor,
            order.storeId,
          );

          if (
            order.status !==
            "RESERVED"
          ) {
            throw new ApiHttpError(
              409,
              "Solo pueden marcarse como fallidos pagos de pedidos reservados.",
            );
          }

          const payment =
            await this.lockPayment(
              tx,
              paymentId,
            );

          this.requireMatchingOrder(
            payment,
            order.id,
          );

          if (
            payment.status !==
            "PENDING"
          ) {
            throw new ApiHttpError(
              409,
              "Solo pueden marcarse como fallidos pagos pendientes.",
            );
          }

          if (
            this.isStripe(
              payment,
            )
          ) {
            throw new ApiHttpError(
              409,
              "Los pagos Stripe cambian a fallido únicamente mediante eventos firmados de Stripe.",
            );
          }

          const now =
            new Date();

          await tx
            .update(
              payments,
            )
            .set({
              status:
                "FAILED",

              processedBy:
                actor.userId,

              failedAt:
                now,

              updatedAt:
                now,
            })
            .where(
              eq(
                payments.id,
                payment.id,
              ),
            );

          await this.addHistory(
            tx,
            payment.id,
            "PENDING",
            "FAILED",
            actor.userId,
            reason,
            now,
          );

          return payment.id;
        },
      );
  }

  async cancelPending(
    customerId:
      string,
    paymentId:
      string,
    reason:
      string,
    beforeTransition:
      (
        payment:
          StripePaymentSnapshot,
      ) =>
        Promise<void>,
  ): Promise<string> {
    return this.database.db
      .transaction(
        async (tx) => {
          const initial =
            await this.initialCustomerPayment(
              tx,
              paymentId,
              customerId,
            );

          if (!initial) {
            throw new ApiHttpError(
              404,
              "Pago no encontrado.",
            );
          }

          const order =
            await this.lockOrder(
              tx,
              initial.orderId,
            );

          if (
            !order ||
            order.customerId !==
              customerId
          ) {
            throw new ApiHttpError(
              404,
              "Pago no encontrado.",
            );
          }

          if (
            order.status !==
            "RESERVED"
          ) {
            throw new ApiHttpError(
              409,
              "Solo pueden cancelarse pagos de pedidos reservados.",
            );
          }

          const payment =
            await this.lockPayment(
              tx,
              paymentId,
            );

          this.requireMatchingOrder(
            payment,
            order.id,
          );

          if (
            payment.status !==
            "PENDING"
          ) {
            throw new ApiHttpError(
              409,
              "Solo pueden cancelarse pagos pendientes.",
            );
          }

          await beforeTransition(
            payment,
          );

          const now =
            new Date();

          await tx
            .update(
              payments,
            )
            .set({
              status:
                "CANCELLED",

              processedBy:
                customerId,

              cancelledAt:
                now,

              updatedAt:
                now,
            })
            .where(
              eq(
                payments.id,
                payment.id,
              ),
            );

          await this.addHistory(
            tx,
            payment.id,
            "PENDING",
            "CANCELLED",
            customerId,
            reason,
            now,
          );

          return payment.id;
        },
      );
  }

  async refund(
    actor:
      ActorAccessContext,
    paymentId:
      string,
    reason:
      string,
    beforeTransition:
      (
        payment:
          StripePaymentSnapshot,
      ) =>
        Promise<
          string |
          null
        >,
  ): Promise<string> {
    return this.database.db
      .transaction(
        async (tx) => {
          const initial =
            await this.initialPayment(
              tx,
              paymentId,
            );

          if (!initial) {
            throw new ApiHttpError(
              404,
              "Pago no encontrado.",
            );
          }

          this.requireStoreAccess(
            actor,
            initial.storeId,
          );

          const order =
            await this.lockOrder(
              tx,
              initial.orderId,
            );

          if (!order) {
            throw new ApiHttpError(
              404,
              "Pedido no encontrado.",
            );
          }

          this.requireStoreAccess(
            actor,
            order.storeId,
          );

          if (
            order.status !==
            "RESERVED"
          ) {
            throw new ApiHttpError(
              409,
              "Solo pueden reembolsarse pagos antes de la entrega del pedido.",
            );
          }

          const payment =
            await this.lockPayment(
              tx,
              paymentId,
            );

          this.requireMatchingOrder(
            payment,
            order.id,
          );

          if (
            payment.status !==
            "PAID"
          ) {
            throw new ApiHttpError(
              409,
              "Solo pueden reembolsarse pagos confirmados.",
            );
          }

          const stripeRefundId =
            await beforeTransition(
              payment,
            );

          const finalReason =
            stripeRefundId
              ? reason +
                " Referencia Stripe: " +
                stripeRefundId +
                "."
              : reason;

          const now =
            new Date();

          await tx
            .update(
              payments,
            )
            .set({
              status:
                "REFUNDED",

              processedBy:
                actor.userId,

              refundedAt:
                now,

              updatedAt:
                now,
            })
            .where(
              eq(
                payments.id,
                payment.id,
              ),
            );

          await this.addHistory(
            tx,
            payment.id,
            "PAID",
            "REFUNDED",
            actor.userId,
            finalReason,
            now,
          );

          return payment.id;
        },
      );
  }

  async stripePaid(
    sessionId:
      string,
    reason:
      string,
  ): Promise<void> {
    await this.stripeTransition(
      sessionId,
      "PAID",
      reason,
    );
  }

  async stripeFailed(
    sessionId:
      string,
    reason:
      string,
  ): Promise<void> {
    await this.stripeTransition(
      sessionId,
      "FAILED",
      reason,
    );
  }

  private async stripeTransition(
    sessionId:
      string,
    target:
      "PAID" |
      "FAILED",
    reason:
      string,
  ): Promise<void> {
    await this.database.db
      .transaction(
        async (tx) => {
          await tx.execute(
            sql`
              select id
              from payments
              where provider =
                'STRIPE'
                and external_reference =
                  ${sessionId}
              for update
            `,
          );

          const rows =
            await tx
              .select({
                id:
                  payments.id,

                status:
                  payments.status,

                createdBy:
                  payments.createdBy,
              })
              .from(
                payments,
              )
              .where(
                and(
                  eq(
                    payments.provider,
                    "STRIPE",
                  ),
                  eq(
                    payments.externalReference,
                    sessionId,
                  ),
                ),
              )
              .limit(1);

          const payment =
            rows[0];

          if (!payment) {
            throw new ApiHttpError(
              404,
              "Pago Stripe no encontrado.",
            );
          }

          if (
            target ===
              "PAID" &&
            payment.status ===
              "PAID"
          ) {
            return;
          }

          if (
            payment.status !==
            "PENDING"
          ) {
            return;
          }

          const now =
            new Date();

          await tx
            .update(
              payments,
            )
            .set({
              status:
                target,

              processedBy:
                payment.createdBy,

              paidAt:
                target ===
                  "PAID"
                  ? now
                  : null,

              failedAt:
                target ===
                  "FAILED"
                  ? now
                  : null,

              updatedAt:
                now,
            })
            .where(
              eq(
                payments.id,
                payment.id,
              ),
            );

          await this.addHistory(
            tx,
            payment.id,
            "PENDING",
            target,
            payment.createdBy,
            reason,
            now,
          );
        },
      );
  }

  private async responseById(
    paymentId:
      string,
    customerId:
      string |
      null,
  ): Promise<
    PaymentResponse |
    null
  > {
    const condition =
      customerId
        ? and(
            eq(
              payments.id,
              paymentId,
            ),
            eq(
              orders.customerId,
              customerId,
            ),
          )
        : eq(
            payments.id,
            paymentId,
          );

    const rows =
      await this.database.db
        .select({
          id:
            payments.id,

          orderId:
            payments.orderId,

          orderNumber:
            orders.orderNumber,

          storeId:
            stores.id,

          storeName:
            stores.name,

          method:
            payments.method,

          status:
            payments.status,

          amount:
            payments.amount,

          currency:
            payments.currency,

          provider:
            payments.provider,

          externalReference:
            payments.externalReference,

          notes:
            payments.notes,

          processedById:
            payments.processedBy,

          processedFirstName:
            appUsers.firstName,

          processedLastName:
            appUsers.lastName,

          createdAt:
            payments.createdAt,

          paidAt:
            payments.paidAt,

          failedAt:
            payments.failedAt,

          cancelledAt:
            payments.cancelledAt,

          refundedAt:
            payments.refundedAt,
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
          appUsers,
          eq(
            payments.processedBy,
            appUsers.id,
          ),
        )
        .where(
          condition,
        )
        .limit(1);

    const row =
      rows[0];

    if (!row) {
      return null;
    }

    return {
      id:
        row.id,

      orderId:
        row.orderId,

      orderNumber:
        row.orderNumber,

      storeId:
        row.storeId,

      storeName:
        row.storeName,

      method:
        row.method,

      status:
        row.status,

      amount:
        Number(
          row.amount,
        ),

      currency:
        row.currency,

      provider:
        row.provider,

      externalReference:
        row.externalReference,

      notes:
        row.notes,

      processedById:
        row.processedById,

      processedByName:
        row.processedById &&
        row.processedFirstName &&
        row.processedLastName
          ? `${row.processedFirstName} ${row.processedLastName}`
          : null,

      createdAt:
        row.createdAt
          .toISOString(),

      paidAt:
        row.paidAt
          ?.toISOString() ??
        null,

      failedAt:
        row.failedAt
          ?.toISOString() ??
        null,

      cancelledAt:
        row.cancelledAt
          ?.toISOString() ??
        null,

      refundedAt:
        row.refundedAt
          ?.toISOString() ??
        null,
    };
  }

  private async initialPayment(
    tx:
      VeloraTransaction,
    paymentId:
      string,
  ): Promise<
    {
      orderId:
        string;

      storeId:
        string;
    } |
    null
  > {
    const rows =
      await tx
        .select({
          orderId:
            payments.orderId,

          storeId:
            stores.id,
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
        .where(
          eq(
            payments.id,
            paymentId,
          ),
        )
        .limit(1);

    return rows[0] ??
      null;
  }

  private async initialCustomerPayment(
    tx:
      VeloraTransaction,
    paymentId:
      string,
    customerId:
      string,
  ): Promise<
    {
      orderId:
        string;
    } |
    null
  > {
    const rows =
      await tx
        .select({
          orderId:
            payments.orderId,
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
              payments.id,
              paymentId,
            ),
            eq(
              orders.customerId,
              customerId,
            ),
          ),
        )
        .limit(1);

    return rows[0] ??
      null;
  }

  private async lockOrder(
    tx:
      VeloraTransaction,
    orderId:
      string,
  ): Promise<
    LockedOrder |
    null
  > {
    await tx.execute(
      sql`
        select id
        from orders
        where id =
          ${orderId}::uuid
        for update
      `,
    );

    const rows =
      await tx
        .select({
          id:
            orders.id,

          orderNumber:
            orders.orderNumber,

          customerId:
            orders.customerId,

          warehouseId:
            orders.warehouseId,

          storeId:
            stores.id,

          storeName:
            stores.name,

          status:
            orders.status,

          total:
            orders.total,

          currency:
            orders.currency,
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
        .where(
          eq(
            orders.id,
            orderId,
          ),
        )
        .limit(1);

    return rows[0] ??
      null;
  }

  private async lockPayment(
    tx:
      VeloraTransaction,
    paymentId:
      string,
  ): Promise<LockedPayment> {
    await tx.execute(
      sql`
        select id
        from payments
        where id =
          ${paymentId}::uuid
        for update
      `,
    );

    const rows =
      await tx
        .select({
          id:
            payments.id,

          orderId:
            payments.orderId,

          provider:
            payments.provider,

          externalReference:
            payments.externalReference,

          status:
            payments.status,

          createdBy:
            payments.createdBy,
        })
        .from(
          payments,
        )
        .where(
          eq(
            payments.id,
            paymentId,
          ),
        )
        .limit(1);

    const payment =
      rows[0];

    if (!payment) {
      throw new ApiHttpError(
        404,
        "Pago no encontrado.",
      );
    }

    return payment;
  }

  private async ensureNoActivePayment(
    tx:
      VeloraTransaction,
    orderId:
      string,
  ): Promise<void> {
    const paid =
      await tx
        .select({
          id:
            payments.id,
        })
        .from(
          payments,
        )
        .where(
          and(
            eq(
              payments.orderId,
              orderId,
            ),
            eq(
              payments.status,
              "PAID",
            ),
          ),
        )
        .limit(1);

    if (
      paid[0]
    ) {
      throw new ApiHttpError(
        409,
        "El pedido ya tiene un pago confirmado.",
      );
    }

    const pending =
      await tx
        .select({
          id:
            payments.id,
        })
        .from(
          payments,
        )
        .where(
          and(
            eq(
              payments.orderId,
              orderId,
            ),
            eq(
              payments.status,
              "PENDING",
            ),
          ),
        )
        .limit(1);

    if (
      pending[0]
    ) {
      throw new ApiHttpError(
        409,
        "El pedido ya tiene un pago pendiente.",
      );
    }
  }

  private async addHistory(
    tx:
      VeloraTransaction,
    paymentId:
      string,
    fromStatus:
      PaymentStatus |
      null,
    toStatus:
      PaymentStatus,
    changedBy:
      string,
    reason:
      string,
    createdAt:
      Date,
  ): Promise<void> {
    await tx
      .insert(
        paymentStatusHistory,
      )
      .values({
        id:
          randomUUID(),

        paymentId,

        fromStatus,

        toStatus,

        changedBy,

        reason,

        createdAt,
      });
  }

  private requireReservedForPayment(
    order:
      LockedOrder,
  ): void {
    if (
      order.status !==
      "RESERVED"
    ) {
      throw new ApiHttpError(
        409,
        "Solo pueden iniciarse pagos para pedidos reservados.",
      );
    }
  }

  private requireMatchingOrder(
    payment:
      LockedPayment,
    orderId:
      string,
  ): void {
    if (
      payment.orderId !==
      orderId
    ) {
      throw new ApiHttpError(
        409,
        "El pago no corresponde al pedido bloqueado.",
      );
    }
  }

  private requireStoreAccess(
    actor:
      ActorAccessContext,
    orderStoreId:
      string,
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
        "No tiene permisos para procesar pagos.",
      );
    }

    if (
      !actor.storeId
    ) {
      throw new ApiHttpError(
        403,
        "El encargado no tiene una sucursal asignada.",
      );
    }

    if (
      actor.storeId !==
      orderStoreId
    ) {
      throw new ApiHttpError(
        403,
        "No puede procesar pagos de otra sucursal.",
      );
    }
  }

  private isStripe(
    payment:
      StripePaymentSnapshot,
  ): boolean {
    return (
      payment.provider
        ?.trim()
        .toUpperCase() ===
        "STRIPE" &&
      Boolean(
        payment.externalReference
          ?.trim(),
      )
    );
  }
}

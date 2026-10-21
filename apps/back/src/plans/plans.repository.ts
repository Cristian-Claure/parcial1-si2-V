import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { companies, payments, paymentStatusHistory, plans, products, stores, subscriptions, type PlanRow, type SubscriptionRow } from "@velora/database";
import { DatabaseService } from "../database/database.service.js";

export type SubscriptionStatusValue = SubscriptionRow["status"];

type Transaction = Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0];

export interface SubscriptionPaymentInput {
  amount: number;
  currency: string;
  provider: string;
  externalReference: string;
  notes: string;
}

/** Zona horaria de negocio para "mes calendario" (cuota del probador). */
export const BUSINESS_TIME_ZONE = "America/La_Paz";

@Injectable()
export class PlansRepository {
  constructor(private readonly database: DatabaseService) {}

  listActivePlans(): Promise<PlanRow[]> {
    return this.database.db.select().from(plans).where(eq(plans.active, true)).orderBy(asc(plans.sortOrder));
  }

  async planByCode(code: string): Promise<PlanRow | null> {
    const rows = await this.database.db.select().from(plans).where(eq(plans.code, code)).limit(1);
    return rows[0] ?? null;
  }

  async planById(id: string): Promise<PlanRow | null> {
    const rows = await this.database.db.select().from(plans).where(eq(plans.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async companyOwner(companyId: string): Promise<string | null> {
    const rows = await this.database.db.select({ ownerUserId: companies.ownerUserId }).from(companies).where(eq(companies.id, companyId)).limit(1);
    return rows[0]?.ownerUserId ?? null;
  }

  /** Suscripción vigente (no cancelada): primero la de la compañía (plan por compañía), luego la de la cuenta. */
  async currentSubscription(ownerUserId: string, companyId: string | null): Promise<SubscriptionRow | null> {
    if (companyId) {
      const byCompany = await this.database.db.select().from(subscriptions)
        .where(and(eq(subscriptions.companyId, companyId), ne(subscriptions.status, "CANCELLED"))).limit(1);
      if (byCompany[0]) return byCompany[0];
    }
    const byOwner = await this.database.db.select().from(subscriptions)
      .where(and(eq(subscriptions.ownerUserId, ownerUserId), isNull(subscriptions.companyId), ne(subscriptions.status, "CANCELLED"))).limit(1);
    return byOwner[0] ?? null;
  }

  /** Vencimiento perezoso (sin cron): solo cambia si sigue vigente y ya venció. */
  async markPastDue(subscriptionId: string, now: Date): Promise<void> {
    await this.database.db.update(subscriptions).set({ status: "PAST_DUE", updatedAt: now }).where(and(
      eq(subscriptions.id, subscriptionId),
      inArray(subscriptions.status, ["ACTIVE", "TRIAL"]),
      sql`${subscriptions.currentPeriodEnd} is not null and ${subscriptions.currentPeriodEnd} <= ${now}`,
    ));
  }

  /**
   * Cambia (o crea) la suscripción de la cuenta y, si hubo cobro, registra el pago en
   * `payments` con subscription_id (V30) en la MISMA transacción.
   */
  async changeOwnerPlan(input: { ownerUserId: string; planId: string; status: SubscriptionStatusValue; periodStart: Date; periodEnd: Date | null; payment?: SubscriptionPaymentInput | null }): Promise<SubscriptionRow> {
    return this.database.db.transaction(async (tx) => {
      const saved = await this.upsertOwnerSubscription(tx, input);
      if (input.payment) await this.insertSubscriptionPayment(tx, saved.id, input.ownerUserId, input.payment);
      return saved;
    });
  }

  async insertSubscriptionPayment(tx: Transaction, subscriptionId: string, ownerUserId: string, payment: SubscriptionPaymentInput): Promise<void> {
    const now = new Date();
    const id = randomUUID();
    await tx.insert(payments).values({
      id, orderId: null, subscriptionId, method: "CARD", status: "PAID", amount: payment.amount.toFixed(2), currency: payment.currency,
      provider: payment.provider, externalReference: payment.externalReference, notes: payment.notes,
      createdBy: ownerUserId, processedBy: ownerUserId, paidAt: now, failedAt: null, cancelledAt: null, refundedAt: null,
      createdAt: now, updatedAt: now,
    });
    await tx.insert(paymentStatusHistory).values({ id: randomUUID(), paymentId: id, fromStatus: null, toStatus: "PAID", changedBy: ownerUserId, reason: payment.notes, createdAt: now });
  }

  async upsertOwnerSubscription(tx: Transaction, input: { ownerUserId: string; planId: string; status: SubscriptionStatusValue; periodStart: Date; periodEnd: Date | null }): Promise<SubscriptionRow> {
    const now = new Date();
    const current = await tx.select().from(subscriptions)
      .where(and(eq(subscriptions.ownerUserId, input.ownerUserId), isNull(subscriptions.companyId), ne(subscriptions.status, "CANCELLED")))
      .for("update").limit(1);
    if (current[0]) {
      const rows = await tx.update(subscriptions).set({
        planId: input.planId, status: input.status, currentPeriodStart: input.periodStart, currentPeriodEnd: input.periodEnd,
        grandfathered: false, updatedAt: now,
      }).where(eq(subscriptions.id, current[0].id)).returning();
      return rows[0]!;
    }
    const rows = await tx.insert(subscriptions).values({
      id: randomUUID(), ownerUserId: input.ownerUserId, companyId: null, planId: input.planId, status: input.status,
      currentPeriodStart: input.periodStart, currentPeriodEnd: input.periodEnd, grandfathered: false, cancelledAt: null,
      createdAt: now, updatedAt: now,
    }).returning();
    return rows[0]!;
  }

  async ownedCompanies(ownerUserId: string): Promise<{ id: string; name: string }[]> {
    return this.database.db.select({ id: companies.id, name: companies.name }).from(companies)
      .where(and(eq(companies.ownerUserId, ownerUserId), eq(companies.active, true))).orderBy(asc(companies.name));
  }

  async activeStoreCount(companyId: string): Promise<number> {
    const rows = await this.database.db.select({ total: sql<number>`count(*)::int` }).from(stores)
      .where(and(eq(stores.companyId, companyId), eq(stores.active, true)));
    return Number(rows[0]?.total ?? 0);
  }

  /** Productos que ocupan cupo: todos salvo los INACTIVE (archivados liberan cupo). */
  async productCount(companyId: string): Promise<number> {
    const rows = await this.database.db.select({ total: sql<number>`count(*)::int` }).from(products)
      .where(and(eq(products.companyId, companyId), ne(products.status, "INACTIVE")));
    return Number(rows[0]?.total ?? 0);
  }

  /** Pruebas del probador del cliente en la compañía durante el mes calendario en curso (sin fallidas/canceladas). */
  async tryOnUsesThisMonth(customerId: string, companyId: string): Promise<number> {
    const result = await this.database.db.execute(sql`
      select count(*)::int as total
      from try_on_jobs j
      inner join products p on p.id = j.product_id
      where j.user_id = ${customerId}::uuid
        and p.company_id = ${companyId}::uuid
        and j.status not in ('FAILED', 'CANCELLED')
        and j.created_at >= (date_trunc('month', now() at time zone ${BUSINESS_TIME_ZONE}) at time zone ${BUSINESS_TIME_ZONE})
    `);
    return Number((result.rows[0] as { total?: number } | undefined)?.total ?? 0);
  }

  /** Monto de pedidos FULFILLED del cliente en la compañía dentro de la ventana (días). */
  async fulfilledAmount(customerId: string, companyId: string, windowDays: number): Promise<number> {
    const result = await this.database.db.execute(sql`
      select coalesce(sum(o.total), 0)::numeric as total
      from orders o
      inner join warehouses w on w.id = o.warehouse_id
      inner join stores s on s.id = w.store_id
      where o.customer_id = ${customerId}::uuid
        and s.company_id = ${companyId}::uuid
        and o.status = 'FULFILLED'
        and coalesce(o.fulfilled_at, o.created_at) >= now() - make_interval(days => ${windowDays}::int)
    `);
    return Number((result.rows[0] as { total?: string | number } | undefined)?.total ?? 0);
  }
}

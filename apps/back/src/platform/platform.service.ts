import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { appUsers, companies, plans, subscriptions } from "@velora/database";
import type {
  AdminPlanResponse, PlatformAdjustSubscriptionRequest, PlatformCompany, PlatformOwner, PlatformSubscription,
} from "@velora/contracts";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { DatabaseService } from "../database/database.service.js";
import { PlanLimitsService } from "../plans/plan-limits.service.js";

/** Operaciones de soporte de la plataforma (solo PLATFORM_ADMIN; sin restricción de tenant). */
@Injectable()
export class PlatformService {
  constructor(private readonly database: DatabaseService, private readonly limits: PlanLimitsService) {}

  async owners(): Promise<PlatformOwner[]> {
    const result = await this.database.db.execute(sql`
      select u.id, u.email, u.first_name, u.last_name, u.status, u.created_at,
        (select count(*)::int from companies c where c.owner_user_id = u.id) as companies,
        p.code as plan_code, s.status as subscription_status
      from app_users u
      left join subscriptions s on s.owner_user_id = u.id and s.company_id is null and s.status <> 'CANCELLED'
      left join plans p on p.id = s.plan_id
      where u.role = 'ADMIN'
      order by u.created_at
    `);
    return (result.rows as Record<string, unknown>[]).map((row) => ({
      id: String(row.id), email: String(row.email), firstName: String(row.first_name), lastName: String(row.last_name),
      status: String(row.status), companies: Number(row.companies), planCode: (row.plan_code as string | null) ?? null,
      subscriptionStatus: (row.subscription_status as PlatformOwner["subscriptionStatus"]) ?? null,
      createdAt: new Date(row.created_at as string).toISOString(),
    }));
  }

  async companies(): Promise<PlatformCompany[]> {
    const result = await this.database.db.execute(sql`
      select c.id, c.code, c.name, c.slug, c.active, c.owner_user_id, u.email as owner_email, c.created_at,
        (select count(*)::int from stores s where s.company_id = c.id and s.active) as stores,
        (select count(*)::int from products p where p.company_id = c.id and p.status <> 'INACTIVE') as products
      from companies c left join app_users u on u.id = c.owner_user_id
      order by c.created_at
    `);
    return (result.rows as Record<string, unknown>[]).map((row) => ({
      id: String(row.id), code: String(row.code), name: String(row.name), slug: String(row.slug), active: row.active === true,
      ownerUserId: (row.owner_user_id as string | null) ?? null, ownerEmail: (row.owner_email as string | null) ?? null,
      stores: Number(row.stores), products: Number(row.products), createdAt: new Date(row.created_at as string).toISOString(),
    }));
  }

  async subscriptions(): Promise<PlatformSubscription[]> {
    const rows = await this.database.db.select({
      id: subscriptions.id, ownerUserId: subscriptions.ownerUserId, ownerEmail: appUsers.email, companyId: subscriptions.companyId,
      planCode: plans.code, status: subscriptions.status, currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd, grandfathered: subscriptions.grandfathered, updatedAt: subscriptions.updatedAt,
    }).from(subscriptions)
      .innerJoin(appUsers, eq(appUsers.id, subscriptions.ownerUserId))
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .orderBy(desc(subscriptions.updatedAt));
    return rows.map((row) => ({
      ...row,
      currentPeriodStart: row.currentPeriodStart.toISOString(),
      currentPeriodEnd: row.currentPeriodEnd ? row.currentPeriodEnd.toISOString() : null,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  /** Transfiere la propiedad de una compañía a otra cuenta ADMIN activa (no toca contraseñas). */
  async transferOwner(companyId: string, ownerEmail: string): Promise<PlatformCompany> {
    const [target] = await this.database.db.select({ id: appUsers.id, role: appUsers.role, status: appUsers.status }).from(appUsers)
      .where(sql`lower(${appUsers.email}) = ${ownerEmail.trim().toLowerCase()}`).limit(1);
    if (!target) throw new ApiHttpError(404, "No existe una cuenta con ese correo.");
    if (target.role !== "ADMIN" || target.status !== "ACTIVE") throw new ApiHttpError(409, "La cuenta destino debe ser un propietario (ADMIN) activo.");
    const updated = await this.database.db.update(companies).set({ ownerUserId: target.id, updatedAt: new Date() })
      .where(eq(companies.id, companyId)).returning({ id: companies.id });
    if (updated.length === 0) throw new ApiHttpError(404, "Compañía no encontrada.");
    const company = (await this.companies()).find((candidate) => candidate.id === companyId);
    if (!company) throw new ApiHttpError(500, "La compañía transferida no pudo recuperarse.");
    return company;
  }

  async changeOwnerPlan(ownerUserId: string, planCode: string): Promise<AdminPlanResponse> {
    await this.requireOwner(ownerUserId);
    return this.limits.changePlan(ownerUserId, planCode);
  }

  /** Ajuste manual de estado/fechas para demostrar vencimientos (D6). */
  async adjustSubscription(subscriptionId: string, request: PlatformAdjustSubscriptionRequest): Promise<PlatformSubscription> {
    const [current] = await this.database.db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId)).limit(1);
    if (!current) throw new ApiHttpError(404, "Suscripción no encontrada.");
    const start = request.currentPeriodStart ? new Date(request.currentPeriodStart) : current.currentPeriodStart;
    const end = request.currentPeriodEnd === undefined ? current.currentPeriodEnd : request.currentPeriodEnd === null ? null : new Date(request.currentPeriodEnd);
    if (end && end.getTime() <= start.getTime()) throw new ApiHttpError(400, "El fin del periodo debe ser posterior al inicio.");
    const status = request.status ?? current.status;
    await this.database.db.update(subscriptions).set({
      status, currentPeriodStart: start, currentPeriodEnd: end,
      cancelledAt: status === "CANCELLED" ? current.cancelledAt ?? new Date() : null,
      updatedAt: new Date(),
    }).where(eq(subscriptions.id, subscriptionId));
    const subscription = (await this.subscriptions()).find((candidate) => candidate.id === subscriptionId);
    if (!subscription) throw new ApiHttpError(500, "La suscripción no pudo recuperarse.");
    return subscription;
  }

  private async requireOwner(ownerUserId: string): Promise<void> {
    const rows = await this.database.db.select({ id: appUsers.id }).from(appUsers)
      .where(and(eq(appUsers.id, ownerUserId), eq(appUsers.role, "ADMIN"))).orderBy(asc(appUsers.id)).limit(1);
    if (rows.length === 0) throw new ApiHttpError(404, "Propietario no encontrado.");
  }
}

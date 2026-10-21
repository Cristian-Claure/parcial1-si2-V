import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { and, eq, isNull, sql } from "drizzle-orm";
import { companies, plans, subscriptions } from "@velora/database";
import { hashPassword } from "../auth/security.js";
import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { DatabaseService } from "../database/database.service.js";
import { UsersRepository } from "../users/users.repository.js";

export const VELORA_COMPANY_ID = "10000000-0000-0000-0000-000000000001";
export const GRANDFATHERED_PLAN_CODE = "MAX";

/**
 * Arranque SaaS idempotente (se ejecuta después del bootstrap del admin):
 * 1. La cuenta BOOTSTRAP_ADMIN_* (rol ADMIN) queda como propietaria de VÉLORA si no tiene dueño.
 * 2. El propietario de VÉLORA tiene una suscripción MAX vigente, sin vencimiento (grandfathered).
 * 3. Crea el PLATFORM_ADMIN de BOOTSTRAP_PLATFORM_ADMIN_* si falta (un correo = un rol).
 * Nunca reasigna un propietario existente ni modifica cuentas con otro rol.
 */
@Injectable()
export class SaasBootstrapService {
  private readonly logger = new Logger(SaasBootstrapService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly database: DatabaseService,
    private readonly config: RuntimeConfigService,
  ) {}

  async run(): Promise<void> {
    await this.assignVeloraOwner();
    await this.ensureVeloraOwnerSubscription();
    await this.ensurePlatformAdmin();
  }

  private async assignVeloraOwner(): Promise<void> {
    const config = this.config.value;
    const email = config.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    if (!config.BOOTSTRAP_ADMIN_ENABLED || !email) return;
    const owner = await this.users.findByEmail(email);
    if (!owner || owner.role !== "ADMIN") {
      this.logger.warn("La cuenta BOOTSTRAP_ADMIN no existe o no tiene rol ADMIN; VÉLORA queda sin propietario asignado.");
      return;
    }
    const updated = await this.database.db.update(companies)
      .set({ ownerUserId: owner.id, updatedAt: new Date() })
      .where(and(eq(companies.id, VELORA_COMPANY_ID), isNull(companies.ownerUserId)))
      .returning({ id: companies.id });
    if (updated.length > 0) this.logger.log("VÉLORA asignada a la cuenta propietaria del bootstrap.");
  }

  private async ensureVeloraOwnerSubscription(): Promise<void> {
    const [velora] = await this.database.db.select({ ownerUserId: companies.ownerUserId }).from(companies)
      .where(eq(companies.id, VELORA_COMPANY_ID)).limit(1);
    if (!velora?.ownerUserId) return;
    const [plan] = await this.database.db.select({ id: plans.id }).from(plans).where(eq(plans.code, GRANDFATHERED_PLAN_CODE)).limit(1);
    if (!plan) {
      this.logger.warn(`El plan ${GRANDFATHERED_PLAN_CODE} no existe; ejecute las migraciones V28+.`);
      return;
    }
    const now = new Date();
    const inserted = await this.database.db.insert(subscriptions).values({
      id: randomUUID(), ownerUserId: velora.ownerUserId, companyId: null, planId: plan.id,
      status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: null, grandfathered: true,
      cancelledAt: null, createdAt: now, updatedAt: now,
    }).onConflictDoNothing({
      target: subscriptions.ownerUserId,
      where: sql`${subscriptions.companyId} is null and ${subscriptions.status} <> 'CANCELLED'`,
    }).returning({ id: subscriptions.id });
    if (inserted.length > 0) this.logger.log("Suscripción MAX (grandfathered) creada para el propietario de VÉLORA.");
  }

  private async ensurePlatformAdmin(): Promise<void> {
    const config = this.config.value;
    if (!config.BOOTSTRAP_PLATFORM_ADMIN_ENABLED) return;
    const email = config.BOOTSTRAP_PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
    const password = config.BOOTSTRAP_PLATFORM_ADMIN_PASSWORD;
    if (!email || !password) {
      this.logger.warn("PLATFORM_ADMIN bootstrap habilitado sin email/password; se omite.");
      return;
    }
    const existing = await this.users.findByEmail(email);
    if (existing) {
      if (existing.role !== "PLATFORM_ADMIN") this.logger.warn("El correo de PLATFORM_ADMIN ya pertenece a una cuenta con otro rol; use un correo distinto.");
      return;
    }
    try {
      await this.users.createAdmin({
        firstName: config.BOOTSTRAP_PLATFORM_ADMIN_FIRST_NAME,
        lastName: config.BOOTSTRAP_PLATFORM_ADMIN_LAST_NAME,
        email,
        passwordHash: await hashPassword(password),
        role: "PLATFORM_ADMIN",
      });
      this.logger.log("PLATFORM_ADMIN bootstrap completado.");
    } catch (error) {
      if (!this.users.isUniqueViolation(error)) throw error;
    }
  }

}

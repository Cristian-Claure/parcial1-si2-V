import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  companySlugSchema, type CompanyResponse, type CreateCompanyRequest, type OnboardingResponse, type RegisterOwnerStoreRequest,
  type SlugAvailabilityResponse,
} from "@velora/contracts";
import { hashPassword, issueAuthToken } from "../auth/security.js";
import type { ActorAccessContext } from "../common/authz/tenant-scope.service.js";
import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { PlanLimitsService, toPlanContract } from "../plans/plan-limits.service.js";
import { PlansRepository } from "../plans/plans.repository.js";
import { SubscriptionBillingService } from "../plans/subscription-billing.service.js";
import { UsersRepository } from "../users/users.repository.js";
import { CompaniesRepository } from "../companies/companies.repository.js";
import { ProvisioningRepository } from "./provisioning.repository.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Slugs que chocarían con rutas o con la marca de la plataforma. */
const RESERVED_SLUGS = new Set(["velora", "admin", "api", "planes", "crear-tienda", "plataforma", "sucursal", "login", "registro", "t"]);

function isUniqueViolation(error: unknown): boolean {
  for (const candidate of [error, typeof error === "object" && error !== null ? (error as { cause?: unknown }).cause : null]) {
    if (typeof candidate === "object" && candidate !== null && (candidate as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly provisioning: ProvisioningRepository,
    private readonly users: UsersRepository,
    private readonly companies: CompaniesRepository,
    private readonly plans: PlansRepository,
    private readonly limits: PlanLimitsService,
    private readonly billing: SubscriptionBillingService,
    private readonly config: RuntimeConfigService,
  ) {}

  async slugAvailability(raw: string): Promise<SlugAvailabilityResponse> {
    const parsed = companySlugSchema.safeParse(raw);
    if (!parsed.success) return { slug: raw, available: false, suggestion: null };
    const slug = parsed.data;
    if (!RESERVED_SLUGS.has(slug) && !(await this.provisioning.slugTaken(slug))) return { slug, available: true, suggestion: null };
    for (let attempt = 2; attempt < 6; attempt += 1) {
      const candidate = `${slug.slice(0, 56)}-${attempt}`;
      if (!(await this.provisioning.slugTaken(candidate))) return { slug, available: false, suggestion: candidate };
    }
    return { slug, available: false, suggestion: `${slug.slice(0, 51)}-${randomBytes(4).toString("hex")}` };
  }

  /**
   * "Crear mi tienda": cuenta propietaria + compañía + sucursal principal + almacén por defecto
   * + categorías base + suscripción (TRIAL si el plan tiene prueba; si no, cobro DEMO) en UNA transacción.
   */
  async registerOwnerStore(request: RegisterOwnerStoreRequest): Promise<OnboardingResponse> {
    const email = request.owner.email.trim().toLowerCase();
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ApiHttpError(409, existing.role === "ADMIN"
        ? "Ya existe una cuenta propietaria con este correo. Inicia sesión para crear otra tienda desde tu panel."
        : "Este correo ya está registrado con otro rol. Usa un correo distinto para tu cuenta propietaria.");
    }
    await this.requireAvailableSlug(request.company.slug);
    const plan = await this.plans.planByCode(request.planCode);
    if (!plan || !plan.active) throw new ApiHttpError(404, "Plan no encontrado.");

    const now = new Date();
    const trial = plan.trialDays > 0;
    // Planes pagos sin prueba se cobran ANTES de crear nada (si se rechaza, no queda nada).
    const payment = trial ? null : await this.billing.charge(plan, request.card, `onboarding:${email}:${plan.code}`);
    const passwordHash = await hashPassword(request.owner.password);

    let created: { ownerId: string; companyId: string };
    try {
      created = await this.provisioning.transaction(async (tx) => {
        const ownerId = await this.provisioning.insertOwner(tx, { ...request.owner, email, passwordHash });
        const company = await this.provisioning.provisionCompany(tx, ownerId, request.company);
        const subscription = await this.plans.upsertOwnerSubscription(tx, {
          ownerUserId: ownerId, planId: plan.id, status: trial ? "TRIAL" : "ACTIVE", periodStart: now,
          periodEnd: trial ? new Date(now.getTime() + plan.trialDays * DAY_MS) : this.limits.periodEndFor(plan, now),
        });
        if (payment) await this.plans.insertSubscriptionPayment(tx, subscription.id, ownerId, payment, plan.id);
        return { ownerId, companyId: company.companyId };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiHttpError(409, "El correo o el enlace de la tienda ya están en uso.");
      throw error;
    }

    const owner = await this.users.findById(created.ownerId);
    const company = await this.companies.findActive(created.companyId);
    const summary = await this.limits.adminPlan(created.ownerId);
    if (!owner || !company || !summary.subscription) throw new ApiHttpError(500, "La tienda fue creada pero no pudo recuperarse.");
    return {
      auth: await issueAuthToken(this.users.toProfile(owner), this.config.value),
      company,
      subscription: summary.subscription,
      plan: toPlanContract(plan),
    };
  }

  /** Otra tienda para un propietario existente, respetando max_companies del plan. */
  async createCompany(actor: ActorAccessContext, request: CreateCompanyRequest): Promise<CompanyResponse> {
    if (actor.role !== "ADMIN") throw new ApiHttpError(403, "Solo un propietario puede crear tiendas.");
    await this.limits.assertCanCreateCompany(actor.userId);
    await this.requireAvailableSlug(request.slug);
    let companyId: string;
    try {
      companyId = (await this.provisioning.transaction((tx) => this.provisioning.provisionCompany(tx, actor.userId, request))).companyId;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiHttpError(409, "El enlace de la tienda ya está en uso.");
      throw error;
    }
    const company = await this.companies.findActive(companyId);
    if (!company) throw new ApiHttpError(500, "La tienda fue creada pero no pudo recuperarse.");
    return company;
  }

  private async requireAvailableSlug(slug: string): Promise<void> {
    const availability = await this.slugAvailability(slug);
    if (!availability.available) {
      throw ApiHttpError.coded(409, "SLUG_TAKEN", "Ese enlace de tienda no está disponible.", { suggestion: availability.suggestion });
    }
  }
}

import { Injectable } from "@nestjs/common";
import { asc, eq, inArray } from "drizzle-orm";
import { companies, stores } from "@velora/database";
import type { UserRole } from "@velora/contracts";
import type { AuthPrincipal } from "../../auth/security.js";
import { DatabaseService } from "../../database/database.service.js";
import { UsersRepository } from "../../users/users.repository.js";
import { ApiHttpError } from "../http/api-http.error.js";

/**
 * Contexto del actor con su alcance multi-tenant, resuelto SIEMPRE desde la BD
 * (no desde claims del JWT, que quedarían obsoletos al crear compañías).
 *
 * - PLATFORM_ADMIN: sin restricción de compañía.
 * - ADMIN (propietario): solo las compañías con owner_user_id = userId y sus sucursales.
 * - STORE_MANAGER: su sucursal y la compañía de esa sucursal.
 * - CUSTOMER: ninguna compañía administrable.
 */
export interface ActorAccessContext {
  userId: string;
  role: UserRole;
  storeId: string | null;
  companyId: string | null;
  ownedCompanyIds: readonly string[];
  ownedStoreIds: readonly string[];
}

export function canAccessCompany(actor: ActorAccessContext, companyId: string): boolean {
  switch (actor.role) {
    case "PLATFORM_ADMIN": return true;
    case "ADMIN": return actor.ownedCompanyIds?.includes(companyId) ?? false;
    case "STORE_MANAGER": return actor.companyId === companyId;
    default: return false;
  }
}

export function canAccessStore(actor: ActorAccessContext, storeId: string): boolean {
  switch (actor.role) {
    case "PLATFORM_ADMIN": return true;
    case "ADMIN": return actor.ownedStoreIds?.includes(storeId) ?? false;
    case "STORE_MANAGER": return actor.storeId === storeId;
    default: return false;
  }
}

/**
 * Fuera de alcance: un encargado recibe 403 (comportamiento histórico); para
 * cualquier otro rol el recurso "no existe" (404) para no revelar datos de otro tenant.
 */
export function assertCompanyAccess(actor: ActorAccessContext, companyId: string, managerMessage = "No tiene permisos para administrar esta compañía."): void {
  if (canAccessCompany(actor, companyId)) return;
  if (actor.role === "STORE_MANAGER") throw new ApiHttpError(403, managerMessage);
  throw new ApiHttpError(404, "Compañía no encontrada.");
}

export function assertStoreAccess(actor: ActorAccessContext, storeId: string, managerMessage = "No puede operar sobre otra sucursal."): void {
  if (canAccessStore(actor, storeId)) return;
  if (actor.role === "STORE_MANAGER") throw new ApiHttpError(403, managerMessage);
  throw new ApiHttpError(404, "Sucursal no encontrada.");
}

/** Compañías visibles para listados sin companyId explícito; null = todas (PLATFORM_ADMIN). */
export function companyFilter(actor: ActorAccessContext): readonly string[] | null {
  if (actor.role === "PLATFORM_ADMIN") return null;
  if (actor.role === "ADMIN") return actor.ownedCompanyIds ?? [];
  if (actor.role === "STORE_MANAGER" && actor.companyId) return [actor.companyId];
  return [];
}

@Injectable()
export class TenantScopeService {
  constructor(
    private readonly users: UsersRepository,
    private readonly database: DatabaseService,
  ) {}

  async resolve(principal: AuthPrincipal): Promise<ActorAccessContext> {
    const user = await this.users.findById(principal.userId);
    if (!user || user.role !== principal.role) {
      throw new ApiHttpError(401, "Usuario autenticado no encontrado.");
    }
    if (user.status !== "ACTIVE") {
      throw new ApiHttpError(403, "El usuario no está activo.");
    }
    if (user.role === "STORE_MANAGER" && (!user.storeId || !user.storeCompanyId)) {
      throw new ApiHttpError(403, "El encargado no tiene una sucursal asignada.");
    }

    const base = { userId: user.id, role: user.role, storeId: user.storeId, companyId: user.storeCompanyId };
    if (user.role !== "ADMIN") {
      return {
        ...base,
        ownedCompanyIds: user.role === "STORE_MANAGER" && user.storeCompanyId ? [user.storeCompanyId] : [],
        ownedStoreIds: user.role === "STORE_MANAGER" && user.storeId ? [user.storeId] : [],
      };
    }

    const owned = await this.ownedCompanyIds(user.id);
    return { ...base, ownedCompanyIds: owned, ownedStoreIds: await this.storeIdsOf(owned) };
  }

  /** Resuelve y valida la compañía solicitada contra el alcance del actor. */
  async requireCompany(principal: AuthPrincipal, companyId: string): Promise<ActorAccessContext> {
    const actor = await this.resolve(principal);
    assertCompanyAccess(actor, companyId);
    return actor;
  }

  async ownedCompanyIds(ownerUserId: string): Promise<string[]> {
    const rows = await this.database.db.select({ id: companies.id }).from(companies)
      .where(eq(companies.ownerUserId, ownerUserId)).orderBy(asc(companies.name));
    return rows.map((row) => row.id);
  }

  private async storeIdsOf(companyIds: readonly string[]): Promise<string[]> {
    if (companyIds.length === 0) return [];
    const rows = await this.database.db.select({ id: stores.id }).from(stores)
      .where(inArray(stores.companyId, [...companyIds]));
    return rows.map((row) => row.id);
  }
}

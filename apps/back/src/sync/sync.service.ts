import { Injectable } from "@nestjs/common";
import type {
  SyncConflictOption, SyncCustomerCreate, SyncCustomerUpdate, SyncOperation, SyncOperationResult, SyncProductCreate, SyncProductUpdate,
  SyncPullResponse, SyncPushRequest, SyncPushResponse,
} from "@velora/contracts";
import { assertCompanyAccess, canAccessStore, type ActorAccessContext } from "../common/authz/tenant-scope.service.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { PlanLimitsService } from "../plans/plan-limits.service.js";
import { SyncRepository, type SyncTx } from "./sync.repository.js";

type Outcome = Omit<SyncOperationResult, "clientOperationId">;

const result = (status: SyncOperationResult["status"], fields: Partial<Outcome> = {}): Outcome => ({
  status, code: null, message: null, entityId: null, version: null, options: [], server: null, ...fields,
});
const conflict = (code: string, message: string, options: SyncConflictOption[], server: Record<string, unknown> | null): Outcome =>
  result("CONFLICT", { code, message, options, server });
const rejected = (code: string, message: string, server: Record<string, unknown> | null = null): Outcome => result("REJECTED", { code, message, server });

/** Corta la aplicación de una operación con un resultado ya decidido (sin aplicar nada). */
class OperationOutcome extends Error {
  constructor(readonly outcome: Outcome) { super(outcome.code ?? outcome.status); }
}

function isUniqueViolation(error: unknown): boolean {
  for (const candidate of [error, typeof error === "object" && error !== null ? (error as { cause?: unknown }).cause : null]) {
    if (typeof candidate === "object" && candidate !== null && (candidate as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

/**
 * Push en lote con resultado por operación y pull incremental. Alcance por TenantScopeService,
 * límites por PlanLimitsService (REJECTED con PLAN_LIMIT_*), unicidad → CONFLICT,
 * versión desactualizada → CONFLICT VERSION_MISMATCH. Cada operación es atómica e idempotente.
 */
@Injectable()
export class SyncService {
  constructor(private readonly repository: SyncRepository, private readonly limits: PlanLimitsService) {}

  async push(actor: ActorAccessContext, request: SyncPushRequest): Promise<SyncPushResponse> {
    this.requireOperator(actor);
    assertCompanyAccess(actor, request.companyId);
    const results: SyncOperationResult[] = [];
    for (const operation of request.operations) {
      results.push({ clientOperationId: operation.clientOperationId, ...(await this.applyOne(actor, request.companyId, operation)) });
    }
    return { results };
  }

  async pull(actor: ActorAccessContext, companyId: string, since: string | null): Promise<SyncPullResponse> {
    this.requireOperator(actor);
    assertCompanyAccess(actor, companyId);
    if (since !== null && !/^\d{1,20}$/.test(since)) throw new ApiHttpError(400, "Cursor de sincronización inválido.");
    const storeIds = actor.role === "STORE_MANAGER" ? (actor.storeId ? [actor.storeId] : []) : null;
    const data = await this.repository.pull({ companyId, storeIds }, since);
    return { companyId, snapshot: since === null, ...data };
  }

  private async applyOne(actor: ActorAccessContext, companyId: string, operation: SyncOperation): Promise<Outcome> {
    const previous = await this.repository.findOperation(operation.clientOperationId);
    if (previous) {
      if (previous.companyId !== companyId) return rejected("OPERATION_ID_REUSED", "El identificador de la operación ya fue usado.");
      return { ...(previous.result as unknown as Outcome), status: "DUPLICATE" };
    }
    try {
      if (operation.type === "PRODUCT_CREATE") await this.limits.assertCanCreateProduct(companyId);
      return await this.repository.transaction(async (tx) => {
        const outcome = await this.dispatch(tx, actor, companyId, operation);
        await this.repository.recordOperation(tx, {
          clientOperationId: operation.clientOperationId, actorUserId: actor.userId, companyId, opType: operation.type,
          entityId: outcome.entityId, result: outcome as unknown as Record<string, unknown>,
        });
        return outcome;
      });
    } catch (error) {
      if (error instanceof OperationOutcome) return error.outcome;
      if (error instanceof ApiHttpError && error.code?.startsWith("PLAN_LIMIT_")) return rejected(error.code, error.message, error.details ?? null);
      if (error instanceof ApiHttpError && error.code === "SUBSCRIPTION_INACTIVE") return rejected(error.code, error.message);
      if (isUniqueViolation(error)) {
        const stored = await this.repository.findOperation(operation.clientOperationId);
        if (stored) return { ...(stored.result as unknown as Outcome), status: "DUPLICATE" };
        return conflict("UNIQUE_VIOLATION", "Otro registro ya usa alguno de estos datos.", ["ADJUST_AND_RETRY", "DISCARD"], null);
      }
      throw error;
    }
  }

  private dispatch(tx: SyncTx, actor: ActorAccessContext, companyId: string, operation: SyncOperation): Promise<Outcome> {
    switch (operation.type) {
      case "CUSTOMER_CREATE": return this.createCustomer(tx, companyId, operation.payload);
      case "CUSTOMER_UPDATE": return this.updateCustomer(tx, companyId, operation.payload, operation.baseVersion);
      case "PRODUCT_CREATE": return this.createProduct(tx, actor, companyId, operation.payload);
      case "PRODUCT_UPDATE": return this.updateProduct(tx, actor, companyId, operation.payload, operation.baseVersion);
    }
  }

  // ---------------------------------------------------------------- clientes

  private async assertCustomerUnique(tx: SyncTx, companyId: string, input: { email?: string | null | undefined; taxId?: string | null | undefined }, excludeId: string | null): Promise<void> {
    if (input.email) {
      const existing = await this.repository.userByEmail(tx, input.email, excludeId);
      if (existing && existing.role !== "CUSTOMER") throw new OperationOutcome(rejected("EMAIL_RESERVED", "Ese correo pertenece a una cuenta de propietario u operación (un correo = un rol)."));
      if (existing) throw new OperationOutcome(conflict("EMAIL_TAKEN", "Ya existe un cliente con ese correo.", ["USE_EXISTING", "ADJUST_AND_RETRY", "DISCARD"], this.publicCustomer(existing, companyId)));
    }
    if (input.taxId) {
      const existing = await this.repository.customerByTaxId(tx, companyId, input.taxId, excludeId);
      if (existing) throw new OperationOutcome(conflict("DOCUMENT_TAKEN", "Ya existe un cliente de la tienda con ese documento.", ["USE_EXISTING", "ADJUST_AND_RETRY", "DISCARD"], this.publicCustomer(existing, companyId)));
    }
  }

  /** Solo se revela el detalle completo de clientes de la misma tienda. */
  private publicCustomer(row: Record<string, unknown>, companyId: string): Record<string, unknown> {
    const sameCompany = String(row.registered_company_id ?? "") === companyId;
    const customer = this.repository.toCustomer(row);
    return sameCompany ? { ...customer, sameCompany } : { id: customer.id, firstName: customer.firstName, lastName: customer.lastName, email: customer.email, hasAccess: customer.hasAccess, sameCompany };
  }

  private async createCustomer(tx: SyncTx, companyId: string, input: SyncCustomerCreate): Promise<Outcome> {
    if (await this.repository.userById(tx, input.id)) throw new OperationOutcome(rejected("ID_COLLISION", "El identificador del cliente ya existe."));
    await this.assertCustomerUnique(tx, companyId, input, null);
    await this.repository.insertCustomer(tx, companyId, input);
    return result("APPLIED", { entityId: input.id, version: 1 });
  }

  private async updateCustomer(tx: SyncTx, companyId: string, input: SyncCustomerUpdate, baseVersion: number): Promise<Outcome> {
    const current = await this.repository.userById(tx, input.id);
    if (!current || current.role !== "CUSTOMER" || String(current.registered_company_id) !== companyId) {
      throw new OperationOutcome(rejected("NOT_FOUND", "Cliente no encontrado en esta tienda."));
    }
    if (Number(current.version) !== baseVersion) {
      throw new OperationOutcome(conflict("VERSION_MISMATCH", "El cliente cambió en el servidor desde tu última sincronización.", ["KEEP_MINE", "KEEP_SERVER"], { ...this.repository.toCustomer(current) }));
    }
    await this.assertCustomerUnique(tx, companyId, input, input.id);
    const version = await this.repository.updateCustomer(tx, input);
    return result("APPLIED", { entityId: input.id, version });
  }

  // ---------------------------------------------------------------- productos

  private async createProduct(tx: SyncTx, actor: ActorAccessContext, companyId: string, input: SyncProductCreate): Promise<Outcome> {
    if (await this.repository.productById(tx, input.id)) throw new OperationOutcome(rejected("ID_COLLISION", "El identificador del producto ya existe."));
    if (await this.repository.anyVariantIdTaken(tx, input.variants.map((variant) => variant.id))) throw new OperationOutcome(rejected("ID_COLLISION", "El identificador de una variante ya existe."));
    if (!(await this.repository.categoryInCompany(tx, companyId, input.categoryId))) throw new OperationOutcome(rejected("CATEGORY_NOT_FOUND", "La categoría no existe o está inactiva en esta tienda."));

    const skus = input.variants.map((variant) => variant.sku);
    if (new Set(skus).size !== skus.length) throw new OperationOutcome(rejected("VALIDATION", "Hay SKU repetidos dentro del producto."));
    const taken = await this.repository.existingSkus(tx, skus);
    if (taken.length > 0) {
      const first = taken[0]!;
      const sameCompany = String(first.company_id) === companyId;
      // De otra tienda solo se informa el SKU (sin datos de ese tenant).
      throw new OperationOutcome(conflict("SKU_TAKEN", `El SKU ${String(first.sku)} ya existe.`, sameCompany ? ["USE_EXISTING", "ADJUST_AND_RETRY", "DISCARD"] : ["ADJUST_AND_RETRY", "DISCARD"],
        sameCompany ? { sku: String(first.sku), productId: String(first.product_id), productName: String(first.product_name), sameCompany } : { sku: String(first.sku), skus: taken.map((row) => String(row.sku)), sameCompany }));
    }

    const variantIds = new Set(input.variants.map((variant) => variant.id));
    const stock = input.initialStock ?? [];
    if (stock.some((entry) => !variantIds.has(entry.variantId))) throw new OperationOutcome(rejected("VALIDATION", "El stock inicial referencia una variante que no pertenece al producto."));
    const warehouses = await this.repository.warehousesOf(tx, [...new Set(stock.map((entry) => entry.warehouseId))]);
    for (const entry of stock) {
      const warehouse = warehouses.find((candidate) => String(candidate.id) === entry.warehouseId);
      if (!warehouse || String(warehouse.company_id) !== companyId || warehouse.active !== true || !canAccessStore(actor, String(warehouse.store_id))) {
        throw new OperationOutcome(rejected("WAREHOUSE_NOT_FOUND", "El almacén del stock inicial no existe o está fuera de tu alcance."));
      }
    }

    const slug = await this.repository.uniqueSlug(tx, companyId, input.slug || input.name);
    await this.repository.insertProduct(tx, companyId, actor.userId, { ...input, slug }, input.brand ?? "");
    for (const entry of stock) await this.repository.applyInitialStock(tx, actor.userId, input.id, entry);
    return result("APPLIED", { entityId: input.id, version: 1, server: { slug } });
  }

  private async updateProduct(tx: SyncTx, actor: ActorAccessContext, companyId: string, input: SyncProductUpdate, baseVersion: number): Promise<Outcome> {
    const current = await this.repository.productById(tx, input.id);
    if (!current || String(current.company_id) !== companyId) throw new OperationOutcome(rejected("NOT_FOUND", "Producto no encontrado en esta tienda."));
    if (Number(current.version) !== baseVersion) {
      throw new OperationOutcome(conflict("VERSION_MISMATCH", "El producto cambió en el servidor desde tu última sincronización.", ["KEEP_MINE", "KEEP_SERVER"], {
        id: String(current.id), name: String(current.name), description: current.description ?? null, status: String(current.status), categoryId: String(current.category_id), version: Number(current.version),
      }));
    }
    if (input.categoryId && !(await this.repository.categoryInCompany(tx, companyId, input.categoryId))) throw new OperationOutcome(rejected("CATEGORY_NOT_FOUND", "La categoría no existe o está inactiva en esta tienda."));
    const version = await this.repository.updateProduct(tx, actor.userId, input);
    return result("APPLIED", { entityId: input.id, version });
  }

  private requireOperator(actor: ActorAccessContext): void {
    if (actor.role !== "ADMIN" && actor.role !== "STORE_MANAGER") throw new ApiHttpError(403, "La sincronización de operaciones es para propietarios y encargados.");
  }
}

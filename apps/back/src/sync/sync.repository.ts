import { Injectable } from "@nestjs/common";
import { sql, type SQL } from "drizzle-orm";
import type {
  SyncCategory, SyncCustomer, SyncCustomerCreate, SyncCustomerUpdate, SyncEntityType, SyncProduct, SyncProductCreate, SyncProductUpdate, SyncStore, SyncWarehouse,
} from "@velora/contracts";
import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { DatabaseService } from "../database/database.service.js";

export type SyncTx = Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0];
type Executor = Pick<SyncTx, "execute">;
type Row = Record<string, unknown>;

export interface StoredOperation { clientOperationId: string; companyId: string; actorUserId: string; result: Record<string, unknown> }
export interface PullScope { companyId: string; storeIds: readonly string[] | null }
export interface PullData {
  categories: SyncCategory[]; products: SyncProduct[]; stores: SyncStore[]; warehouses: SyncWarehouse[]; customers: SyncCustomer[];
  tombstones: { entityType: SyncEntityType; id: string }[];
}

const rows = async (executor: Executor, query: SQL): Promise<Row[]> => (await executor.execute(query)).rows as Row[];
const str = (value: unknown): string | null => value === null || value === undefined ? null : String(value);
const uuidList = (ids: readonly string[]) => sql`array[${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}]::uuid[]`;

/** Acceso a datos del sync. Todo filtra por compañía (y por sucursal para encargados). */
@Injectable()
export class SyncRepository {
  constructor(private readonly database: DatabaseService, private readonly config: RuntimeConfigService) {}

  transaction<T>(work: (tx: SyncTx) => Promise<T>): Promise<T> {
    return this.database.db.transaction(work);
  }

  // ---------------------------------------------------------------- operaciones aplicadas

  async findOperation(clientOperationId: string): Promise<StoredOperation | null> {
    const [row] = await rows(this.database.db, sql`select client_operation_id, company_id, actor_user_id, result from sync_operations where client_operation_id = ${clientOperationId}::uuid`);
    return row ? { clientOperationId: String(row.client_operation_id), companyId: String(row.company_id), actorUserId: String(row.actor_user_id), result: row.result as Record<string, unknown> } : null;
  }

  async recordOperation(tx: SyncTx, input: { clientOperationId: string; actorUserId: string; companyId: string; opType: string; entityId: string | null; result: Record<string, unknown> }): Promise<void> {
    await tx.execute(sql`insert into sync_operations (client_operation_id, actor_user_id, company_id, op_type, entity_id, result)
      values (${input.clientOperationId}::uuid, ${input.actorUserId}::uuid, ${input.companyId}::uuid, ${input.opType}, ${input.entityId}::uuid, ${JSON.stringify(input.result)}::jsonb)`);
  }

  // ---------------------------------------------------------------- clientes

  async userById(executor: Executor, id: string): Promise<Row | null> {
    const [row] = await rows(executor, sql`select id, role, email, first_name, last_name, phone, tax_id, customer_type, business_name, password_hash is not null as has_access, registered_company_id, version from app_users where id = ${id}::uuid`);
    return row ?? null;
  }

  async userByEmail(executor: Executor, email: string, excludeId: string | null = null): Promise<Row | null> {
    const [row] = await rows(executor, sql`select id, role, email, first_name, last_name, phone, tax_id, customer_type, business_name, password_hash is not null as has_access, registered_company_id, version
      from app_users where lower(email) = lower(${email}) ${excludeId ? sql`and id <> ${excludeId}::uuid` : sql``} limit 1`);
    return row ?? null;
  }

  async customerByTaxId(executor: Executor, companyId: string, taxId: string, excludeId: string | null = null): Promise<Row | null> {
    const [row] = await rows(executor, sql`select id, role, email, first_name, last_name, phone, tax_id, customer_type, business_name, password_hash is not null as has_access, registered_company_id, version
      from app_users where registered_company_id = ${companyId}::uuid and lower(tax_id) = lower(${taxId}) ${excludeId ? sql`and id <> ${excludeId}::uuid` : sql``} limit 1`);
    return row ?? null;
  }

  async insertCustomer(tx: SyncTx, companyId: string, input: SyncCustomerCreate): Promise<void> {
    await tx.execute(sql`insert into app_users (id, first_name, last_name, email, password_hash, role, customer_type, phone, business_name, tax_id, status, store_id, registered_company_id, created_at, updated_at)
      values (${input.id}::uuid, ${input.firstName}, ${input.lastName}, ${input.email ?? null}, null, 'CUSTOMER', ${input.customerType ?? "B2C"}, ${input.phone ?? null}, ${input.businessName ?? null}, ${input.taxId ?? null}, 'ACTIVE', null, ${companyId}::uuid, now(), now())`);
  }

  async updateCustomer(tx: SyncTx, input: SyncCustomerUpdate): Promise<number> {
    const sets: SQL[] = [sql`updated_at = now()`];
    if (input.firstName !== undefined) sets.push(sql`first_name = ${input.firstName}`);
    if (input.lastName !== undefined) sets.push(sql`last_name = ${input.lastName}`);
    if (input.phone !== undefined) sets.push(sql`phone = ${input.phone}`);
    if (input.email !== undefined) sets.push(sql`email = ${input.email}`);
    if (input.taxId !== undefined) sets.push(sql`tax_id = ${input.taxId}`);
    if (input.customerType !== undefined) sets.push(sql`customer_type = ${input.customerType}`);
    if (input.businessName !== undefined) sets.push(sql`business_name = ${input.businessName}`);
    const [row] = await rows(tx, sql`update app_users set ${sql.join(sets, sql`, `)} where id = ${input.id}::uuid returning version`);
    return Number(row?.version ?? 0);
  }

  // ---------------------------------------------------------------- productos

  async productById(executor: Executor, id: string): Promise<Row | null> {
    const [row] = await rows(executor, sql`select id, company_id, category_id, name, slug, description, status, version from products where id = ${id}::uuid`);
    return row ?? null;
  }

  async categoryInCompany(executor: Executor, companyId: string, categoryId: string): Promise<boolean> {
    return (await rows(executor, sql`select 1 from categories where id = ${categoryId}::uuid and company_id = ${companyId}::uuid and active`)).length > 0;
  }

  async existingSkus(executor: Executor, skus: string[]): Promise<Row[]> {
    if (skus.length === 0) return [];
    return rows(executor, sql`select pv.sku, pv.product_id, p.name as product_name, p.company_id from product_variants pv join products p on p.id = pv.product_id
      where upper(pv.sku) in (${sql.join(skus.map((sku) => sql`${sku.toUpperCase()}`), sql`, `)})`);
  }

  async anyVariantIdTaken(executor: Executor, ids: string[]): Promise<boolean> {
    return (await rows(executor, sql`select 1 from product_variants where id = any(${uuidList(ids)}) limit 1`)).length > 0;
  }

  async warehousesOf(executor: Executor, ids: string[]): Promise<Row[]> {
    if (ids.length === 0) return [];
    return rows(executor, sql`select w.id, w.store_id, w.active, s.company_id from warehouses w join stores s on s.id = w.store_id where w.id = any(${uuidList(ids)})`);
  }

  async uniqueSlug(executor: Executor, companyId: string, base: string): Promise<string> {
    const normalized = (base.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "producto").slice(0, 180);
    const taken = new Set((await rows(executor, sql`select slug from products where company_id = ${companyId}::uuid and (slug = ${normalized} or slug like ${`${normalized}-%`})`)).map((row) => String(row.slug)));
    if (!taken.has(normalized)) return normalized;
    for (let index = 2; ; index += 1) if (!taken.has(`${normalized}-${index}`)) return `${normalized}-${index}`;
  }

  async insertProduct(tx: SyncTx, companyId: string, actorUserId: string, input: SyncProductCreate & { slug: string }, brand: string): Promise<void> {
    await tx.execute(sql`insert into products (id, company_id, category_id, name, slug, description, brand, status, created_by, updated_by, created_at, updated_at)
      values (${input.id}::uuid, ${companyId}::uuid, ${input.categoryId}::uuid, ${input.name}, ${input.slug}, ${input.description ?? null}, ${brand}, ${input.status ?? "ACTIVE"}, ${actorUserId}::uuid, ${actorUserId}::uuid, now(), now())`);
    for (const variant of input.variants) {
      await tx.execute(sql`insert into product_variants (id, product_id, sku, size, color, color_hex, price, currency, active, created_at, updated_at)
        values (${variant.id}::uuid, ${input.id}::uuid, ${variant.sku}, ${variant.size}, ${variant.color}, ${variant.colorHex ?? null}, ${variant.price}, 'BOB', true, now(), now())`);
    }
  }

  /** Stock inicial como movimiento ENTRY (el servidor manda sobre el stock). */
  async applyInitialStock(tx: SyncTx, actorUserId: string, productId: string, entry: { variantId: string; warehouseId: string; quantity: number }): Promise<void> {
    const [current] = await rows(tx, sql`select id, physical_quantity, committed_quantity from inventory_stocks where warehouse_id = ${entry.warehouseId}::uuid and variant_id = ${entry.variantId}::uuid for update`);
    const before = Number(current?.physical_quantity ?? 0);
    const committed = Number(current?.committed_quantity ?? 0);
    if (current) {
      await tx.execute(sql`update inventory_stocks set physical_quantity = ${before + entry.quantity}, updated_at = now() where id = ${String(current.id)}::uuid`);
    } else {
      await tx.execute(sql`insert into inventory_stocks (id, warehouse_id, variant_id, physical_quantity, committed_quantity, created_at, updated_at)
        values (gen_random_uuid(), ${entry.warehouseId}::uuid, ${entry.variantId}::uuid, ${entry.quantity}, 0, now(), now())`);
    }
    await tx.execute(sql`insert into inventory_movements (id, warehouse_id, variant_id, movement_type, quantity, physical_delta, committed_delta, physical_before, physical_after, committed_before, committed_after, reference_type, reference_id, reason, performed_by, created_at)
      values (gen_random_uuid(), ${entry.warehouseId}::uuid, ${entry.variantId}::uuid, 'ENTRY', ${entry.quantity}, ${entry.quantity}, 0, ${before}, ${before + entry.quantity}, ${committed}, ${committed}, 'OFFLINE_SYNC', ${productId}::uuid, 'Stock inicial registrado sin conexión', ${actorUserId}::uuid, now())`);
  }

  async updateProduct(tx: SyncTx, actorUserId: string, input: SyncProductUpdate): Promise<number> {
    const sets: SQL[] = [sql`updated_at = now()`, sql`updated_by = ${actorUserId}::uuid`];
    if (input.name !== undefined) sets.push(sql`name = ${input.name}`);
    if (input.description !== undefined) sets.push(sql`description = ${input.description}`);
    if (input.status !== undefined) sets.push(sql`status = ${input.status}`);
    if (input.categoryId !== undefined) sets.push(sql`category_id = ${input.categoryId}::uuid`);
    const [row] = await rows(tx, sql`update products set ${sql.join(sets, sql`, `)} where id = ${input.id}::uuid returning version`);
    return Number(row?.version ?? 0);
  }

  // ---------------------------------------------------------------- pull

  /**
   * Lectura consistente (REPEATABLE READ, solo lectura). Se devuelve todo cambio visible con
   * tx_id >= since y el nuevo cursor es el xmin del snapshot: ninguna transacción aún en vuelo
   * puede quedar por detrás del cursor (llegará en el próximo pull). Los cambios visibles con
   * tx_id >= xmin pueden reenviarse una vez; los upserts y tombstones son idempotentes.
   */
  async pull(scope: PullScope, since: string | null): Promise<PullData & { cursor: string }> {
    return this.database.db.transaction(async (tx) => {
      const [horizon] = await rows(tx, sql`select pg_snapshot_xmin(pg_current_snapshot())::text as xmin`);
      const cursor = String(horizon?.xmin);
      if (since === null) return { cursor, ...(await this.snapshot(tx, scope)) };

      const changes = await rows(tx, sql`select distinct on (entity_type, entity_id) entity_type, entity_id, op from sync_changes
        where company_id = ${scope.companyId}::uuid and tx_id >= ${since}::xid8
        order by entity_type, entity_id, seq desc`);
      const idsOf = (type: SyncEntityType) => changes.filter((change) => change.entity_type === type).map((change) => String(change.entity_id));
      const data = await this.load(tx, scope, {
        categories: idsOf("CATEGORY"), products: idsOf("PRODUCT"), stores: idsOf("STORE"), warehouses: idsOf("WAREHOUSE"), customers: idsOf("CUSTOMER"),
      });
      return { cursor, ...data };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  }

  private async snapshot(tx: SyncTx, scope: PullScope): Promise<PullData> {
    const ids = async (query: SQL) => (await rows(tx, query)).map((row) => String(row.id));
    const data = await this.load(tx, scope, {
      categories: await ids(sql`select id from categories where company_id = ${scope.companyId}::uuid`),
      products: await ids(sql`select id from products where company_id = ${scope.companyId}::uuid and status <> 'INACTIVE'`),
      stores: await ids(sql`select id from stores where company_id = ${scope.companyId}::uuid`),
      warehouses: await ids(sql`select w.id from warehouses w join stores s on s.id = w.store_id where s.company_id = ${scope.companyId}::uuid`),
      customers: await ids(sql`select id from app_users where registered_company_id = ${scope.companyId}::uuid and role = 'CUSTOMER'`),
    });
    return { ...data, tombstones: [] };
  }

  /** Carga el estado actual; lo que ya no existe, está inactivo o salió del alcance → tombstone. */
  private async load(tx: SyncTx, scope: PullScope, wanted: Record<"categories" | "products" | "stores" | "warehouses" | "customers", string[]>): Promise<PullData> {
    const tombstones: PullData["tombstones"] = [];
    const missing = (type: SyncEntityType, requested: string[], found: string[]) => {
      const present = new Set(found);
      for (const id of requested) if (!present.has(id)) tombstones.push({ entityType: type, id });
    };
    const inStores = (storeColumn: SQL) => scope.storeIds === null ? sql`true` : scope.storeIds.length === 0 ? sql`false` : sql`${storeColumn} = any(${uuidList(scope.storeIds)})`;
    const any = (list: string[]) => list.length === 0 ? sql`false` : sql`= any(${uuidList(list)})`;

    const categoryRows = wanted.categories.length ? await rows(tx, sql`select id, name, slug, parent_id from categories where company_id = ${scope.companyId}::uuid and active and id ${any(wanted.categories)}`) : [];
    const categories = categoryRows.map((row) => ({ id: String(row.id), name: String(row.name), slug: String(row.slug), parentId: str(row.parent_id), active: true }));
    missing("CATEGORY", wanted.categories, categories.map((category) => category.id));

    const storeRows = wanted.stores.length ? await rows(tx, sql`select id, code, name from stores where company_id = ${scope.companyId}::uuid and active and id ${any(wanted.stores)} and ${inStores(sql`id`)}`) : [];
    const stores = storeRows.map((row) => ({ id: String(row.id), code: String(row.code), name: String(row.name), active: true }));
    missing("STORE", wanted.stores, stores.map((store) => store.id));

    const warehouseRows = wanted.warehouses.length ? await rows(tx, sql`select w.id, w.store_id, w.code, w.name, w.default_warehouse from warehouses w join stores s on s.id = w.store_id
      where s.company_id = ${scope.companyId}::uuid and w.active and s.active and w.id ${any(wanted.warehouses)} and ${inStores(sql`w.store_id`)}`) : [];
    const warehouses = warehouseRows.map((row) => ({ id: String(row.id), storeId: String(row.store_id), code: String(row.code), name: String(row.name), active: true, defaultWarehouse: row.default_warehouse === true }));
    missing("WAREHOUSE", wanted.warehouses, warehouses.map((warehouse) => warehouse.id));

    const productRows = wanted.products.length ? await rows(tx, sql`select p.id, p.category_id, p.name, p.slug, p.description, p.brand, p.status, p.version, p.updated_at,
        (select coalesce(pi.storage_key, pi.image_url) from product_images pi where pi.product_id = p.id order by pi.is_primary desc, pi.sort_order, pi.created_at limit 1) as image,
        (select pi.storage_key is not null from product_images pi where pi.product_id = p.id order by pi.is_primary desc, pi.sort_order, pi.created_at limit 1) as managed
      from products p where p.company_id = ${scope.companyId}::uuid and p.status <> 'INACTIVE' and p.id ${any(wanted.products)}`) : [];
    const productIds = productRows.map((row) => String(row.id));
    const variantRows = productIds.length ? await rows(tx, sql`select id, product_id, sku, size, color, price, currency, active from product_variants where product_id = any(${uuidList(productIds)}) order by sku`) : [];
    const stockRows = productIds.length ? await rows(tx, sql`select ist.variant_id, ist.warehouse_id, ist.physical_quantity - ist.committed_quantity as available
      from inventory_stocks ist join product_variants pv on pv.id = ist.variant_id join warehouses w on w.id = ist.warehouse_id
      where pv.product_id = any(${uuidList(productIds)}) and ${inStores(sql`w.store_id`)}`) : [];
    const base = this.config.value.VELORA_PUBLIC_BACKEND_URL.replace(/\/$/, "");
    const variantProduct = new Map(variantRows.map((row) => [String(row.id), String(row.product_id)]));
    const products = productRows.map((row) => ({
      id: String(row.id), categoryId: String(row.category_id), name: String(row.name), slug: String(row.slug), description: str(row.description), brand: str(row.brand),
      status: String(row.status), version: Number(row.version), updatedAt: new Date(String(row.updated_at)).toISOString(),
      imageUrl: row.image ? (row.managed ? `${base}/api/catalog/assets/${String(row.image)}` : String(row.image)) : null,
      variants: variantRows.filter((variant) => String(variant.product_id) === String(row.id)).map((variant) => ({
        id: String(variant.id), sku: String(variant.sku), size: String(variant.size), color: String(variant.color), price: Number(variant.price), currency: String(variant.currency), active: variant.active === true,
      })),
      stock: stockRows.filter((stock) => variantProduct.get(String(stock.variant_id)) === String(row.id)).map((stock) => ({ variantId: String(stock.variant_id), warehouseId: String(stock.warehouse_id), available: Number(stock.available) })),
    }));
    missing("PRODUCT", wanted.products, productIds);

    const customerRows = wanted.customers.length ? await rows(tx, sql`select id, first_name, last_name, email, phone, tax_id, customer_type, business_name, password_hash is not null as has_access, version
      from app_users where registered_company_id = ${scope.companyId}::uuid and role = 'CUSTOMER' and id ${any(wanted.customers)}`) : [];
    const customers = customerRows.map((row) => this.toCustomer(row));
    missing("CUSTOMER", wanted.customers, customers.map((customer) => customer.id));

    return { categories, products, stores, warehouses, customers, tombstones };
  }

  toCustomer(row: Row): SyncCustomer {
    return {
      id: String(row.id), firstName: String(row.first_name), lastName: String(row.last_name), email: str(row.email), phone: str(row.phone),
      taxId: str(row.tax_id), customerType: str(row.customer_type), businessName: str(row.business_name), hasAccess: row.has_access === true, version: Number(row.version),
    };
  }
}

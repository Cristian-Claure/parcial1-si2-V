import { randomBytes, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { appUsers, categories, companies, stores, warehouses } from "@velora/database";
import type { CompanyProvision } from "@velora/contracts";
import { DatabaseService } from "../database/database.service.js";

export type ProvisioningTransaction = Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0];

/** Categorías base de moda con las que nace toda tienda nueva. */
export const BASE_FASHION_CATEGORIES = [
  { name: "Mujer", slug: "mujer" },
  { name: "Hombre", slug: "hombre" },
  { name: "Accesorios", slug: "accesorios" },
  { name: "Calzado", slug: "calzado" },
  { name: "Nueva temporada", slug: "nueva-temporada" },
] as const;

export interface ProvisionedCompany {
  companyId: string;
  storeId: string;
  warehouseId: string;
}

function companyCodeFor(slug: string): string {
  return slug.toUpperCase().replace(/-/g, "_").slice(0, 34);
}

/**
 * Aprovisionamiento en una transacción provista por el llamador: compañía + sucursal
 * principal + almacén por defecto + categorías base. Si algo falla, no queda nada creado.
 */
@Injectable()
export class ProvisioningRepository {
  constructor(private readonly database: DatabaseService) {}

  transaction<T>(work: (tx: ProvisioningTransaction) => Promise<T>): Promise<T> {
    return this.database.db.transaction(work);
  }

  async slugTaken(slug: string): Promise<boolean> {
    const rows = await this.database.db.select({ id: companies.id }).from(companies).where(eq(companies.slug, slug)).limit(1);
    return rows.length > 0;
  }

  async insertOwner(tx: ProvisioningTransaction, owner: { firstName: string; lastName: string; email: string; passwordHash: string }): Promise<string> {
    const now = new Date();
    const id = randomUUID();
    await tx.insert(appUsers).values({
      id, firstName: owner.firstName.trim(), lastName: owner.lastName.trim(), email: owner.email.trim().toLowerCase(),
      passwordHash: owner.passwordHash, role: "ADMIN", customerType: null, phone: null, businessName: null, taxId: null,
      status: "ACTIVE", storeId: null, createdAt: now, updatedAt: now,
    });
    return id;
  }

  async provisionCompany(tx: ProvisioningTransaction, ownerUserId: string, input: CompanyProvision): Promise<ProvisionedCompany> {
    const now = new Date();
    const companyId = randomUUID();
    const exists = await tx.execute(sql`select 1 from companies where code = ${companyCodeFor(input.slug)}`);
    const code = exists.rows.length > 0 ? `${companyCodeFor(input.slug)}_${randomBytes(2).toString("hex").toUpperCase()}` : companyCodeFor(input.slug);
    await tx.insert(companies).values({
      id: companyId, code, name: input.name.trim(), description: null, active: true, ownerUserId, slug: input.slug,
      displayName: input.name.trim(), tagline: input.tagline?.trim() || null, logoStorageKey: null, bannerStorageKey: null,
      brandPalette: input.accentColor ? { accent: input.accentColor.toUpperCase() } : null, contact: null,
      createdAt: now, updatedAt: now,
    });
    const store = await this.provisionStore(tx, companyId, { code: "PRINCIPAL", name: input.storeName?.trim() || "Sucursal principal", city: input.city ?? null, address: null });
    for (const category of BASE_FASHION_CATEGORIES) {
      await tx.insert(categories).values({
        id: randomUUID(), companyId, parentId: null, name: category.name, slug: category.slug, description: null, active: true, createdAt: now, updatedAt: now,
      });
    }
    return { companyId, ...store };
  }

  /** Sucursal + almacén por defecto (necesario para recibir pedidos en línea y POS). */
  async provisionStore(tx: ProvisioningTransaction, companyId: string, input: { code: string; name: string; city: string | null; address: string | null }): Promise<{ storeId: string; warehouseId: string }> {
    const now = new Date();
    const storeId = randomUUID();
    await tx.insert(stores).values({
      id: storeId, companyId, code: input.code.trim().toUpperCase(), name: input.name.trim(), address: input.address, description: null,
      city: input.city, phone: null, email: null, active: true, createdAt: now, updatedAt: now,
    });
    const warehouseId = randomUUID();
    await tx.insert(warehouses).values({
      id: warehouseId, storeId, code: `ALM-${input.code.trim().toUpperCase()}`.slice(0, 50), name: `Almacén ${input.name.trim()}`.slice(0, 120),
      description: null, active: true, defaultWarehouse: true, createdAt: now, updatedAt: now,
    });
    return { storeId, warehouseId };
  }
}

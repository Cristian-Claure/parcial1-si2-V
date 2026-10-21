import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, asc, eq, sql } from "drizzle-orm";
import type { AssignStoreManagerResponse, CreateManagerRequest, ManagerResponse } from "@velora/contracts";
import { appUsers, companies, stores } from "@velora/database";
import { DatabaseService } from "../database/database.service.js";

const managerSelection = {
  id: appUsers.id, firstName: appUsers.firstName, lastName: appUsers.lastName, email: appUsers.email,
  role: appUsers.role, customerType: appUsers.customerType, phone: appUsers.phone, businessName: appUsers.businessName,
  taxId: appUsers.taxId, status: appUsers.status, storeId: appUsers.storeId, storeName: stores.name, companyId: stores.companyId,
};

export interface AdminStoreRecord { id: string; companyId: string; active: boolean }

export type ManagerAssignment =
  | { kind: "EXISTING"; userId: string }
  | { kind: "NEW"; request: CreateManagerRequest; passwordHash: string };

@Injectable()
export class AdminRepository {
  constructor(private readonly database: DatabaseService) {}
  async listManagers(companyId: string): Promise<ManagerResponse[]> {
    const rows = await this.database.db.select(managerSelection).from(appUsers).innerJoin(stores, eq(appUsers.storeId, stores.id)).where(and(
      eq(appUsers.role, "STORE_MANAGER"), eq(stores.companyId, companyId),
    )).orderBy(asc(appUsers.firstName), asc(appUsers.lastName));
    return rows as ManagerResponse[];
  }
  async companyActive(companyId: string): Promise<boolean> {
    const rows = await this.database.db.select({ id: companies.id }).from(companies)
      .where(and(eq(companies.id, companyId), eq(companies.active, true))).limit(1);
    return rows.length > 0;
  }
  async storeValid(companyId: string, storeId: string): Promise<boolean> {
    const rows = await this.database.db.select({ id: stores.id }).from(stores).where(and(
      eq(stores.id, storeId), eq(stores.companyId, companyId), eq(stores.active, true),
    )).limit(1);
    return rows.length > 0;
  }
  async findStore(storeId: string): Promise<AdminStoreRecord | null> {
    const rows = await this.database.db.select({ id: stores.id, companyId: stores.companyId, active: stores.active }).from(stores)
      .where(eq(stores.id, storeId)).limit(1);
    return rows[0] ?? null;
  }
  async findManager(userId: string): Promise<{ id: string; companyId: string } | null> {
    const rows = await this.database.db.select({ id: appUsers.id, companyId: stores.companyId }).from(appUsers)
      .innerJoin(stores, eq(appUsers.storeId, stores.id))
      .where(and(eq(appUsers.id, userId), eq(appUsers.role, "STORE_MANAGER"))).limit(1);
    return rows[0] ?? null;
  }
  async activeManagerId(storeId: string): Promise<string | null> {
    const rows = await this.database.db.select({ id: appUsers.id }).from(appUsers).where(and(
      eq(appUsers.storeId, storeId), eq(appUsers.role, "STORE_MANAGER"), eq(appUsers.status, "ACTIVE"),
    )).limit(1);
    return rows[0]?.id ?? null;
  }
  async emailExists(email: string): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    const rows = await this.database.db.select({ id: appUsers.id }).from(appUsers)
      .where(sql<boolean>`lower(${appUsers.email}) = ${normalized}`).limit(1);
    return rows.length > 0;
  }
  async createManager(request: CreateManagerRequest, passwordHash: string): Promise<ManagerResponse> {
    const id = await this.insertManager(this.database.db, request, passwordHash);
    return this.requireManager(id);
  }

  /** Bloquea la sucursal, desactiva al encargado activo (si lo hay) y activa al nuevo, en una transacción. */
  async assignManager(store: AdminStoreRecord, assignment: ManagerAssignment): Promise<AssignStoreManagerResponse> {
    const result = await this.database.db.transaction(async (tx) => {
      await tx.execute(sql`select id from stores where id = ${store.id}::uuid for update`);
      const current = await tx.select({ id: appUsers.id }).from(appUsers).where(and(
        eq(appUsers.storeId, store.id), eq(appUsers.role, "STORE_MANAGER"), eq(appUsers.status, "ACTIVE"),
      ));
      const now = new Date();
      const keep = assignment.kind === "EXISTING" ? assignment.userId : null;
      const replaced = current.map((row) => row.id).filter((id) => id !== keep);
      for (const id of replaced) {
        await tx.update(appUsers).set({ status: "INACTIVE", updatedAt: now }).where(eq(appUsers.id, id));
      }
      let managerId: string;
      if (assignment.kind === "EXISTING") {
        await tx.update(appUsers).set({ storeId: store.id, status: "ACTIVE", updatedAt: now }).where(eq(appUsers.id, assignment.userId));
        managerId = assignment.userId;
      } else {
        managerId = await this.insertManager(tx, assignment.request, assignment.passwordHash);
      }
      return { managerId, replacedManagerId: replaced[0] ?? null };
    });
    return { manager: await this.requireManager(result.managerId), replacedManagerId: result.replacedManagerId };
  }

  /** drizzle envuelve el error de pg en `cause`; se revisan ambos niveles. */
  isUniqueViolation(error: unknown): boolean {
    return this.pgError(error)?.code === "23505";
  }
  constraintOf(error: unknown): string | null {
    return this.pgError(error)?.constraint ?? null;
  }
  private pgError(error: unknown): { code?: string; constraint?: string } | null {
    for (const candidate of [error, typeof error === "object" && error !== null ? (error as { cause?: unknown }).cause : null]) {
      if (typeof candidate === "object" && candidate !== null && "code" in candidate) return candidate as { code?: string; constraint?: string };
    }
    return null;
  }

  private async insertManager(db: Pick<DatabaseService["db"], "insert">, request: CreateManagerRequest, passwordHash: string): Promise<string> {
    const now = new Date();
    const id = randomUUID();
    await db.insert(appUsers).values({
      id, firstName: request.firstName.trim(), lastName: request.lastName.trim(),
      email: request.email.trim().toLowerCase(), passwordHash, role: "STORE_MANAGER", customerType: null,
      phone: null, businessName: null, taxId: null, status: "ACTIVE", storeId: request.storeId,
      createdAt: now, updatedAt: now,
    });
    return id;
  }
  private async requireManager(id: string): Promise<ManagerResponse> {
    const rows = await this.database.db.select(managerSelection).from(appUsers)
      .innerJoin(stores, eq(appUsers.storeId, stores.id)).where(eq(appUsers.id, id)).limit(1);
    const manager = rows[0];
    if (!manager) throw new Error("El encargado no pudo recuperarse.");
    return manager as ManagerResponse;
  }
}

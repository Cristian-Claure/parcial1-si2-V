import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, asc, eq, sql } from "drizzle-orm";
import type { CreateManagerRequest, ManagerResponse } from "@velora/contracts";
import { appUsers, companies, stores } from "@velora/database";
import { DatabaseService } from "../database/database.service.js";

@Injectable()
export class AdminRepository {
  constructor(private readonly database: DatabaseService) {}

  async listManagers(companyId: string): Promise<ManagerResponse[]> {
    const rows = await this.database.db.select({
      id: appUsers.id, firstName: appUsers.firstName, lastName: appUsers.lastName, email: appUsers.email,
      role: appUsers.role, customerType: appUsers.customerType, phone: appUsers.phone, businessName: appUsers.businessName,
      taxId: appUsers.taxId, status: appUsers.status, storeId: appUsers.storeId, storeName: stores.name, companyId: stores.companyId,
    }).from(appUsers).innerJoin(stores, eq(appUsers.storeId, stores.id)).where(and(
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

  async emailExists(email: string): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    const rows = await this.database.db.select({ id: appUsers.id }).from(appUsers)
      .where(sql<boolean>`lower(${appUsers.email}) = ${normalized}`).limit(1);
    return rows.length > 0;
  }

  async createManager(request: CreateManagerRequest, passwordHash: string): Promise<ManagerResponse> {
    const now = new Date();
    const rows = await this.database.db.insert(appUsers).values({
      id: randomUUID(), firstName: request.firstName.trim(), lastName: request.lastName.trim(),
      email: request.email.trim().toLowerCase(), passwordHash, role: "STORE_MANAGER", customerType: null,
      phone: null, businessName: null, taxId: null, status: "ACTIVE", storeId: request.storeId,
      createdAt: now, updatedAt: now,
    }).returning({
      id: appUsers.id, firstName: appUsers.firstName, lastName: appUsers.lastName, email: appUsers.email,
      role: appUsers.role, customerType: appUsers.customerType, phone: appUsers.phone, businessName: appUsers.businessName,
      taxId: appUsers.taxId, status: appUsers.status, storeId: appUsers.storeId,
    });
    const created = rows[0];
    if (!created) throw new Error("No se pudo crear el encargado.");
    const storeRows = await this.database.db.select({ name: stores.name, companyId: stores.companyId }).from(stores)
      .where(eq(stores.id, request.storeId)).limit(1);
    const store = storeRows[0];
    if (!store) throw new Error("La sucursal del encargado no pudo recuperarse.");
    return { ...created, storeName: store.name, companyId: store.companyId } as ManagerResponse;
  }

  isUniqueViolation(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505";
  }
}

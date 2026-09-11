import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type {
  CustomerAddressRequest,
  CustomerAddressResponse,
  CustomerFavoriteResponse,
  CustomerProfileUpdateRequest,
  UserProfile,
} from "@velora/contracts";
import { appUsers, customerAddresses, customerFavorites, products } from "@velora/database";
import { DatabaseService } from "../database/database.service.js";

@Injectable()
export class CustomerRepository {
  constructor(private readonly database: DatabaseService) {}

  async profile(userId: string): Promise<UserProfile | null> {
    const rows = await this.database.db.select({
      id: appUsers.id, firstName: appUsers.firstName, lastName: appUsers.lastName,
      email: appUsers.email, role: appUsers.role, customerType: appUsers.customerType,
      phone: appUsers.phone, businessName: appUsers.businessName, taxId: appUsers.taxId,
      status: appUsers.status, storeId: appUsers.storeId,
    }).from(appUsers).where(eq(appUsers.id, userId)).limit(1);
    const user = rows[0];
    return user ? { ...user, storeName: null } : null;
  }

  async updateProfile(userId: string, request: CustomerProfileUpdateRequest): Promise<UserProfile | null> {
    const now = new Date();
    await this.database.db.update(appUsers).set({
      firstName: request.firstName.trim(), lastName: request.lastName.trim(),
      phone: this.nullIfBlank(request.phone), customerType: request.customerType,
      businessName: request.customerType === "B2B" ? this.nullIfBlank(request.businessName) : null,
      taxId: request.customerType === "B2B" ? this.nullIfBlank(request.taxId) : null,
      updatedAt: now,
    }).where(eq(appUsers.id, userId));
    return this.profile(userId);
  }

  async listAddresses(userId: string): Promise<CustomerAddressResponse[]> {
    const rows = await this.database.db.select().from(customerAddresses)
      .where(and(eq(customerAddresses.userId, userId), eq(customerAddresses.active, true)))
      .orderBy(desc(customerAddresses.isDefault), asc(customerAddresses.createdAt));
    return rows.map(this.mapAddress);
  }

  async createAddress(userId: string, request: CustomerAddressRequest): Promise<CustomerAddressResponse> {
    return this.database.db.transaction(async (tx) => {
      await tx.execute(sql`select id from customer_addresses where user_id = ${userId}::uuid and active = true for update`);
      const existing = await tx.select({ id: customerAddresses.id }).from(customerAddresses)
        .where(and(eq(customerAddresses.userId, userId), eq(customerAddresses.active, true))).limit(1);
      const makeDefault = request.defaultAddress || existing.length === 0;
      if (makeDefault) {
        await tx.update(customerAddresses).set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(customerAddresses.userId, userId), eq(customerAddresses.active, true)));
      }
      const now = new Date();
      const rows = await tx.insert(customerAddresses).values({
        id: randomUUID(), userId, label: request.label.trim(), recipientName: request.recipientName.trim(),
        recipientPhone: request.recipientPhone.trim(), department: request.department.trim(), city: request.city.trim(),
        zone: this.nullIfBlank(request.zone), addressLine: request.addressLine.trim(), reference: this.nullIfBlank(request.reference),
        isDefault: makeDefault, active: true, createdAt: now, updatedAt: now,
      }).returning();
      const created = rows[0];
      if (!created) throw new Error("No se pudo crear la dirección.");
      return this.mapAddress(created);
    });
  }

  async updateAddress(userId: string, addressId: string, request: CustomerAddressRequest): Promise<CustomerAddressResponse | null> {
    return this.database.db.transaction(async (tx) => {
      await tx.execute(sql`select id from customer_addresses where id = ${addressId}::uuid and user_id = ${userId}::uuid and active = true for update`);
      const currentRows = await tx.select().from(customerAddresses).where(and(
        eq(customerAddresses.id, addressId), eq(customerAddresses.userId, userId), eq(customerAddresses.active, true),
      )).limit(1);
      const current = currentRows[0];
      if (!current) return null;
      if (request.defaultAddress) {
        await tx.update(customerAddresses).set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(customerAddresses.userId, userId), eq(customerAddresses.active, true)));
      }
      const rows = await tx.update(customerAddresses).set({
        label: request.label.trim(), recipientName: request.recipientName.trim(), recipientPhone: request.recipientPhone.trim(),
        department: request.department.trim(), city: request.city.trim(), zone: this.nullIfBlank(request.zone),
        addressLine: request.addressLine.trim(), reference: this.nullIfBlank(request.reference),
        isDefault: request.defaultAddress ? true : current.isDefault, updatedAt: new Date(),
      }).where(eq(customerAddresses.id, addressId)).returning();
      return rows[0] ? this.mapAddress(rows[0]) : null;
    });
  }

  async deleteAddress(userId: string, addressId: string): Promise<boolean> {
    return this.database.db.transaction(async (tx) => {
      await tx.execute(sql`select id from customer_addresses where id = ${addressId}::uuid and user_id = ${userId}::uuid and active = true for update`);
      const currentRows = await tx.select().from(customerAddresses).where(and(
        eq(customerAddresses.id, addressId), eq(customerAddresses.userId, userId), eq(customerAddresses.active, true),
      )).limit(1);
      const current = currentRows[0];
      if (!current) return false;
      await tx.update(customerAddresses).set({ active: false, isDefault: false, updatedAt: new Date() })
        .where(eq(customerAddresses.id, addressId));
      if (current.isDefault) {
        const remaining = await tx.select({ id: customerAddresses.id }).from(customerAddresses)
          .where(and(eq(customerAddresses.userId, userId), eq(customerAddresses.active, true)))
          .orderBy(asc(customerAddresses.createdAt)).limit(1);
        if (remaining[0]) {
          await tx.update(customerAddresses).set({ isDefault: true, updatedAt: new Date() })
            .where(eq(customerAddresses.id, remaining[0].id));
        }
      }
      return true;
    });
  }

  async listFavorites(customerId: string): Promise<CustomerFavoriteResponse[]> {
    const rows = await this.database.db.select({
      id: customerFavorites.id, productId: customerFavorites.productId, createdAt: customerFavorites.createdAt,
    }).from(customerFavorites).innerJoin(products, eq(customerFavorites.productId, products.id))
      .where(and(eq(customerFavorites.customerId, customerId), eq(products.status, "ACTIVE")))
      .orderBy(desc(customerFavorites.createdAt));
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }

  async addFavorite(customerId: string, productId: string): Promise<CustomerFavoriteResponse | "PRODUCT_NOT_FOUND"> {
    const productRows = await this.database.db.select({ id: products.id }).from(products)
      .where(and(eq(products.id, productId), eq(products.status, "ACTIVE"))).limit(1);
    if (!productRows[0]) return "PRODUCT_NOT_FOUND";
    const existing = await this.database.db.select({
      id: customerFavorites.id, productId: customerFavorites.productId, createdAt: customerFavorites.createdAt,
    }).from(customerFavorites).where(and(eq(customerFavorites.customerId, customerId), eq(customerFavorites.productId, productId))).limit(1);
    if (existing[0]) return { ...existing[0], createdAt: existing[0].createdAt.toISOString() };
    const now = new Date();
    const rows = await this.database.db.insert(customerFavorites).values({ id: randomUUID(), customerId, productId, createdAt: now })
      .returning({ id: customerFavorites.id, productId: customerFavorites.productId, createdAt: customerFavorites.createdAt });
    const created = rows[0];
    if (!created) throw new Error("No se pudo registrar el favorito.");
    return { ...created, createdAt: created.createdAt.toISOString() };
  }

  async removeFavorite(customerId: string, productId: string): Promise<void> {
    await this.database.db.delete(customerFavorites).where(and(
      eq(customerFavorites.customerId, customerId), eq(customerFavorites.productId, productId),
    ));
  }

  private mapAddress(row: typeof customerAddresses.$inferSelect): CustomerAddressResponse {
    return {
      id: row.id, label: row.label, recipientName: row.recipientName, recipientPhone: row.recipientPhone,
      department: row.department, city: row.city, zone: row.zone, addressLine: row.addressLine,
      reference: row.reference, defaultAddress: row.isDefault,
    };
  }

  private nullIfBlank(value: string | null | undefined): string | null {
    const clean = value?.trim() ?? "";
    return clean.length ? clean : null;
  }
}

import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import type { PushInstallationResponse, PushPlatform, RegisterPushInstallationRequest } from "@velora/contracts";
import { appUsers, orders, payments, pushInstallations } from "@velora/database";
import { DatabaseService } from "../database/database.service.js";

export interface PushDeliveryTarget {
  id: string;
  installationId: string;
  platform: PushPlatform;
}

export interface CustomerOrderPushTarget {
  userId: string;
  orderId: string;
  orderNumber: string;
}

@Injectable()
export class PushRepository {
  constructor(private readonly database: DatabaseService) {}

  async isActiveCustomer(userId: string): Promise<boolean> {
    const rows = await this.database.db.select({ id: appUsers.id }).from(appUsers).where(and(eq(appUsers.id, userId), eq(appUsers.role, "CUSTOMER"), eq(appUsers.status, "ACTIVE"))).limit(1);
    return Boolean(rows[0]);
  }

  async register(userId: string, request: RegisterPushInstallationRequest): Promise<PushInstallationResponse> {
    const now = new Date();
    const deviceLabel = request.deviceLabel?.trim() || null;
    const id = randomUUID();
    await this.database.db.insert(pushInstallations).values({
      id,
      userId,
      installationId: request.installationId.trim(),
      platform: request.platform,
      deviceLabel,
      active: true,
      lastSeenAt: now,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [pushInstallations.platform, pushInstallations.installationId],
      set: { userId, deviceLabel, active: true, lastSeenAt: now, revokedAt: null, updatedAt: now },
    });

    const rows = await this.database.db.select().from(pushInstallations).where(and(eq(pushInstallations.platform, request.platform), eq(pushInstallations.installationId, request.installationId.trim()))).limit(1);
    const row = rows[0];
    if (!row) throw new Error("Push installation was not persisted.");
    return this.response(row);
  }

  async revoke(userId: string, platform: PushPlatform, installationId: string): Promise<void> {
    const now = new Date();
    await this.database.db.update(pushInstallations).set({ active: false, revokedAt: now, lastSeenAt: now, updatedAt: now }).where(and(eq(pushInstallations.userId, userId), eq(pushInstallations.platform, platform), eq(pushInstallations.installationId, installationId)));
  }

  async revokeById(id: string): Promise<void> {
    const now = new Date();
    await this.database.db.update(pushInstallations).set({ active: false, revokedAt: now, lastSeenAt: now, updatedAt: now }).where(eq(pushInstallations.id, id));
  }

  async activeForUser(userId: string): Promise<PushDeliveryTarget[]> {
    return this.database.db.select({ id: pushInstallations.id, installationId: pushInstallations.installationId, platform: pushInstallations.platform }).from(pushInstallations).where(and(eq(pushInstallations.userId, userId), eq(pushInstallations.active, true))).orderBy(desc(pushInstallations.updatedAt));
  }

  async orderTarget(orderId: string): Promise<CustomerOrderPushTarget | null> {
    const rows = await this.database.db.select({ userId: orders.customerId, orderId: orders.id, orderNumber: orders.orderNumber, channel: orders.orderChannel }).from(orders).where(eq(orders.id, orderId)).limit(1);
    const row = rows[0];
    if (!row || !row.userId || row.channel !== "ECOMMERCE") return null;
    return { userId: row.userId, orderId: row.orderId, orderNumber: row.orderNumber };
  }

  async stripeTarget(externalReference: string): Promise<CustomerOrderPushTarget | null> {
    const rows = await this.database.db.select({ userId: orders.customerId, orderId: orders.id, orderNumber: orders.orderNumber, channel: orders.orderChannel }).from(payments).innerJoin(orders, eq(payments.orderId, orders.id)).where(and(eq(payments.provider, "STRIPE"), eq(payments.externalReference, externalReference))).limit(1);
    const row = rows[0];
    if (!row || !row.userId || row.channel !== "ECOMMERCE") return null;
    return { userId: row.userId, orderId: row.orderId, orderNumber: row.orderNumber };
  }

  private response(row: typeof pushInstallations.$inferSelect): PushInstallationResponse {
    return {
      id: row.id,
      installationId: row.installationId,
      platform: row.platform,
      deviceLabel: row.deviceLabel,
      active: row.active,
      lastSeenAt: row.lastSeenAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

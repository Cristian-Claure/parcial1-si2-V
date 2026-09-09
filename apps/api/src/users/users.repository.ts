import {
  randomUUID,
} from "node:crypto";

import {
  Injectable,
} from "@nestjs/common";

import {
  eq,
  sql,
} from "drizzle-orm";

import type {
  UserProfile,
} from "@velora/contracts";

import {
  appUsers,
  stores,
  type DatabaseCustomerType,
  type DatabaseUserRole,
  type DatabaseUserStatus,
} from "@velora/database";

import {
  DatabaseService,
} from "../database/database.service.js";

export interface UserRecord {
  id:
    string;

  firstName:
    string;

  lastName:
    string;

  email:
    string;

  passwordHash:
    string;

  role:
    DatabaseUserRole;

  customerType:
    DatabaseCustomerType |
    null;

  phone:
    string |
    null;

  businessName:
    string |
    null;

  taxId:
    string |
    null;

  status:
    DatabaseUserStatus;

  storeId:
    string |
    null;

  storeName:
    string |
    null;

  storeCompanyId:
    string |
    null;
}

const userSelection = {
  id:
    appUsers.id,

  firstName:
    appUsers.firstName,

  lastName:
    appUsers.lastName,

  email:
    appUsers.email,

  passwordHash:
    appUsers.passwordHash,

  role:
    appUsers.role,

  customerType:
    appUsers.customerType,

  phone:
    appUsers.phone,

  businessName:
    appUsers.businessName,

  taxId:
    appUsers.taxId,

  status:
    appUsers.status,

  storeId:
    appUsers.storeId,

  storeName:
    stores.name,

  storeCompanyId:
    stores.companyId,
} as const;

@Injectable()
export class UsersRepository {
  constructor(
    private readonly database:
      DatabaseService,
  ) {}

  async findByEmail(
    email: string,
  ): Promise<UserRecord | null> {
    const normalizedEmail =
      email
        .trim()
        .toLowerCase();

    const rows =
      await this.database.db
        .select(
          userSelection,
        )
        .from(
          appUsers,
        )
        .leftJoin(
          stores,
          eq(
            appUsers.storeId,
            stores.id,
          ),
        )
        .where(
          sql<boolean>`
            lower(${appUsers.email})
            =
            ${normalizedEmail}
          `,
        )
        .limit(1);

    return rows[0] ?? null;
  }

  async emailExists(
    email: string,
  ): Promise<boolean> {
    return (
      await this.findByEmail(
        email,
      )
    ) !== null;
  }

  async findById(
    id: string,
  ): Promise<UserRecord | null> {
    const rows =
      await this.database.db
        .select(
          userSelection,
        )
        .from(
          appUsers,
        )
        .leftJoin(
          stores,
          eq(
            appUsers.storeId,
            stores.id,
          ),
        )
        .where(
          eq(
            appUsers.id,
            id,
          ),
        )
        .limit(1);

    return rows[0] ?? null;
  }

  async createCustomer(
    input: {
      firstName: string;
      lastName: string;
      email: string;
      passwordHash: string;
    },
  ): Promise<UserRecord> {
    const now =
      new Date();

    const inserted =
      await this.database.db
        .insert(
          appUsers,
        )
        .values({
          id:
            randomUUID(),

          firstName:
            input
              .firstName
              .trim(),

          lastName:
            input
              .lastName
              .trim(),

          email:
            input
              .email
              .trim()
              .toLowerCase(),

          passwordHash:
            input.passwordHash,

          role:
            "CUSTOMER",

          customerType:
            "B2C",

          phone:
            null,

          businessName:
            null,

          taxId:
            null,

          status:
            "ACTIVE",

          storeId:
            null,

          createdAt:
            now,

          updatedAt:
            now,
        })
        .returning({
          id:
            appUsers.id,

          firstName:
            appUsers.firstName,

          lastName:
            appUsers.lastName,

          email:
            appUsers.email,

          passwordHash:
            appUsers.passwordHash,

          role:
            appUsers.role,

          customerType:
            appUsers.customerType,

          phone:
            appUsers.phone,

          businessName:
            appUsers.businessName,

          taxId:
            appUsers.taxId,

          status:
            appUsers.status,

          storeId:
            appUsers.storeId,
        });

    const user =
      inserted[0];

    if (!user) {
      throw new Error(
        "No se pudo crear el usuario.",
      );
    }

    return {
      ...user,

      storeName:
        null,

      storeCompanyId:
        null,
    };
  }

  toProfile(
    user: UserRecord,
  ): UserProfile {
    return {
      id:
        user.id,

      firstName:
        user.firstName,

      lastName:
        user.lastName,

      email:
        user.email,

      role:
        user.role,

      customerType:
        user.customerType,

      phone:
        user.phone,

      businessName:
        user.businessName,

      taxId:
        user.taxId,

      status:
        user.status,

      storeId:
        user.storeId,

      storeName:
        user.storeName,
    };
  }

  isUniqueViolation(
    error: unknown,
  ): boolean {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error)
    ) {
      return false;
    }

    return (
      (
        error as {
          code?: unknown;
        }
      ).code ===
      "23505"
    );
  }
}

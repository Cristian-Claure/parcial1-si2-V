import {
  randomUUID,
} from "node:crypto";

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
  getDatabaseClient,
} from "./database";

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
} as const;

export async function findUserByEmail(
  email: string,
): Promise<UserRecord | null> {
  const {
    db,
  } = getDatabaseClient();

  const normalizedEmail =
    email
      .trim()
      .toLowerCase();

  const rows =
    await db
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

export async function userEmailExists(
  email: string,
): Promise<boolean> {
  return (
    await findUserByEmail(
      email,
    )
  ) !== null;
}

export async function findUserById(
  id: string,
): Promise<UserRecord | null> {
  const {
    db,
  } = getDatabaseClient();

  const rows =
    await db
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

export async function createCustomerUser(
  input: {
    firstName: string;
    lastName: string;
    email: string;
    passwordHash: string;
  },
): Promise<UserRecord> {
  const {
    db,
  } = getDatabaseClient();

  const now =
    new Date();

  const inserted =
    await db
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
  };
}

export function toUserProfile(
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

export function isDatabaseUniqueViolation(
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
    ).code === "23505"
  );
}
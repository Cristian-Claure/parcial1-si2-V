import {
  relations,
  sql,
} from "drizzle-orm";

import {
  boolean,
  check,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export type DatabaseUserRole =
  | "ADMIN"
  | "STORE_MANAGER"
  | "CUSTOMER";

export type DatabaseUserStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "BLOCKED";

export type DatabaseCustomerType =
  | "B2C"
  | "B2B";

export const stores = pgTable(
  "stores",
  {
    id:
      uuid("id")
        .primaryKey(),

    code:
      varchar(
        "code",
        {
          length: 40,
        },
      )
        .notNull()
        .unique(),

    name:
      varchar(
        "name",
        {
          length: 120,
        },
      )
        .notNull(),

    address:
      varchar(
        "address",
        {
          length: 240,
        },
      ),

    active:
      boolean("active")
        .notNull()
        .default(true),

    createdAt:
      timestamp(
        "created_at",
        {
          withTimezone: true,
          mode: "date",
        },
      )
        .notNull(),

    updatedAt:
      timestamp(
        "updated_at",
        {
          withTimezone: true,
          mode: "date",
        },
      )
        .notNull(),
  },
);

export const appUsers = pgTable(
  "app_users",
  {
    id:
      uuid("id")
        .primaryKey(),

    firstName:
      varchar(
        "first_name",
        {
          length: 80,
        },
      )
        .notNull(),

    lastName:
      varchar(
        "last_name",
        {
          length: 100,
        },
      )
        .notNull(),

    email:
      varchar(
        "email",
        {
          length: 180,
        },
      )
        .notNull()
        .unique(),

    passwordHash:
      varchar(
        "password_hash",
        {
          length: 120,
        },
      )
        .notNull(),

    role:
      varchar(
        "role",
        {
          length: 30,
        },
      )
        .$type<DatabaseUserRole>()
        .notNull(),

    customerType:
      varchar(
        "customer_type",
        {
          length: 10,
        },
      )
        .$type<DatabaseCustomerType>(),

    phone:
      varchar(
        "phone",
        {
          length: 40,
        },
      ),

    businessName:
      varchar(
        "business_name",
        {
          length: 160,
        },
      ),

    taxId:
      varchar(
        "tax_id",
        {
          length: 40,
        },
      ),

    status:
      varchar(
        "status",
        {
          length: 20,
        },
      )
        .$type<DatabaseUserStatus>()
        .notNull(),

    storeId:
      uuid("store_id")
        .references(
          () => stores.id,
        ),

    createdAt:
      timestamp(
        "created_at",
        {
          withTimezone: true,
          mode: "date",
        },
      )
        .notNull(),

    updatedAt:
      timestamp(
        "updated_at",
        {
          withTimezone: true,
          mode: "date",
        },
      )
        .notNull(),
  },
  (table) => [
    index(
      "idx_app_users_role",
    ).on(
      table.role,
    ),

    index(
      "idx_app_users_store_id",
    ).on(
      table.storeId,
    ),

    check(
      "ck_app_users_role",
      sql`
        ${table.role}
        in (
          'ADMIN',
          'STORE_MANAGER',
          'CUSTOMER'
        )
      `,
    ),

    check(
      "ck_app_users_status",
      sql`
        ${table.status}
        in (
          'ACTIVE',
          'INACTIVE',
          'BLOCKED'
        )
      `,
    ),

    check(
      "ck_app_users_customer_type",
      sql`
        ${table.customerType}
        is null
        or
        ${table.customerType}
        in (
          'B2C',
          'B2B'
        )
      `,
    ),

    check(
      "ck_store_manager_requires_store",
      sql`
        ${table.role}
        <> 'STORE_MANAGER'
        or
        ${table.storeId}
        is not null
      `,
    ),

    check(
      "ck_customer_type_by_role",
      sql`
        (
          ${table.role}
          = 'CUSTOMER'
          and
          ${table.customerType}
          is not null
        )
        or
        (
          ${table.role}
          <> 'CUSTOMER'
          and
          ${table.customerType}
          is null
        )
      `,
    ),
  ],
);

export const storesRelations =
  relations(
    stores,
    ({ many }) => ({
      users:
        many(appUsers),
    }),
  );

export const appUsersRelations =
  relations(
    appUsers,
    ({ one }) => ({
      store:
        one(
          stores,
          {
            fields: [
              appUsers.storeId,
            ],
            references: [
              stores.id,
            ],
          },
        ),
    }),
  );

export type StoreRow =
  typeof stores.$inferSelect;

export type AppUserRow =
  typeof appUsers.$inferSelect;
import {
  relations,
  sql,
} from "drizzle-orm";

import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
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

export type DatabaseProductStatus =
  | "DRAFT"
  | "ACTIVE"
  | "INACTIVE";

export type DatabaseTryOnCategory =
  | "TOP"
  | "BOTTOM"
  | "DRESS"
  | "OUTERWEAR"
  | "SHOES"
  | "ACCESSORY";

export type DatabaseProductImagePurpose =
  | "GALLERY"
  | "TRY_ON_GARMENT";

export type DatabaseInventoryMovementType =
  | "ENTRY"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "RESERVE"
  | "RELEASE"
  | "SALE"
  | "RETURN"
  | "TRANSFER_IN"
  | "TRANSFER_OUT";

export const companies =
  pgTable(
    "companies",
    {
      id:
        uuid("id")
          .primaryKey(),

      code:
        varchar(
          "code",
          {
            length:
              40,
          },
        )
          .notNull()
          .unique(),

      name:
        varchar(
          "name",
          {
            length:
              160,
          },
        )
          .notNull(),

      description:
        varchar(
          "description",
          {
            length:
              500,
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
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),

      updatedAt:
        timestamp(
          "updated_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),
    },
    (table) => [
      index(
        "idx_companies_active",
      ).on(
        table.active,
      ),
    ],
  );

export const stores =
  pgTable(
    "stores",
    {
      id:
        uuid("id")
          .primaryKey(),

      companyId:
        uuid("company_id")
          .notNull()
          .references(
            () =>
              companies.id,
            {
              onDelete:
                "restrict",
            },
          ),

      code:
        varchar(
          "code",
          {
            length:
              40,
          },
        )
          .notNull(),

      name:
        varchar(
          "name",
          {
            length:
              120,
          },
        )
          .notNull(),

      address:
        varchar(
          "address",
          {
            length:
              240,
          },
        ),

      description:
        varchar(
          "description",
          {
            length:
              500,
          },
        ),

      city:
        varchar(
          "city",
          {
            length:
              120,
          },
        ),

      phone:
        varchar(
          "phone",
          {
            length:
              40,
          },
        ),

      email:
        varchar(
          "email",
          {
            length:
              180,
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
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),

      updatedAt:
        timestamp(
          "updated_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),
    },
    (table) => [
      unique(
        "uq_stores_company_code",
      ).on(
        table.companyId,
        table.code,
      ),

      index(
        "idx_stores_company_id",
      ).on(
        table.companyId,
      ),

      index(
        "idx_stores_city",
      ).on(
        table.city,
      ),

      index(
        "idx_stores_active",
      ).on(
        table.active,
      ),
    ],
  );

export const appUsers =
  pgTable(
    "app_users",
    {
      id:
        uuid("id")
          .primaryKey(),

      firstName:
        varchar(
          "first_name",
          {
            length:
              80,
          },
        )
          .notNull(),

      lastName:
        varchar(
          "last_name",
          {
            length:
              100,
          },
        )
          .notNull(),

      email:
        varchar(
          "email",
          {
            length:
              180,
          },
        )
          .notNull()
          .unique(),

      passwordHash:
        varchar(
          "password_hash",
          {
            length:
              120,
          },
        )
          .notNull(),

      role:
        varchar(
          "role",
          {
            length:
              30,
          },
        )
          .$type<
            DatabaseUserRole
          >()
          .notNull(),

      customerType:
        varchar(
          "customer_type",
          {
            length:
              10,
          },
        )
          .$type<
            DatabaseCustomerType
          >(),

      phone:
        varchar(
          "phone",
          {
            length:
              40,
          },
        ),

      businessName:
        varchar(
          "business_name",
          {
            length:
              160,
          },
        ),

      taxId:
        varchar(
          "tax_id",
          {
            length:
              40,
          },
        ),

      status:
        varchar(
          "status",
          {
            length:
              20,
          },
        )
          .$type<
            DatabaseUserStatus
          >()
          .notNull(),

      storeId:
        uuid("store_id")
          .references(
            () =>
              stores.id,
          ),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),

      updatedAt:
        timestamp(
          "updated_at",
          {
            withTimezone:
              true,

            mode:
              "date",
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

export const categories =
  pgTable(
    "categories",
    {
      id:
        uuid("id")
          .primaryKey(),

      companyId:
        uuid("company_id")
          .notNull()
          .references(
            () =>
              companies.id,
            {
              onDelete:
                "restrict",
            },
          ),

      parentId:
        uuid("parent_id"),

      name:
        varchar(
          "name",
          {
            length:
              120,
          },
        )
          .notNull(),

      slug:
        varchar(
          "slug",
          {
            length:
              140,
          },
        )
          .notNull(),

      description:
        varchar(
          "description",
          {
            length:
              500,
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
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),

      updatedAt:
        timestamp(
          "updated_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),
    },
    (table) => [
      unique(
        "uq_categories_company_id_id",
      ).on(
        table.companyId,
        table.id,
      ),

      unique(
        "uq_categories_company_slug",
      ).on(
        table.companyId,
        table.slug,
      ),

      foreignKey({
        columns: [
          table.companyId,
          table.parentId,
        ],

        foreignColumns: [
          table.companyId,
          table.id,
        ],

        name:
          "fk_categories_company_parent",
      }),

      index(
        "idx_categories_company_id",
      ).on(
        table.companyId,
      ),

      index(
        "idx_categories_parent_id",
      ).on(
        table.parentId,
      ),

      index(
        "idx_categories_active",
      ).on(
        table.active,
      ),

      check(
        "ck_categories_not_self_parent",
        sql`
          ${table.parentId}
          is null
          or
          ${table.parentId}
          <>
          ${table.id}
        `,
      ),
    ],
  );

export const products =
  pgTable(
    "products",
    {
      id:
        uuid("id")
          .primaryKey(),

      companyId:
        uuid("company_id")
          .notNull()
          .references(
            () =>
              companies.id,
            {
              onDelete:
                "restrict",
            },
          ),

      categoryId:
        uuid("category_id")
          .notNull(),

      name:
        varchar(
          "name",
          {
            length:
              180,
          },
        )
          .notNull(),

      slug:
        varchar(
          "slug",
          {
            length:
              200,
          },
        )
          .notNull(),

      description:
        text("description"),

      brand:
        varchar(
          "brand",
          {
            length:
              120,
          },
        )
          .notNull()
          .default("VÉLORA"),

      composition:
        varchar(
          "composition",
          {
            length:
              500,
          },
        ),

      careInstructions:
        varchar(
          "care_instructions",
          {
            length:
              1000,
          },
        ),

      fitNotes:
        varchar(
          "fit_notes",
          {
            length:
              500,
          },
        ),

      status:
        varchar(
          "status",
          {
            length:
              20,
          },
        )
          .$type<
            DatabaseProductStatus
          >()
          .notNull()
          .default("ACTIVE"),

      createdBy:
        uuid("created_by")
          .references(
            () =>
              appUsers.id,
          ),

      updatedBy:
        uuid("updated_by")
          .references(
            () =>
              appUsers.id,
          ),

      tryOnEnabled:
        boolean(
          "try_on_enabled",
        )
          .notNull()
          .default(false),

      tryOnCategory:
        varchar(
          "try_on_category",
          {
            length:
              30,
          },
        )
          .$type<
            DatabaseTryOnCategory
          >(),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),

      updatedAt:
        timestamp(
          "updated_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),
    },
    (table) => [
      unique(
        "uq_products_company_slug",
      ).on(
        table.companyId,
        table.slug,
      ),

      foreignKey({
        columns: [
          table.companyId,
          table.categoryId,
        ],

        foreignColumns: [
          categories.companyId,
          categories.id,
        ],

        name:
          "fk_products_company_category",
      }),

      index(
        "idx_products_company_id",
      ).on(
        table.companyId,
      ),

      index(
        "idx_products_category_id",
      ).on(
        table.categoryId,
      ),

      index(
        "idx_products_status",
      ).on(
        table.status,
      ),

      index(
        "idx_products_name",
      ).on(
        table.name,
      ),

      check(
        "ck_products_status",
        sql`
          ${table.status}
          in (
            'DRAFT',
            'ACTIVE',
            'INACTIVE'
          )
        `,
      ),

      check(
        "ck_products_try_on_category",
        sql`
          ${table.tryOnCategory}
          is null
          or
          ${table.tryOnCategory}
          in (
            'TOP',
            'BOTTOM',
            'DRESS',
            'OUTERWEAR',
            'SHOES',
            'ACCESSORY'
          )
        `,
      ),

      check(
        "ck_products_try_on_enabled_category",
        sql`
          ${table.tryOnEnabled}
          = false
          or
          ${table.tryOnCategory}
          is not null
        `,
      ),
    ],
  );

export const productVariants =
  pgTable(
    "product_variants",
    {
      id:
        uuid("id")
          .primaryKey(),

      productId:
        uuid("product_id")
          .notNull()
          .references(
            () =>
              products.id,
          ),

      sku:
        varchar(
          "sku",
          {
            length:
              80,
          },
        )
          .notNull()
          .unique(),

      barcode:
        varchar(
          "barcode",
          {
            length:
              100,
          },
        )
          .unique(),

      size:
        varchar(
          "size",
          {
            length:
              30,
          },
        )
          .notNull(),

      color:
        varchar(
          "color",
          {
            length:
              80,
          },
        )
          .notNull(),

      colorHex:
        varchar(
          "color_hex",
          {
            length:
              7,
          },
        ),

      price:
        numeric(
          "price",
          {
            precision:
              12,

            scale:
              2,
          },
        )
          .notNull(),

      compareAtPrice:
        numeric(
          "compare_at_price",
          {
            precision:
              12,

            scale:
              2,
          },
        ),

      currency:
        varchar(
          "currency",
          {
            length:
              3,
          },
        )
          .notNull()
          .default("BOB"),

      active:
        boolean("active")
          .notNull()
          .default(true),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),

      updatedAt:
        timestamp(
          "updated_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),
    },
    (table) => [
      unique(
        "uq_product_variant_size_color",
      ).on(
        table.productId,
        table.size,
        table.color,
      ),

      index(
        "idx_product_variants_product_id",
      ).on(
        table.productId,
      ),

      index(
        "idx_product_variants_active",
      ).on(
        table.active,
      ),

      check(
        "ck_product_variant_price",
        sql`
          ${table.price}
          >= 0
        `,
      ),

      check(
        "ck_product_variant_compare_price",
        sql`
          ${table.compareAtPrice}
          is null
          or
          ${table.compareAtPrice}
          >=
          ${table.price}
        `,
      ),

      check(
        "ck_product_variant_color_hex",
        sql`
          ${table.colorHex}
          is null
          or
          ${table.colorHex}
          ~
          '^#[0-9A-Fa-f]{6}$'
        `,
      ),
    ],
  );

export const productImages =
  pgTable(
    "product_images",
    {
      id:
        uuid("id")
          .primaryKey(),

      productId:
        uuid("product_id")
          .notNull()
          .references(
            () =>
              products.id,
            {
              onDelete:
                "cascade",
            },
          ),

      variantId:
        uuid("variant_id")
          .references(
            () =>
              productVariants.id,
            {
              onDelete:
                "cascade",
            },
          ),

      imageUrl:
        varchar(
          "image_url",
          {
            length:
              1000,
          },
        )
          .notNull(),

      altText:
        varchar(
          "alt_text",
          {
            length:
              250,
          },
        ),

      sortOrder:
        integer(
          "sort_order",
        )
          .notNull()
          .default(0),

      isPrimary:
        boolean(
          "is_primary",
        )
          .notNull()
          .default(false),

      purpose:
        varchar(
          "purpose",
          {
            length:
              30,
          },
        )
          .$type<
            DatabaseProductImagePurpose
          >()
          .notNull()
          .default("GALLERY"),

      storageKey:
        varchar(
          "storage_key",
          {
            length:
              120,
          },
        ),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),
    },
    (table) => [
      index(
        "idx_product_images_product_id",
      ).on(
        table.productId,
      ),

      index(
        "idx_product_images_variant_id",
      ).on(
        table.variantId,
      ),

      index(
        "idx_product_images_try_on",
      ).on(
        table.productId,
        table.purpose,
        table.variantId,
        table.sortOrder,
      ),

      uniqueIndex(
        "uq_product_images_storage_key",
      )
        .on(
          table.storageKey,
        )
        .where(
          sql`
            ${table.storageKey}
            is not null
          `,
        ),

      check(
        "ck_product_images_sort_order",
        sql`
          ${table.sortOrder}
          >= 0
        `,
      ),

      check(
        "ck_product_images_purpose",
        sql`
          ${table.purpose}
          in (
            'GALLERY',
            'TRY_ON_GARMENT'
          )
        `,
      ),

      check(
        "ck_product_images_storage_key",
        sql`
          ${table.storageKey}
          is null
          or
          ${table.storageKey}
          ~
          '^[0-9a-fA-F-]{36}\.(jpg|png|webp)$'
        `,
      ),
    ],
  );

export const warehouses =
  pgTable(
    "warehouses",
    {
      id:
        uuid("id")
          .primaryKey(),

      storeId:
        uuid("store_id")
          .notNull()
          .references(
            () =>
              stores.id,
          ),

      code:
        varchar(
          "code",
          {
            length:
              50,
          },
        )
          .notNull(),

      name:
        varchar(
          "name",
          {
            length:
              120,
          },
        )
          .notNull(),

      description:
        varchar(
          "description",
          {
            length:
              500,
          },
        ),

      active:
        boolean("active")
          .notNull()
          .default(true),

      defaultWarehouse:
        boolean(
          "default_warehouse",
        )
          .notNull()
          .default(false),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),

      updatedAt:
        timestamp(
          "updated_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),
    },
    (table) => [
      unique(
        "uq_warehouses_store_code",
      ).on(
        table.storeId,
        table.code,
      ),

      index(
        "idx_warehouses_store_id",
      ).on(
        table.storeId,
      ),

      index(
        "idx_warehouses_active",
      ).on(
        table.active,
      ),

      uniqueIndex(
        "uq_warehouses_one_default_per_store",
      )
        .on(
          table.storeId,
        )
        .where(
          sql`
            ${table.defaultWarehouse}
          `,
        ),
    ],
  );

export const inventoryStocks =
  pgTable(
    "inventory_stocks",
    {
      id:
        uuid("id")
          .primaryKey(),

      warehouseId:
        uuid("warehouse_id")
          .notNull()
          .references(
            () =>
              warehouses.id,
          ),

      variantId:
        uuid("variant_id")
          .notNull()
          .references(
            () =>
              productVariants.id,
          ),

      physicalQuantity:
        integer(
          "physical_quantity",
        )
          .notNull()
          .default(0),

      committedQuantity:
        integer(
          "committed_quantity",
        )
          .notNull()
          .default(0),

      availableQuantity:
        integer(
          "available_quantity",
        )
          .generatedAlwaysAs(
            sql`
              physical_quantity
              -
              committed_quantity
            `,
          ),

      version:
        bigint(
          "version",
          {
            mode:
              "number",
          },
        )
          .notNull()
          .default(0),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),

      updatedAt:
        timestamp(
          "updated_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),
    },
    (table) => [
      unique(
        "uq_inventory_stock",
      ).on(
        table.warehouseId,
        table.variantId,
      ),

      index(
        "idx_inventory_stocks_warehouse_id",
      ).on(
        table.warehouseId,
      ),

      index(
        "idx_inventory_stocks_variant_id",
      ).on(
        table.variantId,
      ),

      check(
        "ck_inventory_physical_non_negative",
        sql`
          ${table.physicalQuantity}
          >= 0
        `,
      ),

      check(
        "ck_inventory_committed_non_negative",
        sql`
          ${table.committedQuantity}
          >= 0
        `,
      ),

      check(
        "ck_inventory_committed_not_over_physical",
        sql`
          ${table.committedQuantity}
          <=
          ${table.physicalQuantity}
        `,
      ),
    ],
  );

export const inventoryMovements =
  pgTable(
    "inventory_movements",
    {
      id:
        uuid("id")
          .primaryKey(),

      warehouseId:
        uuid("warehouse_id")
          .notNull()
          .references(
            () =>
              warehouses.id,
          ),

      variantId:
        uuid("variant_id")
          .notNull()
          .references(
            () =>
              productVariants.id,
          ),

      movementType:
        varchar(
          "movement_type",
          {
            length:
              30,
          },
        )
          .$type<
            DatabaseInventoryMovementType
          >()
          .notNull(),

      quantity:
        integer("quantity")
          .notNull(),

      physicalDelta:
        integer(
          "physical_delta",
        )
          .notNull()
          .default(0),

      committedDelta:
        integer(
          "committed_delta",
        )
          .notNull()
          .default(0),

      physicalBefore:
        integer(
          "physical_before",
        )
          .notNull(),

      physicalAfter:
        integer(
          "physical_after",
        )
          .notNull(),

      committedBefore:
        integer(
          "committed_before",
        )
          .notNull(),

      committedAfter:
        integer(
          "committed_after",
        )
          .notNull(),

      referenceType:
        varchar(
          "reference_type",
          {
            length:
              40,
          },
        ),

      referenceId:
        uuid(
          "reference_id",
        ),

      reason:
        varchar(
          "reason",
          {
            length:
              500,
          },
        ),

      performedBy:
        uuid(
          "performed_by",
        )
          .references(
            () =>
              appUsers.id,
          ),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),
    },
    (table) => [
      index(
        "idx_inventory_movements_warehouse_id",
      ).on(
        table.warehouseId,
      ),

      index(
        "idx_inventory_movements_variant_id",
      ).on(
        table.variantId,
      ),

      index(
        "idx_inventory_movements_created_at",
      ).on(
        table.createdAt,
      ),

      index(
        "idx_inventory_movements_reference",
      ).on(
        table.referenceType,
        table.referenceId,
      ),

      check(
        "ck_inventory_movement_type",
        sql`
          ${table.movementType}
          in (
            'ENTRY',
            'ADJUSTMENT_IN',
            'ADJUSTMENT_OUT',
            'RESERVE',
            'RELEASE',
            'SALE',
            'RETURN',
            'TRANSFER_IN',
            'TRANSFER_OUT'
          )
        `,
      ),

      check(
        "ck_inventory_movement_quantity",
        sql`
          ${table.quantity}
          > 0
        `,
      ),

      check(
        "ck_inventory_movement_has_delta",
        sql`
          ${table.physicalDelta}
          <> 0
          or
          ${table.committedDelta}
          <> 0
        `,
      ),

      check(
        "ck_inventory_physical_result",
        sql`
          ${table.physicalAfter}
          =
          ${table.physicalBefore}
          +
          ${table.physicalDelta}
        `,
      ),

      check(
        "ck_inventory_committed_result",
        sql`
          ${table.committedAfter}
          =
          ${table.committedBefore}
          +
          ${table.committedDelta}
        `,
      ),

      check(
        "ck_inventory_movement_before",
        sql`
          ${table.physicalBefore}
          >= 0
          and
          ${table.committedBefore}
          >= 0
          and
          ${table.committedBefore}
          <=
          ${table.physicalBefore}
        `,
      ),

      check(
        "ck_inventory_movement_after",
        sql`
          ${table.physicalAfter}
          >= 0
          and
          ${table.committedAfter}
          >= 0
          and
          ${table.committedAfter}
          <=
          ${table.physicalAfter}
        `,
      ),
    ],
  );

export const companiesRelations =
  relations(
    companies,
    ({ many }) => ({
      stores:
        many(
          stores,
        ),

      categories:
        many(
          categories,
        ),

      products:
        many(
          products,
        ),
    }),
  );

export const storesRelations =
  relations(
    stores,
    ({ one, many }) => ({
      company:
        one(
          companies,
          {
            fields: [
              stores.companyId,
            ],

            references: [
              companies.id,
            ],
          },
        ),

      users:
        many(
          appUsers,
        ),

      warehouses:
        many(
          warehouses,
        ),
    }),
  );

export const appUsersRelations =
  relations(
    appUsers,
    ({ one, many }) => ({
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

      productsCreated:
        many(
          products,
          {
            relationName:
              "productsCreatedBy",
          },
        ),

      productsUpdated:
        many(
          products,
          {
            relationName:
              "productsUpdatedBy",
          },
        ),

      inventoryMovements:
        many(
          inventoryMovements,
          {
            relationName:
              "inventoryMovementsPerformedBy",
          },
        ),
    }),
  );

export const categoriesRelations =
  relations(
    categories,
    ({ one, many }) => ({
      company:
        one(
          companies,
          {
            fields: [
              categories.companyId,
            ],

            references: [
              companies.id,
            ],
          },
        ),

      parent:
        one(
          categories,
          {
            fields: [
              categories.companyId,
              categories.parentId,
            ],

            references: [
              categories.companyId,
              categories.id,
            ],

            relationName:
              "categoryHierarchy",
          },
        ),

      children:
        many(
          categories,
          {
            relationName:
              "categoryHierarchy",
          },
        ),

      products:
        many(
          products,
        ),
    }),
  );

export const productsRelations =
  relations(
    products,
    ({ one, many }) => ({
      company:
        one(
          companies,
          {
            fields: [
              products.companyId,
            ],

            references: [
              companies.id,
            ],
          },
        ),

      category:
        one(
          categories,
          {
            fields: [
              products.companyId,
              products.categoryId,
            ],

            references: [
              categories.companyId,
              categories.id,
            ],
          },
        ),

      creator:
        one(
          appUsers,
          {
            fields: [
              products.createdBy,
            ],

            references: [
              appUsers.id,
            ],

            relationName:
              "productsCreatedBy",
          },
        ),

      updater:
        one(
          appUsers,
          {
            fields: [
              products.updatedBy,
            ],

            references: [
              appUsers.id,
            ],

            relationName:
              "productsUpdatedBy",
          },
        ),

      variants:
        many(
          productVariants,
        ),

      images:
        many(
          productImages,
        ),
    }),
  );

export const productVariantsRelations =
  relations(
    productVariants,
    ({ one, many }) => ({
      product:
        one(
          products,
          {
            fields: [
              productVariants.productId,
            ],

            references: [
              products.id,
            ],
          },
        ),

      images:
        many(
          productImages,
        ),

      stocks:
        many(
          inventoryStocks,
        ),

      movements:
        many(
          inventoryMovements,
        ),
    }),
  );

export const productImagesRelations =
  relations(
    productImages,
    ({ one }) => ({
      product:
        one(
          products,
          {
            fields: [
              productImages.productId,
            ],

            references: [
              products.id,
            ],
          },
        ),

      variant:
        one(
          productVariants,
          {
            fields: [
              productImages.variantId,
            ],

            references: [
              productVariants.id,
            ],
          },
        ),
    }),
  );

export const warehousesRelations =
  relations(
    warehouses,
    ({ one, many }) => ({
      store:
        one(
          stores,
          {
            fields: [
              warehouses.storeId,
            ],

            references: [
              stores.id,
            ],
          },
        ),

      stocks:
        many(
          inventoryStocks,
        ),

      movements:
        many(
          inventoryMovements,
        ),
    }),
  );

export const inventoryStocksRelations =
  relations(
    inventoryStocks,
    ({ one }) => ({
      warehouse:
        one(
          warehouses,
          {
            fields: [
              inventoryStocks.warehouseId,
            ],

            references: [
              warehouses.id,
            ],
          },
        ),

      variant:
        one(
          productVariants,
          {
            fields: [
              inventoryStocks.variantId,
            ],

            references: [
              productVariants.id,
            ],
          },
        ),
    }),
  );

export const inventoryMovementsRelations =
  relations(
    inventoryMovements,
    ({ one }) => ({
      warehouse:
        one(
          warehouses,
          {
            fields: [
              inventoryMovements.warehouseId,
            ],

            references: [
              warehouses.id,
            ],
          },
        ),

      variant:
        one(
          productVariants,
          {
            fields: [
              inventoryMovements.variantId,
            ],

            references: [
              productVariants.id,
            ],
          },
        ),

      performer:
        one(
          appUsers,
          {
            fields: [
              inventoryMovements.performedBy,
            ],

            references: [
              appUsers.id,
            ],

            relationName:
              "inventoryMovementsPerformedBy",
          },
        ),
    }),
  );

export type CompanyRow =
  typeof companies.$inferSelect;

export type StoreRow =
  typeof stores.$inferSelect;

export type AppUserRow =
  typeof appUsers.$inferSelect;

export type CategoryRow =
  typeof categories.$inferSelect;

export type ProductRow =
  typeof products.$inferSelect;

export type ProductVariantRow =
  typeof productVariants.$inferSelect;

export type ProductImageRow =
  typeof productImages.$inferSelect;

export type WarehouseRow =
  typeof warehouses.$inferSelect;

export type InventoryStockRow =
  typeof inventoryStocks.$inferSelect;

export type InventoryMovementRow =
  typeof inventoryMovements.$inferSelect;
export const shoppingCarts =
  pgTable(
    "shopping_carts",
    {
      id:
        uuid("id")
          .primaryKey(),

      userId:
        uuid("user_id")
          .notNull()
          .references(
            () =>
              appUsers.id,
          ),

      status:
        varchar(
          "status",
          {
            length:
              20,
          },
        )
          .$type<
            | "ACTIVE"
            | "CONVERTED"
            | "ABANDONED"
          >()
          .notNull(),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),

      updatedAt:
        timestamp(
          "updated_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),
    },
    (table) => [
      index(
        "idx_shopping_carts_user",
      ).on(
        table.userId,
      ),

      check(
        "ck_shopping_carts_status",
        sql`
          ${table.status}
          in (
            'ACTIVE',
            'CONVERTED',
            'ABANDONED'
          )
        `,
      ),

      uniqueIndex(
        "uq_shopping_carts_active_user",
      )
        .on(
          table.userId,
        )
        .where(
          sql`
            ${table.status}
            =
            'ACTIVE'
          `,
        ),
    ],
  );

export const shoppingCartItems =
  pgTable(
    "shopping_cart_items",
    {
      id:
        uuid("id")
          .primaryKey(),

      cartId:
        uuid("cart_id")
          .notNull()
          .references(
            () =>
              shoppingCarts.id,
            {
              onDelete:
                "cascade",
            },
          ),

      variantId:
        uuid("variant_id")
          .notNull()
          .references(
            () =>
              productVariants.id,
          ),

      quantity:
        integer(
          "quantity",
        )
          .notNull(),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),

      updatedAt:
        timestamp(
          "updated_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),
    },
    (table) => [
      unique(
        "uq_shopping_cart_item_variant",
      ).on(
        table.cartId,
        table.variantId,
      ),

      index(
        "idx_shopping_cart_items_cart",
      ).on(
        table.cartId,
      ),

      index(
        "idx_shopping_cart_items_variant",
      ).on(
        table.variantId,
      ),

      check(
        "ck_shopping_cart_items_quantity",
        sql`
          ${table.quantity}
          >
          0
        `,
      ),
    ],
  );
export type DatabaseOrderChannel =
  | "ECOMMERCE"
  | "POS";

export type DatabaseFulfillmentType =
  | "DELIVERY"
  | "PICKUP"
  | "IN_STORE";

export type DatabaseOrderStatus =
  | "RESERVED"
  | "CANCELLED"
  | "FULFILLED";

export const customerAddresses =
  pgTable(
    "customer_addresses",
    {
      id:
        uuid("id")
          .primaryKey(),

      userId:
        uuid("user_id")
          .notNull()
          .references(
            () =>
              appUsers.id,
          ),

      label:
        varchar(
          "label",
          {
            length:
              60,
          },
        )
          .notNull(),

      recipientName:
        varchar(
          "recipient_name",
          {
            length:
              180,
          },
        )
          .notNull(),

      recipientPhone:
        varchar(
          "recipient_phone",
          {
            length:
              40,
          },
        )
          .notNull(),

      department:
        varchar(
          "department",
          {
            length:
              100,
          },
        )
          .notNull(),

      city:
        varchar(
          "city",
          {
            length:
              100,
          },
        )
          .notNull(),

      zone:
        varchar(
          "zone",
          {
            length:
              120,
          },
        ),

      addressLine:
        varchar(
          "address_line",
          {
            length:
              240,
          },
        )
          .notNull(),

      reference:
        varchar(
          "reference",
          {
            length:
              300,
          },
        ),

      isDefault:
        boolean(
          "is_default",
        )
          .notNull()
          .default(false),

      active:
        boolean("active")
          .notNull()
          .default(true),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),

      updatedAt:
        timestamp(
          "updated_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),
    },
    (table) => [
      index(
        "idx_customer_addresses_user_id",
      ).on(
        table.userId,
      ),

      index(
        "idx_customer_addresses_user_active",
      ).on(
        table.userId,
        table.active,
      ),

      uniqueIndex(
        "uq_customer_default_active_address",
      )
        .on(
          table.userId,
        )
        .where(
          sql`
            ${table.isDefault}
            =
            true
            and
            ${table.active}
            =
            true
          `,
        ),
    ],
  );

export const orders =
  pgTable(
    "orders",
    {
      id:
        uuid("id")
          .primaryKey(),

      orderNumber:
        varchar(
          "order_number",
          {
            length:
              40,
          },
        )
          .notNull()
          .unique(),

      customerId:
        uuid(
          "customer_id",
        )
          .references(
            () =>
              appUsers.id,
          ),

      sourceCartId:
        uuid(
          "source_cart_id",
        )
          .references(
            () =>
              shoppingCarts.id,
          )
          .unique(),

      warehouseId:
        uuid(
          "warehouse_id",
        )
          .notNull()
          .references(
            () =>
              warehouses.id,
          ),

      addressId:
        uuid(
          "address_id",
        )
          .references(
            () =>
              customerAddresses.id,
          ),

      orderChannel:
        varchar(
          "order_channel",
          {
            length:
              20,
          },
        )
          .$type<
            DatabaseOrderChannel
          >()
          .notNull(),

      pointOfSaleId:
        uuid(
          "point_of_sale_id",
        ),

      cashSessionId:
        uuid(
          "cash_session_id",
        ),

      fulfillmentType:
        varchar(
          "fulfillment_type",
          {
            length:
              20,
          },
        )
          .$type<
            DatabaseFulfillmentType
          >()
          .notNull(),

      status:
        varchar(
          "status",
          {
            length:
              20,
          },
        )
          .$type<
            DatabaseOrderStatus
          >()
          .notNull(),

      currency:
        varchar(
          "currency",
          {
            length:
              3,
          },
        )
          .notNull(),

      subtotal:
        numeric(
          "subtotal",
          {
            precision:
              12,

            scale:
              2,
          },
        )
          .notNull(),

      total:
        numeric(
          "total",
          {
            precision:
              12,

            scale:
              2,
          },
        )
          .notNull(),

      recipientName:
        varchar(
          "recipient_name",
          {
            length:
              180,
          },
        ),

      recipientPhone:
        varchar(
          "recipient_phone",
          {
            length:
              40,
          },
        ),

      department:
        varchar(
          "department",
          {
            length:
              100,
          },
        ),

      city:
        varchar(
          "city",
          {
            length:
              100,
          },
        ),

      zone:
        varchar(
          "zone",
          {
            length:
              120,
          },
        ),

      addressLine:
        varchar(
          "address_line",
          {
            length:
              240,
          },
        ),

      addressReference:
        varchar(
          "address_reference",
          {
            length:
              300,
          },
        ),

      notes:
        varchar(
          "notes",
          {
            length:
              500,
          },
        ),

      clientOperationId:
        uuid(
          "client_operation_id",
        ),

      clientCreatedAt:
        timestamp(
          "client_created_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        ),

      syncedAt:
        timestamp(
          "synced_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        ),

      cancelledAt:
        timestamp(
          "cancelled_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        ),

      fulfilledAt:
        timestamp(
          "fulfilled_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        ),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),

      updatedAt:
        timestamp(
          "updated_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),
    },
    (table) => [
      index(
        "idx_orders_customer",
      ).on(
        table.customerId,
        table.createdAt,
      ),

      index(
        "idx_orders_warehouse",
      ).on(
        table.warehouseId,
        table.createdAt,
      ),

      index(
        "idx_orders_status",
      ).on(
        table.status,
      ),

      index(
        "idx_orders_channel",
      ).on(
        table.orderChannel,
      ),

      index(
        "idx_orders_point_of_sale",
      ).on(
        table.pointOfSaleId,
        table.createdAt,
      ),

      index(
        "idx_orders_cash_session",
      ).on(
        table.cashSessionId,
        table.createdAt,
      ),

      uniqueIndex(
        "uq_orders_client_operation",
      )
        .on(
          table.clientOperationId,
        )
        .where(
          sql`
            ${table.clientOperationId}
            is not null
          `,
        ),

      index(
        "idx_orders_ecommerce_offline_sync",
      )
        .on(
          table.customerId,
          table.syncedAt,
        )
        .where(
          sql`
            ${table.orderChannel}
            =
            'ECOMMERCE'
            and
            ${table.clientOperationId}
            is not null
          `,
        ),

      check(
        "ck_orders_channel",
        sql`
          ${table.orderChannel}
          in (
            'ECOMMERCE',
            'POS'
          )
        `,
      ),

      check(
        "ck_orders_fulfillment_type",
        sql`
          ${table.fulfillmentType}
          in (
            'DELIVERY',
            'PICKUP',
            'IN_STORE'
          )
        `,
      ),

      check(
        "ck_orders_status",
        sql`
          ${table.status}
          in (
            'RESERVED',
            'CANCELLED',
            'FULFILLED'
          )
        `,
      ),

      check(
        "ck_orders_totals",
        sql`
          ${table.subtotal}
          >= 0
          and
          ${table.total}
          >= 0
        `,
      ),

      check(
        "ck_orders_channel_shape",
        sql`
          (
            ${table.orderChannel}
            =
            'ECOMMERCE'
            and
            ${table.customerId}
            is not null
            and
            ${table.pointOfSaleId}
            is null
            and
            ${table.cashSessionId}
            is null
            and
            (
              (
                ${table.sourceCartId}
                is not null
                and
                ${table.clientOperationId}
                is null
                and
                ${table.clientCreatedAt}
                is null
                and
                ${table.syncedAt}
                is null
              )
              or
              (
                ${table.sourceCartId}
                is null
                and
                ${table.clientOperationId}
                is not null
                and
                ${table.clientCreatedAt}
                is not null
                and
                ${table.syncedAt}
                is not null
              )
            )
          )
          or
          (
            ${table.orderChannel}
            =
            'POS'
            and
            ${table.sourceCartId}
            is null
            and
            ${table.pointOfSaleId}
            is not null
            and
            ${table.cashSessionId}
            is not null
            and
            ${table.fulfillmentType}
            =
            'IN_STORE'
          )
        `,
      ),

      check(
        "ck_orders_fulfillment_address",
        sql`
          (
            ${table.orderChannel}
            =
            'ECOMMERCE'
            and
            ${table.fulfillmentType}
            =
            'DELIVERY'
            and
            ${table.addressId}
            is not null
            and
            ${table.recipientName}
            is not null
            and
            ${table.recipientPhone}
            is not null
            and
            ${table.department}
            is not null
            and
            ${table.city}
            is not null
            and
            ${table.addressLine}
            is not null
          )
          or
          (
            ${table.orderChannel}
            =
            'ECOMMERCE'
            and
            ${table.fulfillmentType}
            =
            'PICKUP'
            and
            ${table.addressId}
            is null
          )
          or
          (
            ${table.orderChannel}
            =
            'POS'
            and
            ${table.fulfillmentType}
            =
            'IN_STORE'
            and
            ${table.addressId}
            is null
          )
        `,
      ),
    ],
  );

export const orderItems =
  pgTable(
    "order_items",
    {
      id:
        uuid("id")
          .primaryKey(),

      orderId:
        uuid(
          "order_id",
        )
          .notNull()
          .references(
            () =>
              orders.id,
            {
              onDelete:
                "cascade",
            },
          ),

      variantId:
        uuid(
          "variant_id",
        )
          .notNull()
          .references(
            () =>
              productVariants.id,
          ),

      productName:
        varchar(
          "product_name",
          {
            length:
              180,
          },
        )
          .notNull(),

      sku:
        varchar(
          "sku",
          {
            length:
              80,
          },
        )
          .notNull(),

      size:
        varchar(
          "size",
          {
            length:
              30,
          },
        )
          .notNull(),

      color:
        varchar(
          "color",
          {
            length:
              80,
          },
        )
          .notNull(),

      unitPrice:
        numeric(
          "unit_price",
          {
            precision:
              12,

            scale:
              2,
          },
        )
          .notNull(),

      currency:
        varchar(
          "currency",
          {
            length:
              3,
          },
        )
          .notNull(),

      quantity:
        integer(
          "quantity",
        )
          .notNull(),

      subtotal:
        numeric(
          "subtotal",
          {
            precision:
              12,

            scale:
              2,
          },
        )
          .notNull(),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),
    },
    (table) => [
      unique(
        "uq_order_item_variant",
      ).on(
        table.orderId,
        table.variantId,
      ),

      index(
        "idx_order_items_order",
      ).on(
        table.orderId,
      ),

      index(
        "idx_order_items_variant",
      ).on(
        table.variantId,
      ),

      check(
        "ck_order_items_quantity",
        sql`
          ${table.quantity}
          >
          0
        `,
      ),

      check(
        "ck_order_items_amounts",
        sql`
          ${table.unitPrice}
          >=
          0
          and
          ${table.subtotal}
          >=
          0
        `,
      ),
    ],
  );


export type DatabasePaymentMethod =
  | "COD"
  | "CASH"
  | "CARD"
  | "WEB"
  | "QR";

export type DatabasePaymentStatus =
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED";

export const payments =
  pgTable(
    "payments",
    {
      id:
        uuid("id")
          .primaryKey(),

      orderId:
        uuid("order_id")
          .notNull()
          .references(
            () =>
              orders.id,
          ),

      method:
        varchar(
          "method",
          {
            length:
              20,
          },
        )
          .$type<
            DatabasePaymentMethod
          >()
          .notNull(),

      status:
        varchar(
          "status",
          {
            length:
              20,
          },
        )
          .$type<
            DatabasePaymentStatus
          >()
          .notNull(),

      amount:
        numeric(
          "amount",
          {
            precision:
              12,

            scale:
              2,
          },
        )
          .notNull(),

      currency:
        varchar(
          "currency",
          {
            length:
              3,
          },
        )
          .notNull(),

      provider:
        varchar(
          "provider",
          {
            length:
              80,
          },
        ),

      externalReference:
        varchar(
          "external_reference",
          {
            length:
              160,
          },
        ),

      notes:
        varchar(
          "notes",
          {
            length:
              500,
          },
        ),

      createdBy:
        uuid("created_by")
          .notNull()
          .references(
            () =>
              appUsers.id,
          ),

      processedBy:
        uuid("processed_by")
          .references(
            () =>
              appUsers.id,
          ),

      paidAt:
        timestamp(
          "paid_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        ),

      failedAt:
        timestamp(
          "failed_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        ),

      cancelledAt:
        timestamp(
          "cancelled_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        ),

      refundedAt:
        timestamp(
          "refunded_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        ),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),

      updatedAt:
        timestamp(
          "updated_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),
    },
    (table) => [
      index(
        "idx_payments_order",
      ).on(
        table.orderId,
        table.createdAt,
      ),

      index(
        "idx_payments_status",
      ).on(
        table.status,
      ),

      index(
        "idx_payments_method",
      ).on(
        table.method,
      ),

      uniqueIndex(
        "uq_payments_pending_order",
      )
        .on(
          table.orderId,
        )
        .where(
          sql`
            ${table.status}
            =
            'PENDING'
          `,
        ),

      uniqueIndex(
        "uq_payments_paid_order",
      )
        .on(
          table.orderId,
        )
        .where(
          sql`
            ${table.status}
            =
            'PAID'
          `,
        ),

      uniqueIndex(
        "uq_payments_provider_reference",
      )
        .on(
          table.provider,
          table.externalReference,
        )
        .where(
          sql`
            ${table.provider}
            is not null
            and
            ${table.externalReference}
            is not null
          `,
        ),

      check(
        "ck_payments_method",
        sql`
          ${table.method}
          in (
            'COD',
            'CASH',
            'CARD',
            'WEB',
            'QR'
          )
        `,
      ),

      check(
        "ck_payments_status",
        sql`
          ${table.status}
          in (
            'PENDING',
            'PAID',
            'FAILED',
            'CANCELLED',
            'REFUNDED'
          )
        `,
      ),

      check(
        "ck_payments_amount",
        sql`
          ${table.amount}
          >
          0
        `,
      ),
    ],
  );

export const paymentStatusHistory =
  pgTable(
    "payment_status_history",
    {
      id:
        uuid("id")
          .primaryKey(),

      paymentId:
        uuid("payment_id")
          .notNull()
          .references(
            () =>
              payments.id,
            {
              onDelete:
                "cascade",
            },
          ),

      fromStatus:
        varchar(
          "from_status",
          {
            length:
              20,
          },
        )
          .$type<
            DatabasePaymentStatus
          >(),

      toStatus:
        varchar(
          "to_status",
          {
            length:
              20,
          },
        )
          .$type<
            DatabasePaymentStatus
          >()
          .notNull(),

      changedBy:
        uuid("changed_by")
          .notNull()
          .references(
            () =>
              appUsers.id,
          ),

      reason:
        varchar(
          "reason",
          {
            length:
              500,
          },
        ),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone:
              true,

            mode:
              "date",
          },
        )
          .notNull(),
    },
    (table) => [
      index(
        "idx_payment_history_payment",
      ).on(
        table.paymentId,
        table.createdAt,
      ),

      check(
        "ck_payment_history_from_status",
        sql`
          ${table.fromStatus}
          is null
          or
          ${table.fromStatus}
          in (
            'PENDING',
            'PAID',
            'FAILED',
            'CANCELLED',
            'REFUNDED'
          )
        `,
      ),

      check(
        "ck_payment_history_to_status",
        sql`
          ${table.toStatus}
          in (
            'PENDING',
            'PAID',
            'FAILED',
            'CANCELLED',
            'REFUNDED'
          )
        `,
      ),
    ],
  );

export type CustomerAddressRow =
  typeof customerAddresses.$inferSelect;

export type OrderRow =
  typeof orders.$inferSelect;

export type OrderItemRow =
  typeof orderItems.$inferSelect;

export type PaymentRow =
  typeof payments.$inferSelect;

export type PaymentStatusHistoryRow =
  typeof paymentStatusHistory.$inferSelect;

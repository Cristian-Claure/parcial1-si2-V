import {
  randomUUID,
} from "node:crypto";

import {
  Injectable,
} from "@nestjs/common";

import {
  and,
  asc,
  eq,
  sql,
} from "drizzle-orm";

import type {
  CreateStoreRequest,
  StoreResponse,
} from "@velora/contracts";

import {
  companies,
  stores,
  warehouses,
} from "@velora/database";

import {
  DatabaseService,
} from "../database/database.service.js";

const storeResponseSelection = {
  id:
    stores.id,

  companyId:
    stores.companyId,

  code:
    stores.code,

  name:
    stores.name,

  address:
    stores.address,

  active:
    stores.active,
} as const;

@Injectable()
export class StoresRepository {
  constructor(
    private readonly database:
      DatabaseService,
  ) {}

  async companyIsActive(
    companyId: string,
  ): Promise<boolean> {
    const rows =
      await this.database.db
        .select({
          id:
            companies.id,
        })
        .from(
          companies,
        )
        .where(
          and(
            eq(
              companies.id,
              companyId,
            ),
            eq(
              companies.active,
              true,
            ),
          ),
        )
        .limit(1);

    return rows.length > 0;
  }

  async listByCompany(
    companyId: string,
  ): Promise<StoreResponse[]> {
    return this.database.db
      .select(
        storeResponseSelection,
      )
      .from(
        stores,
      )
      .where(
        eq(
          stores.companyId,
          companyId,
        ),
      )
      .orderBy(
        asc(
          stores.name,
        ),
      );
  }

  async codeExists(
    companyId: string,
    code: string,
  ): Promise<boolean> {
    const normalized =
      code
        .trim()
        .toLowerCase();

    const rows =
      await this.database.db
        .select({
          id:
            stores.id,
        })
        .from(
          stores,
        )
        .where(
          and(
            eq(
              stores.companyId,
              companyId,
            ),
            sql<boolean>`
              lower(${stores.code})
              =
              ${normalized}
            `,
          ),
        )
        .limit(1);

    return rows.length > 0;
  }

  async create(
    request:
      CreateStoreRequest,
  ): Promise<StoreResponse> {
    const now =
      new Date();

    // Fase 1 SaaS: la sucursal nace con su almacén por defecto (pedidos en línea y POS).
    const rows =
      await this.database.db.transaction(async (tx) => {
        const inserted =
          await tx
        .insert(
          stores,
        )
        .values({
          id:
            randomUUID(),

          companyId:
            request.companyId,

          code:
            request.code,

          name:
            request.name,

          address:
            request.address ??
            null,

          description:
            null,

          city:
            null,

          phone:
            null,

          email:
            null,

          active:
            true,

          createdAt:
            now,

          updatedAt:
            now,
        })
        .returning(
          storeResponseSelection,
        );

        const store =
          inserted[0];

        if (store) {
          await tx
            .insert(
              warehouses,
            )
            .values({
              id:
                randomUUID(),
              storeId:
                store.id,
              code:
                `ALM-${request.code}`
                  .toUpperCase()
                  .slice(0, 50),
              name:
                `Almacén ${request.name}`
                  .slice(0, 120),
              description:
                null,
              active:
                true,
              defaultWarehouse:
                true,
              createdAt:
                now,
              updatedAt:
                now,
            });
        }

        return inserted;
      });

    const created =
      rows[0];

    if (!created) {
      throw new Error(
        "No se pudo crear la sucursal.",
      );
    }

    return created;
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

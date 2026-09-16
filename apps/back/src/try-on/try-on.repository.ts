import {
  randomUUID,
} from "node:crypto";

import {
  Injectable,
} from "@nestjs/common";

import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
} from "drizzle-orm";

import type {
  TryOnJobStatus,
  TryOnProvider,
} from "@velora/contracts";

import {
  appUsers,
  productImages,
  products,
  productVariants,
  tryOnJobs,
  type DatabaseTryOnCategory,
} from "@velora/database";

import {
  DatabaseService,
} from "../database/database.service.js";

export interface TryOnProductRecord {
  id: string;
  companyId: string;
  status:
    | "DRAFT"
    | "ACTIVE"
    | "INACTIVE";
  tryOnEnabled: boolean;
  tryOnCategory:
    DatabaseTryOnCategory | null;
}

export interface TryOnVariantRecord {
  id: string;
  productId: string;
  active: boolean;
}

export interface TryOnGarmentRecord {
  id: string;
  productId: string;
  variantId:
    string | null;
  storageKey: string;
}

export interface TryOnJobRecord {
  id: string;
  userId: string;
  productId: string;
  variantId:
    string | null;
  garmentImageId: string;
  provider:
    TryOnProvider;
  externalJobId:
    string | null;
  status:
    TryOnJobStatus;
  resultStorageKey:
    string | null;
  resultContentType:
    string | null;
  resultSizeBytes:
    number | null;
  errorMessage:
    string | null;
  durationMs:
    number | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt:
    Date | null;
}

export interface TryOnJobMutation {
  externalJobId:
    string | null;
  status:
    TryOnJobStatus;
  resultStorageKey:
    string | null;
  resultContentType:
    string | null;
  resultSizeBytes:
    number | null;
  errorMessage:
    string | null;
  durationMs:
    number | null;
  completedAt:
    Date | null;
}

const jobSelection = {
  id:
    tryOnJobs.id,
  userId:
    tryOnJobs.userId,
  productId:
    tryOnJobs.productId,
  variantId:
    tryOnJobs.variantId,
  garmentImageId:
    tryOnJobs.garmentImageId,
  provider:
    tryOnJobs.provider,
  externalJobId:
    tryOnJobs.externalJobId,
  status:
    tryOnJobs.status,
  resultStorageKey:
    tryOnJobs.resultStorageKey,
  resultContentType:
    tryOnJobs.resultContentType,
  resultSizeBytes:
    tryOnJobs.resultSizeBytes,
  errorMessage:
    tryOnJobs.errorMessage,
  durationMs:
    tryOnJobs.durationMs,
  createdAt:
    tryOnJobs.createdAt,
  updatedAt:
    tryOnJobs.updatedAt,
  completedAt:
    tryOnJobs.completedAt,
} as const;

@Injectable()
export class TryOnRepository {
  constructor(
    private readonly database:
      DatabaseService,
  ) {}

  async customerIsActive(
    userId: string,
  ): Promise<boolean> {
    const rows =
      await this.database.db
        .select({
          id:
            appUsers.id,
        })
        .from(
          appUsers,
        )
        .where(
          and(
            eq(
              appUsers.id,
              userId,
            ),
            eq(
              appUsers.role,
              "CUSTOMER",
            ),
            eq(
              appUsers.status,
              "ACTIVE",
            ),
          ),
        )
        .limit(1);

    return rows.length > 0;
  }

  async findProduct(
    productId: string,
  ): Promise<TryOnProductRecord | null> {
    const rows =
      await this.database.db
        .select({
          id:
            products.id,
          companyId:
            products.companyId,
          status:
            products.status,
          tryOnEnabled:
            products.tryOnEnabled,
          tryOnCategory:
            products.tryOnCategory,
        })
        .from(
          products,
        )
        .where(
          eq(
            products.id,
            productId,
          ),
        )
        .limit(1);

    return rows[0] ?? null;
  }

  async findVariant(
    productId: string,
    variantId: string,
  ): Promise<TryOnVariantRecord | null> {
    const rows =
      await this.database.db
        .select({
          id:
            productVariants.id,
          productId:
            productVariants.productId,
          active:
            productVariants.active,
        })
        .from(
          productVariants,
        )
        .where(
          and(
            eq(
              productVariants.id,
              variantId,
            ),
            eq(
              productVariants.productId,
              productId,
            ),
          ),
        )
        .limit(1);

    return rows[0] ?? null;
  }

  async garments(
    productId: string,
    variantId:
      string | null,
  ): Promise<TryOnGarmentRecord[]> {
    const variantCondition =
      variantId === null
        ? undefined
        : eq(
            productImages.variantId,
            variantId,
          );

    const condition =
      variantCondition
        ? and(
            eq(
              productImages.productId,
              productId,
            ),
            eq(
              productImages.purpose,
              "TRY_ON_GARMENT",
            ),
            isNotNull(
              productImages.storageKey,
            ),
            variantCondition,
          )
        : and(
            eq(
              productImages.productId,
              productId,
            ),
            eq(
              productImages.purpose,
              "TRY_ON_GARMENT",
            ),
            isNotNull(
              productImages.storageKey,
            ),
          );

    const rows =
      await this.database.db
        .select({
          id:
            productImages.id,
          productId:
            productImages.productId,
          variantId:
            productImages.variantId,
          storageKey:
            productImages.storageKey,
        })
        .from(
          productImages,
        )
        .where(
          condition,
        )
        .orderBy(
          asc(
            productImages.sortOrder,
          ),
        );

    return rows
      .filter(
        (
          row,
        ): row is typeof row & {
          storageKey: string;
        } =>
          row.storageKey !== null,
      )
      .map(
        (row) => ({
          id:
            row.id,
          productId:
            row.productId,
          variantId:
            row.variantId,
          storageKey:
            row.storageKey,
        }),
      );
  }

  async createJob(
    userId: string,
    productId: string,
    variantId:
      string | null,
    garmentImageId: string,
    provider:
      TryOnProvider,
  ): Promise<TryOnJobRecord> {
    const now =
      new Date();

    const rows =
      await this.database.db
        .insert(
          tryOnJobs,
        )
        .values({
          id:
            randomUUID(),
          userId,
          productId,
          variantId,
          garmentImageId,
          provider,
          externalJobId:
            null,
          status:
            "QUEUED",
          resultStorageKey:
            null,
          resultContentType:
            null,
          resultSizeBytes:
            null,
          errorMessage:
            null,
          durationMs:
            null,
          createdAt:
            now,
          updatedAt:
            now,
          completedAt:
            null,
        })
        .returning(
          jobSelection,
        );

    const row =
      rows[0];

    if (
      !row
    ) {
      throw new Error(
        "No se pudo crear el job de Try-On.",
      );
    }

    return row;
  }

  async findOwnedJob(
    userId: string,
    jobId: string,
  ): Promise<TryOnJobRecord | null> {
    const rows =
      await this.database.db
        .select(
          jobSelection,
        )
        .from(
          tryOnJobs,
        )
        .where(
          and(
            eq(
              tryOnJobs.id,
              jobId,
            ),
            eq(
              tryOnJobs.userId,
              userId,
            ),
          ),
        )
        .limit(1);

    return rows[0] ?? null;
  }

  async listOwnedJobs(
    userId: string,
  ): Promise<TryOnJobRecord[]> {
    return this.database.db
      .select(
        jobSelection,
      )
      .from(
        tryOnJobs,
      )
      .where(
        eq(
          tryOnJobs.userId,
          userId,
        ),
      )
      .orderBy(
        desc(
          tryOnJobs.createdAt,
        ),
      )
      .limit(20);
  }

  async save(
    jobId: string,
    mutation:
      TryOnJobMutation,
  ): Promise<TryOnJobRecord> {
    const rows =
      await this.database.db
        .update(
          tryOnJobs,
        )
        .set({
          externalJobId:
            mutation.externalJobId,
          status:
            mutation.status,
          resultStorageKey:
            mutation.resultStorageKey,
          resultContentType:
            mutation.resultContentType,
          resultSizeBytes:
            mutation.resultSizeBytes,
          errorMessage:
            mutation.errorMessage,
          durationMs:
            mutation.durationMs,
          completedAt:
            mutation.completedAt,
          updatedAt:
            new Date(),
        })
        .where(
          eq(
            tryOnJobs.id,
            jobId,
          ),
        )
        .returning(
          jobSelection,
        );

    const row =
      rows[0];

    if (
      !row
    ) {
      throw new Error(
        "No se pudo actualizar el job de Try-On.",
      );
    }

    return row;
  }
}

import {
  Injectable,
} from "@nestjs/common";

import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type {
  AuditEvent,
  AuditEventPage,
  AuditSearchQuery,
} from "@velora/contracts";

import {
  appUsers,
  auditEvents,
  stores,
} from "@velora/database";

import {
  DatabaseService,
} from "../database/database.service.js";

export interface AuditInsert {
  id:
    string;
  occurredAt:
    Date;
  actorUserId:
    string |
    null;
  actorEmail:
    string |
    null;
  actorName:
    string |
    null;
  actorRole:
    string;
  category:
    string;
  httpMethod:
    "POST" |
    "PUT" |
    "PATCH" |
    "DELETE";
  routePattern:
    string;
  requestPath:
    string;
  statusCode:
    number;
  success:
    boolean;
  requestId:
    string |
    null;
}

@Injectable()
export class AuditRepository {
  constructor(
    private readonly database:
      DatabaseService,
  ) {}

  async insert(
    event:
      AuditInsert,
  ): Promise<void> {
    await this.database.db
      .insert(
        auditEvents,
      )
      .values(
        event,
      );
  }

  /**
   * Los eventos no guardan compañía: el alcance de un propietario son sus propios
   * eventos y los de los encargados de sus sucursales.
   */
  async ownerScopedActorIds(
    ownerUserId: string,
    companyIds: readonly string[],
  ): Promise<string[]> {
    if (companyIds.length === 0) {
      return [ownerUserId];
    }

    const managers =
      await this.database.db
        .select({ id: appUsers.id })
        .from(appUsers)
        .innerJoin(stores, eq(appUsers.storeId, stores.id))
        .where(inArray(stores.companyId, [...companyIds]));

    return [ownerUserId, ...managers.map((row) => row.id)];
  }

  async search(
    query:
      AuditSearchQuery,
    actorIds:
      readonly string[] |
      null = null,
  ): Promise<AuditEventPage> {
    const conditions:
      SQL[] =
      [];

    if (
      actorIds !== null
    ) {
      conditions.push(
        actorIds.length === 0
          ? sql`false`
          : inArray(
              auditEvents.actorUserId,
              [...actorIds],
            ),
      );
    }

    if (
      query.actorId
    ) {
      conditions.push(
        eq(
          auditEvents.actorUserId,
          query.actorId,
        ),
      );
    }

    if (
      query.role?.trim()
    ) {
      conditions.push(
        eq(
          auditEvents.actorRole,
          query.role
            .trim()
            .toUpperCase(),
        ),
      );
    }

    if (
      query.category?.trim()
    ) {
      conditions.push(
        eq(
          auditEvents.category,
          query.category
            .trim()
            .toUpperCase(),
        ),
      );
    }

    if (
      query.method
    ) {
      conditions.push(
        eq(
          auditEvents.httpMethod,
          query.method,
        ),
      );
    }

    if (
      query.success
    ) {
      conditions.push(
        eq(
          auditEvents.success,
          query.success ===
            "true",
        ),
      );
    }

    if (
      query.from
    ) {
      conditions.push(
        sql`${auditEvents.occurredAt} >= ${new Date(query.from)}`,
      );
    }

    if (
      query.to
    ) {
      conditions.push(
        sql`${auditEvents.occurredAt} <= ${new Date(query.to)}`,
      );
    }

    if (
      query.q?.trim()
    ) {
      const search =
        `%${query.q.trim()}%`;

      const qCondition =
        or(
          ilike(
            auditEvents.actorEmail,
            search,
          ),
          ilike(
            auditEvents.actorName,
            search,
          ),
          ilike(
            auditEvents.routePattern,
            search,
          ),
          ilike(
            auditEvents.requestPath,
            search,
          ),
        );

      if (
        qCondition
      ) {
        conditions.push(
          qCondition,
        );
      }
    }

    const where =
      conditions.length >
      0
        ? and(
            ...conditions,
          )
        : undefined;

    const countRows =
      await this.database.db
        .select({
          value:
            sql<number>`count(*)::int`,
        })
        .from(
          auditEvents,
        )
        .where(
          where,
        );

    const totalElements =
      Number(
        countRows[0]?.value ??
        0,
      );

    const contentRows =
      await this.database.db
        .select()
        .from(
          auditEvents,
        )
        .where(
          where,
        )
        .orderBy(
          desc(
            auditEvents.occurredAt,
          ),
        )
        .limit(
          query.size,
        )
        .offset(
          query.page *
          query.size,
        );

    const content:
      AuditEvent[] =
      contentRows.map(
        (
          event,
        ) => ({
          id:
            event.id,
          occurredAt:
            event.occurredAt
              .toISOString(),
          actorUserId:
            event.actorUserId,
          actorEmail:
            event.actorEmail,
          actorName:
            event.actorName,
          actorRole:
            event.actorRole,
          category:
            event.category,
          httpMethod:
            event.httpMethod,
          routePattern:
            event.routePattern,
          requestPath:
            event.requestPath,
          statusCode:
            event.statusCode,
          success:
            event.success,
          requestId:
            event.requestId,
        }),
      );

    return {
      content,
      totalElements,
      totalPages:
        totalElements ===
        0
          ? 0
          : Math.ceil(
              totalElements /
              query.size,
            ),
      page:
        query.page,
      size:
        query.size,
    };
  }
}

import {
  randomUUID,
} from "node:crypto";

import {
  Injectable,
} from "@nestjs/common";

import type {
  AuditEventPage,
  AuditHttpMethod,
  AuditSearchQuery,
} from "@velora/contracts";

import {
  UsersRepository,
} from "../users/users.repository.js";

import {
  AuditRepository,
} from "./audit.repository.js";

@Injectable()
export class AuditService {
  constructor(
    private readonly repository:
      AuditRepository,
    private readonly users:
      UsersRepository,
  ) {}

  async record(
    input: {
      actorUserId:
        string |
        null;
      actorRole:
        string |
        null;
      category:
        string;
      httpMethod:
        AuditHttpMethod;
      routePattern:
        string;
      requestPath:
        string;
      statusCode:
        number;
      requestId:
        string |
        null;
    },
  ): Promise<void> {
    const actor =
      input.actorUserId
        ? await this.users
            .findById(
              input.actorUserId,
            )
        : null;

    const actorName =
      actor
        ? `${actor.firstName} ${actor.lastName}`
            .trim() ||
          null
        : null;

    await this.repository
      .insert({
        id:
          randomUUID(),
        occurredAt:
          new Date(),
        actorUserId:
          input.actorUserId,
        actorEmail:
          actor?.email ??
          null,
        actorName,
        actorRole:
          this.normalized(
            input.actorRole,
            "ANONYMOUS",
            32,
          ).toUpperCase(),
        category:
          this.normalized(
            input.category,
            "OTHER",
            48,
          ).toUpperCase(),
        httpMethod:
          input.httpMethod,
        routePattern:
          this.normalized(
            input.routePattern,
            "/",
            512,
          ),
        requestPath:
          this.normalized(
            input.requestPath,
            "/",
            512,
          ),
        statusCode:
          input.statusCode,
        success:
          input.statusCode >=
            200 &&
          input.statusCode <
            400,
        requestId:
          this.nullable(
            input.requestId,
            128,
          ),
      });
  }

  search(
    query:
      AuditSearchQuery,
  ): Promise<AuditEventPage> {
    return this.repository
      .search(
        query,
      );
  }

  private normalized(
    value:
      string |
      null |
      undefined,
    fallback:
      string,
    maxLength:
      number,
  ): string {
    return (
      this.nullable(
        value,
        maxLength,
      ) ??
      fallback
    );
  }

  private nullable(
    value:
      string |
      null |
      undefined,
    maxLength:
      number,
  ): string |
  null {
    const normalized =
      value?.trim();

    if (
      !normalized
    ) {
      return null;
    }

    return normalized
      .slice(
        0,
        maxLength,
      );
  }
}

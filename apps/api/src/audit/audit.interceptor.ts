import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from "@nestjs/common";

import {
  tap,
  type Observable,
} from "rxjs";

import type {
  AuditHttpMethod,
} from "@velora/contracts";

import type {
  AuthenticatedRequest,
} from "../common/http/authenticated-request.js";

import {
  AuditService,
} from "./audit.service.js";

interface AuditRequest
  extends AuthenticatedRequest {
  method:
    string;
  url:
    string;
  originalUrl?:
    string;
  baseUrl?:
    string;
  route?: {
    path?:
      string;
  };
}

interface AuditResponse {
  statusCode:
    number;
}

const MUTATION_METHODS =
  new Set<
    AuditHttpMethod
  >([
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
  ]);

@Injectable()
export class AuditInterceptor
  implements NestInterceptor {
  private readonly logger =
    new Logger(
      AuditInterceptor.name,
    );

  constructor(
    private readonly audit:
      AuditService,
  ) {}

  intercept(
    context:
      ExecutionContext,
    next:
      CallHandler,
  ): Observable<unknown> {
    const http =
      context
        .switchToHttp();

    const request =
      http.getRequest<
        AuditRequest
      >();

    const response =
      http.getResponse<
        AuditResponse
      >();

    return next
      .handle()
      .pipe(
        tap({
          next:
            () => {
              const method =
                request.method
                  ?.toUpperCase() as
                  AuditHttpMethod;

              if (
                !MUTATION_METHODS.has(
                  method,
                )
              ) {
                return;
              }

              const requestPath =
                (
                  request.originalUrl ??
                  request.url ??
                  "/"
                )
                  .split(
                    "?",
                    1,
                  )[0] ??
                "/";

              if (
                !requestPath.startsWith(
                  "/api/",
                ) ||
                requestPath.startsWith(
                  "/api/auth/",
                )
              ) {
                return;
              }

              const statusCode =
                response.statusCode;

              if (
                statusCode <
                  200 ||
                statusCode >=
                  400
              ) {
                return;
              }

              const routePattern =
                this.routePattern(
                  request,
                  requestPath,
                );

              const principal =
                request.authPrincipal;

              const requestIdHeader =
                request.headers[
                  "x-request-id"
                ];

              const requestId =
                Array.isArray(
                  requestIdHeader,
                )
                  ? requestIdHeader[0] ??
                    null
                  : requestIdHeader ??
                    null;

              void this.audit
                .record({
                  actorUserId:
                    principal?.userId ??
                    null,
                  actorRole:
                    principal?.role ??
                    "ANONYMOUS",
                  category:
                    this.category(
                      routePattern,
                      requestPath,
                    ),
                  httpMethod:
                    method,
                  routePattern,
                  requestPath,
                  statusCode,
                  requestId,
                })
                .catch(
                  (
                    error:
                      unknown,
                  ) => {
                    this.logger.error(
                      `No se pudo registrar auditoría; method=${method} path=${requestPath}`,
                      error instanceof Error
                        ? error.stack
                        : String(
                            error,
                          ),
                    );
                  },
                );
            },
        }),
      );
  }

  private routePattern(
    request:
      AuditRequest,
    fallback:
      string,
  ): string {
    const path =
      request.route
        ?.path;

    if (
      typeof path !==
        "string" ||
      path.trim() ===
        ""
    ) {
      return fallback;
    }

    if (
      path.startsWith(
        "/api/",
      )
    ) {
      return path;
    }

    const base =
      request.baseUrl ??
      "";

    const joined =
      `${base}${path}`;

    return joined.startsWith(
      "/api/",
    )
      ? joined
      : fallback;
  }

  private category(
    routePattern:
      string,
    requestPath:
      string,
  ): string {
    const normalized =
      `${routePattern} ${requestPath}`
        .toLowerCase();

    if (
      normalized.includes(
        "/api/admin",
      ) ||
      normalized.includes(
        "/api/manager",
      )
    ) {
      if (
        normalized.includes(
          "/orders",
        )
      ) {
        return "ORDERS";
      }

      if (
        normalized.includes(
          "/payments",
        )
      ) {
        return "PAYMENTS";
      }

      if (
        normalized.includes(
          "/pos",
        ) ||
        normalized.includes(
          "/cash",
        ) ||
        normalized.includes(
          "/points-of-sale",
        )
      ) {
        return "POS";
      }

      if (
        normalized.includes(
          "/reports",
        )
      ) {
        return "REPORTS_AI";
      }

      return "ADMIN";
    }

    if (
      normalized.includes(
        "/api/catalog",
      )
    ) {
      return "CATALOG";
    }

    if (
      normalized.includes(
        "/api/inventory",
      )
    ) {
      return "INVENTORY";
    }

    if (
      normalized.includes(
        "/orders",
      )
    ) {
      return "ORDERS";
    }

    if (
      normalized.includes(
        "/payments",
      )
    ) {
      return "PAYMENTS";
    }

    if (
      normalized.includes(
        "/try-on",
      )
    ) {
      return "TRY_ON";
    }

    if (
      normalized.includes(
        "/assistant",
      ) ||
      normalized.includes(
        "/reports",
      )
    ) {
      return "REPORTS_AI";
    }

    if (
      normalized.includes(
        "/push",
      )
    ) {
      return "PUSH";
    }

    if (
      normalized.includes(
        "/api/customer",
      )
    ) {
      return "CUSTOMER";
    }

    return "OTHER";
  }
}

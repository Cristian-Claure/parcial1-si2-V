import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  auditSearchQuerySchema,
  type AuditEventPage,
  type AuditSearchQuery,
} from "@velora/contracts";

import {
  BearerAuthGuard,
} from "../auth/bearer-auth.guard.js";

import {
  RequireRoles,
} from "../common/authz/roles.decorator.js";

import {
  RolesGuard,
} from "../common/authz/roles.guard.js";

import {
  TenantScopeService,
} from "../common/authz/tenant-scope.service.js";

import {
  ApiHttpError,
} from "../common/http/api-http.error.js";

import type {
  AuthenticatedRequest,
} from "../common/http/authenticated-request.js";

import {
  ZodValidationPipe,
} from "../common/http/zod-validation.pipe.js";

import {
  AuditService,
} from "./audit.service.js";

@Controller("api/admin/audit")
@UseGuards(
  BearerAuthGuard,
  RolesGuard,
)
@RequireRoles("ADMIN")
export class AuditController {
  constructor(
    private readonly audit:
      AuditService,
    private readonly scope:
      TenantScopeService,
  ) {}

  @Get()
  async search(
    @Req()
    request:
      AuthenticatedRequest,
    @Query(
      new ZodValidationPipe(
        auditSearchQuerySchema,
      ),
    )
    query:
      AuditSearchQuery,
  ): Promise<AuditEventPage> {
    if (
      !request.authPrincipal
    ) {
      throw new ApiHttpError(
        401,
        "No autenticado.",
      );
    }

    return this.audit
      .search(
        await this.scope
          .resolve(
            request.authPrincipal,
          ),
        query,
      );
  }
}

import {
  Controller,
  Get,
  Query,
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
  ) {}

  @Get()
  search(
    @Query(
      new ZodValidationPipe(
        auditSearchQuerySchema,
      ),
    )
    query:
      AuditSearchQuery,
  ): Promise<AuditEventPage> {
    return this.audit
      .search(
        query,
      );
  }
}

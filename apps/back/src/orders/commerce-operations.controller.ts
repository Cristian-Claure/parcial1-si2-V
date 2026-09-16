import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { operationalOrdersQuerySchema, type OperationalOrderListItem, type OperationalOrdersQuery } from "@velora/contracts";
import { BearerAuthGuard } from "../auth/bearer-auth.guard.js";
import type { AuthPrincipal } from "../auth/security.js";
import { RequireRoles } from "../common/authz/roles.decorator.js";
import { RolesGuard } from "../common/authz/roles.guard.js";
import type { AuthenticatedRequest } from "../common/http/authenticated-request.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { CommerceOperationsService } from "./commerce-operations.service.js";

@Controller("api")
@UseGuards(BearerAuthGuard, RolesGuard)
@RequireRoles("ADMIN", "STORE_MANAGER")
export class CommerceOperationsController {
  constructor(private readonly operations: CommerceOperationsService) {}
  @Get(["admin/orders", "manager/orders"])
  list(@Req() req: AuthenticatedRequest, @Query(new ZodValidationPipe(operationalOrdersQuerySchema)) query: OperationalOrdersQuery): Promise<OperationalOrderListItem[]> {
    return this.operations.list(this.principal(req), query);
  }
  private principal(req: AuthenticatedRequest): AuthPrincipal {
    if (!req.authPrincipal) throw new ApiHttpError(401, "No autenticado.");
    return req.authPrincipal;
  }
}

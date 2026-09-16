import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from "@nestjs/common";
import {
  adminCompanyQuerySchema, createManagerRequestSchema,
  type AdminCompanyQuery, type CreateManagerRequest, type ManagerResponse,
} from "@velora/contracts";
import { BearerAuthGuard } from "../auth/bearer-auth.guard.js";
import { RequireRoles } from "../common/authz/roles.decorator.js";
import { RolesGuard } from "../common/authz/roles.guard.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { AdminService } from "./admin.service.js";

@Controller("api/admin/users/managers")
@UseGuards(BearerAuthGuard, RolesGuard)
@RequireRoles("ADMIN")
export class AdminController {
  constructor(private readonly admin: AdminService) {}
  @Get() list(@Query(new ZodValidationPipe(adminCompanyQuerySchema)) query: AdminCompanyQuery): Promise<ManagerResponse[]> {
    return this.admin.listManagers(query.companyId);
  }
  @Post() @HttpCode(HttpStatus.OK) create(@Body(new ZodValidationPipe(createManagerRequestSchema)) body: CreateManagerRequest): Promise<ManagerResponse> {
    return this.admin.createManager(body);
  }
}

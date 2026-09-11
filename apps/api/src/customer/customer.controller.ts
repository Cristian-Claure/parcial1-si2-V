import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from "@nestjs/common";
import {
  customerAddressRequestSchema, customerProfileUpdateRequestSchema,
  type CustomerAddressRequest, type CustomerAddressResponse, type CustomerFavoriteResponse,
  type CustomerProfileUpdateRequest, type UserProfile,
} from "@velora/contracts";
import { BearerAuthGuard } from "../auth/bearer-auth.guard.js";
import type { AuthPrincipal } from "../auth/security.js";
import { RequireRoles } from "../common/authz/roles.decorator.js";
import { RolesGuard } from "../common/authz/roles.guard.js";
import type { AuthenticatedRequest } from "../common/http/authenticated-request.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { CustomerService } from "./customer.service.js";

@Controller("api/customer")
@UseGuards(BearerAuthGuard, RolesGuard)
@RequireRoles("CUSTOMER")
export class CustomerController {
  constructor(private readonly customers: CustomerService) {}

  @Get("profile") profile(@Req() req: AuthenticatedRequest): Promise<UserProfile> { return this.customers.profile(this.principal(req)); }
  @Put("profile") updateProfile(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(customerProfileUpdateRequestSchema)) body: CustomerProfileUpdateRequest): Promise<UserProfile> {
    return this.customers.updateProfile(this.principal(req), body);
  }
  @Get("addresses") addresses(@Req() req: AuthenticatedRequest): Promise<CustomerAddressResponse[]> { return this.customers.addresses(this.principal(req)); }
  @Post("addresses") @HttpCode(HttpStatus.CREATED)
  createAddress(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(customerAddressRequestSchema)) body: CustomerAddressRequest): Promise<CustomerAddressResponse> {
    return this.customers.createAddress(this.principal(req), body);
  }
  @Put("addresses/:addressId")
  updateAddress(@Req() req: AuthenticatedRequest, @Param("addressId", new ParseUUIDPipe()) addressId: string, @Body(new ZodValidationPipe(customerAddressRequestSchema)) body: CustomerAddressRequest): Promise<CustomerAddressResponse> {
    return this.customers.updateAddress(this.principal(req), addressId, body);
  }
  @Delete("addresses/:addressId") @HttpCode(HttpStatus.NO_CONTENT)
  deleteAddress(@Req() req: AuthenticatedRequest, @Param("addressId", new ParseUUIDPipe()) addressId: string): Promise<void> {
    return this.customers.deleteAddress(this.principal(req), addressId);
  }
  @Get("favorites") favorites(@Req() req: AuthenticatedRequest): Promise<CustomerFavoriteResponse[]> { return this.customers.favorites(this.principal(req)); }
  @Post("favorites/:productId") @HttpCode(HttpStatus.CREATED)
  addFavorite(@Req() req: AuthenticatedRequest, @Param("productId", new ParseUUIDPipe()) productId: string): Promise<CustomerFavoriteResponse> {
    return this.customers.addFavorite(this.principal(req), productId);
  }
  @Delete("favorites/:productId") @HttpCode(HttpStatus.NO_CONTENT)
  removeFavorite(@Req() req: AuthenticatedRequest, @Param("productId", new ParseUUIDPipe()) productId: string): Promise<void> {
    return this.customers.removeFavorite(this.principal(req), productId);
  }

  private principal(req: AuthenticatedRequest): AuthPrincipal {
    if (!req.authPrincipal) throw new ApiHttpError(401, "No autenticado.");
    return req.authPrincipal;
  }
}

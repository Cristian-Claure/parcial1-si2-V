import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { addCartItemRequestSchema, updateCartItemRequestSchema, type AddCartItemRequest, type CartResponse, type UpdateCartItemRequest } from "@velora/contracts";
import { BearerAuthGuard } from "../auth/bearer-auth.guard.js";
import type { AuthPrincipal } from "../auth/security.js";
import { RequireRoles } from "../common/authz/roles.decorator.js";
import { RolesGuard } from "../common/authz/roles.guard.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import type { AuthenticatedRequest } from "../common/http/authenticated-request.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { CartService } from "./cart.service.js";

@Controller("api/customer/cart")
@UseGuards(BearerAuthGuard, RolesGuard)
@RequireRoles("CUSTOMER")
export class CartController {
  constructor(private readonly carts: CartService) {}

  @Get()
  getCart(@Req() request: AuthenticatedRequest, @Query("companyId", new ParseUUIDPipe()) companyId: string): Promise<CartResponse> {
    return this.carts.getCart(this.principal(request), companyId);
  }

  @Post("items")
  @HttpCode(HttpStatus.OK)
  addItem(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(addCartItemRequestSchema)) body: AddCartItemRequest): Promise<CartResponse> {
    return this.carts.addItem(this.principal(request), body);
  }

  @Put("items/:itemId")
  updateItem(@Req() request: AuthenticatedRequest, @Param("itemId", new ParseUUIDPipe()) itemId: string, @Body(new ZodValidationPipe(updateCartItemRequestSchema)) body: UpdateCartItemRequest): Promise<CartResponse> {
    return this.carts.updateItem(this.principal(request), itemId, body);
  }

  @Delete("items/:itemId")
  removeItem(@Req() request: AuthenticatedRequest, @Param("itemId", new ParseUUIDPipe()) itemId: string): Promise<CartResponse> {
    return this.carts.removeItem(this.principal(request), itemId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async clearCart(@Req() request: AuthenticatedRequest, @Query("companyId", new ParseUUIDPipe()) companyId: string): Promise<void> {
    await this.carts.clearCart(this.principal(request), companyId);
  }

  private principal(request: AuthenticatedRequest): AuthPrincipal {
    const principal = request.authPrincipal;
    if (!principal) throw new ApiHttpError(401, "No autenticado.");
    return principal;
  }
}

import { Injectable } from "@nestjs/common";
import type { AddCartItemRequest, CartResponse, UpdateCartItemRequest } from "@velora/contracts";
import type { AuthPrincipal } from "../auth/security.js";
import { AccessContextService } from "../common/authz/access-context.service.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { CartRepository } from "./cart.repository.js";

@Injectable()
export class CartService {
  constructor(private readonly carts: CartRepository, private readonly access: AccessContextService) {}

  async getCart(principal: AuthPrincipal, companyId: string): Promise<CartResponse> {
    return this.carts.getActiveCart(await this.requireCustomer(principal), companyId);
  }

  async addItem(principal: AuthPrincipal, request: AddCartItemRequest): Promise<CartResponse> {
    const userId = await this.requireCustomer(principal);
    const variant = await this.carts.findVariantForSale(request.variantId);
    if (!variant) throw new ApiHttpError(404, "Variante no encontrada.");
    if (!variant.variantActive || !variant.productActive) throw new ApiHttpError(409, "La variante seleccionada no está disponible para la venta.");
    if (variant.companyId !== request.companyId) throw new ApiHttpError(409, "La variante no pertenece a la compañía seleccionada.");
    const result = await this.carts.addItem(userId, request.companyId, request.variantId, request.quantity);
    if (result.kind === "MAX_EXCEEDED") throw new ApiHttpError(400, "La cantidad máxima por variante en el carrito es 99.");
    return result.cart;
  }

  async updateItem(principal: AuthPrincipal, itemId: string, request: UpdateCartItemRequest): Promise<CartResponse> {
    const result = await this.carts.updateItem(await this.requireCustomer(principal), itemId, request.quantity);
    if (result.kind === "NOT_FOUND") throw new ApiHttpError(404, "Artículo del carrito no encontrado.");
    if (result.kind === "VARIANT_UNAVAILABLE") throw new ApiHttpError(409, "La variante seleccionada no está disponible para la venta.");
    return result.cart;
  }

  async removeItem(principal: AuthPrincipal, itemId: string): Promise<CartResponse> {
    const result = await this.carts.removeItem(await this.requireCustomer(principal), itemId);
    if (result.kind === "NOT_FOUND") throw new ApiHttpError(404, "Artículo del carrito no encontrado.");
    return result.cart;
  }

  async clearCart(principal: AuthPrincipal, companyId: string): Promise<void> {
    await this.carts.clearCart(await this.requireCustomer(principal), companyId);
  }

  private async requireCustomer(principal: AuthPrincipal): Promise<string> {
    const context = await this.access.resolve(principal);
    if (context.role !== "CUSTOMER") throw new ApiHttpError(403, "La operación está disponible únicamente para clientes.");
    return context.userId;
  }
}

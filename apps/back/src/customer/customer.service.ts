import { Injectable } from "@nestjs/common";
import type {
  CustomerAddressRequest, CustomerAddressResponse, CustomerFavoriteResponse,
  CustomerProfileUpdateRequest, UserProfile,
} from "@velora/contracts";
import type { AuthPrincipal } from "../auth/security.js";
import { ApiHttpError } from "../common/http/api-http.error.js";
import { CustomerRepository } from "./customer.repository.js";

@Injectable()
export class CustomerService {
  constructor(private readonly customers: CustomerRepository) {}

  async profile(principal: AuthPrincipal): Promise<UserProfile> {
    return this.requireCustomer(principal);
  }

  async updateProfile(principal: AuthPrincipal, request: CustomerProfileUpdateRequest): Promise<UserProfile> {
    await this.requireCustomer(principal);
    const updated = await this.customers.updateProfile(principal.userId, request);
    if (!updated) throw new ApiHttpError(404, "Cliente no encontrado.");
    return updated;
  }

  async addresses(principal: AuthPrincipal): Promise<CustomerAddressResponse[]> {
    await this.requireCustomer(principal);
    return this.customers.listAddresses(principal.userId);
  }

  async createAddress(principal: AuthPrincipal, request: CustomerAddressRequest): Promise<CustomerAddressResponse> {
    await this.requireCustomer(principal);
    return this.customers.createAddress(principal.userId, request);
  }

  async updateAddress(principal: AuthPrincipal, addressId: string, request: CustomerAddressRequest): Promise<CustomerAddressResponse> {
    await this.requireCustomer(principal);
    const updated = await this.customers.updateAddress(principal.userId, addressId, request);
    if (!updated) throw new ApiHttpError(404, "Dirección no encontrada.");
    return updated;
  }

  async deleteAddress(principal: AuthPrincipal, addressId: string): Promise<void> {
    await this.requireCustomer(principal);
    if (!(await this.customers.deleteAddress(principal.userId, addressId))) {
      throw new ApiHttpError(404, "Dirección no encontrada.");
    }
  }

  async favorites(principal: AuthPrincipal): Promise<CustomerFavoriteResponse[]> {
    await this.requireCustomer(principal);
    return this.customers.listFavorites(principal.userId);
  }

  async addFavorite(principal: AuthPrincipal, productId: string): Promise<CustomerFavoriteResponse> {
    await this.requireCustomer(principal);
    const result = await this.customers.addFavorite(principal.userId, productId);
    if (result === "PRODUCT_NOT_FOUND") throw new ApiHttpError(404, "Producto no encontrado o inactivo.");
    return result;
  }

  async removeFavorite(principal: AuthPrincipal, productId: string): Promise<void> {
    await this.requireCustomer(principal);
    await this.customers.removeFavorite(principal.userId, productId);
  }

  private async requireCustomer(principal: AuthPrincipal): Promise<UserProfile> {
    if (principal.role !== "CUSTOMER") throw new ApiHttpError(403, "La operación está disponible únicamente para clientes.");
    const profile = await this.customers.profile(principal.userId);
    if (!profile) throw new ApiHttpError(401, "Cliente autenticado no encontrado.");
    if (profile.role !== "CUSTOMER") throw new ApiHttpError(403, "La operación está disponible únicamente para clientes.");
    if (profile.status !== "ACTIVE") throw new ApiHttpError(403, "La cuenta del cliente no está activa.");
    return profile;
  }
}

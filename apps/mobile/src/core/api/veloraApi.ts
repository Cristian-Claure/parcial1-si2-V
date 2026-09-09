import type {
  AddCartItemRequest,
  AuthResponse,
  CartResponse,
  CategoryResponse,
  CheckoutWarehouseResponse,
  CompanyResponse,
  CreateOrderRequest,
  CreatePaymentRequest,
  CustomerAddressRequest,
  CustomerAddressResponse,
  CustomerFavoriteResponse,
  CustomerProfileUpdateRequest,
  LoginRequest,
  OrderResponse,
  PaymentActionRequest,
  PaymentHistoryResponse,
  PaymentResponse,
  ProductResponse,
  RegisterRequest,
  StripeCheckoutResponse,
  SyncOfflineOrderRequest,
  UpdateCartItemRequest,
  UserProfile,
} from "@velora/contracts";
import { apiRequest, jsonBody } from "./apiClient";

const q = (value: string) => encodeURIComponent(value);

export const veloraApi = {
  login: (body: LoginRequest) =>
    apiRequest<AuthResponse>(
      "/api/auth/login",
      { method: "POST", body: jsonBody(body) },
      false,
    ),

  register: (body: RegisterRequest) =>
    apiRequest<AuthResponse>(
      "/api/auth/register",
      { method: "POST", body: jsonBody(body) },
      false,
    ),

  me: () => apiRequest<UserProfile>("/api/auth/me"),

  companies: () =>
    apiRequest<CompanyResponse[]>("/api/companies", {}, false),

  categories: (companyId: string) =>
    apiRequest<CategoryResponse[]>(
      `/api/catalog/categories?companyId=${q(companyId)}`,
      {},
      false,
    ),

  products: (companyId: string) =>
    apiRequest<ProductResponse[]>(
      `/api/catalog/products?companyId=${q(companyId)}`,
      {},
      false,
    ),

  product: (companyId: string, productId: string) =>
    apiRequest<ProductResponse>(
      `/api/catalog/products/${productId}?companyId=${q(companyId)}`,
      {},
      false,
    ),

  cart: () => apiRequest<CartResponse>("/api/customer/cart"),

  addCartItem: (body: AddCartItemRequest) =>
    apiRequest<CartResponse>("/api/customer/cart/items", {
      method: "POST",
      body: jsonBody(body),
    }),

  updateCartItem: (itemId: string, body: UpdateCartItemRequest) =>
    apiRequest<CartResponse>(`/api/customer/cart/items/${itemId}`, {
      method: "PUT",
      body: jsonBody(body),
    }),

  removeCartItem: (itemId: string) =>
    apiRequest<CartResponse>(`/api/customer/cart/items/${itemId}`, {
      method: "DELETE",
    }),

  clearCart: () =>
    apiRequest<void>("/api/customer/cart", { method: "DELETE" }),

  profile: () => apiRequest<UserProfile>("/api/customer/profile"),

  updateProfile: (body: CustomerProfileUpdateRequest) =>
    apiRequest<UserProfile>("/api/customer/profile", {
      method: "PUT",
      body: jsonBody(body),
    }),

  addresses: () =>
    apiRequest<CustomerAddressResponse[]>("/api/customer/addresses"),

  createAddress: (body: CustomerAddressRequest) =>
    apiRequest<CustomerAddressResponse>("/api/customer/addresses", {
      method: "POST",
      body: jsonBody(body),
    }),

  updateAddress: (addressId: string, body: CustomerAddressRequest) =>
    apiRequest<CustomerAddressResponse>(
      `/api/customer/addresses/${addressId}`,
      { method: "PUT", body: jsonBody(body) },
    ),

  deleteAddress: (addressId: string) =>
    apiRequest<void>(`/api/customer/addresses/${addressId}`, {
      method: "DELETE",
    }),

  favorites: () =>
    apiRequest<CustomerFavoriteResponse[]>("/api/customer/favorites"),

  addFavorite: (productId: string) =>
    apiRequest<CustomerFavoriteResponse>(
      `/api/customer/favorites/${productId}`,
      { method: "POST" },
    ),

  removeFavorite: (productId: string) =>
    apiRequest<void>(`/api/customer/favorites/${productId}`, {
      method: "DELETE",
    }),

  checkoutWarehouses: () =>
    apiRequest<CheckoutWarehouseResponse[]>(
      "/api/customer/checkout/warehouses",
    ),

  createOrder: (body: CreateOrderRequest) =>
    apiRequest<OrderResponse>("/api/customer/orders", {
      method: "POST",
      body: jsonBody(body),
    }),

  syncOfflineOrder: (body: SyncOfflineOrderRequest) =>
    apiRequest<OrderResponse>("/api/customer/orders/offline-sync", {
      method: "POST",
      body: jsonBody(body),
    }),

  orders: () => apiRequest<OrderResponse[]>("/api/customer/orders"),

  cancelOrder: (orderId: string) =>
    apiRequest<OrderResponse>(`/api/customer/orders/${orderId}/cancel`, {
      method: "POST",
      body: "{}",
    }),

  paymentsForOrder: (orderId: string) =>
    apiRequest<PaymentResponse[]>(
      `/api/customer/orders/${orderId}/payments`,
    ),

  createPayment: (orderId: string, body: CreatePaymentRequest) =>
    apiRequest<PaymentResponse>(
      `/api/customer/orders/${orderId}/payments`,
      { method: "POST", body: jsonBody(body) },
    ),

  cancelPayment: (paymentId: string, body: PaymentActionRequest) =>
    apiRequest<PaymentResponse>(
      `/api/customer/payments/${paymentId}/cancel`,
      { method: "POST", body: jsonBody(body) },
    ),

  payment: (paymentId: string) =>
    apiRequest<PaymentResponse>(`/api/customer/payments/${paymentId}`),

  paymentHistory: (paymentId: string) =>
    apiRequest<PaymentHistoryResponse[]>(
      `/api/customer/payments/${paymentId}/history`,
    ),

  stripeCheckoutMobile: (orderId: string) =>
    apiRequest<StripeCheckoutResponse>(
      `/api/customer/orders/${orderId}/payments/stripe-checkout/mobile`,
      { method: "POST", body: "{}" },
    ),
};
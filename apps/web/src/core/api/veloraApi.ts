import type {
  AddCartItemRequest, AuthResponse, CartResponse, CategoryRequest, CategoryResponse,
  CheckoutWarehouseResponse, CompanyResponse, CreateManagerRequest, CreateOrderRequest,
  CreatePaymentRequest, CustomerAddressRequest, CustomerAddressResponse, CustomerFavoriteResponse,
  CustomerProfileUpdateRequest, ImageRequest, ImageResponse, InventoryMovementRequest, InventoryMovementResponse,
  InventoryStock, LoginRequest, ManagerResponse, OperationalOrderListItem, OrderResponse, PaymentActionRequest,
  PaymentHistoryResponse, PaymentResponse, ProductRequest, ProductResponse, RegisterRequest, StoreResponse,
  StripeCheckoutResponse, SyncOfflineOrderRequest, UpdateCartItemRequest, UserProfile, VariantRequest,
  VariantResponse, WarehouseRequest, WarehouseResponse,
} from "@velora/contracts";
import { apiRequest, jsonBody } from "./apiClient";

const q = (value: string) => encodeURIComponent(value);
export const veloraApi = {
  login: (body: LoginRequest) => apiRequest<AuthResponse>("/api/auth/login", { method: "POST", body: jsonBody(body) }, false),
  register: (body: RegisterRequest) => apiRequest<AuthResponse>("/api/auth/register", { method: "POST", body: jsonBody(body) }, false),
  me: () => apiRequest<UserProfile>("/api/auth/me"),

  companies: () => apiRequest<CompanyResponse[]>("/api/companies", {}, false),
  adminCompanies: () => apiRequest<CompanyResponse[]>("/api/admin/companies"),
  managerCompany: () => apiRequest<CompanyResponse>("/api/manager/company"),
  adminStores: (companyId: string) => apiRequest<StoreResponse[]>(`/api/admin/stores?companyId=${q(companyId)}`),
  createStore: (body: { companyId: string; code: string; name: string; address?: string | null }) => apiRequest<StoreResponse>("/api/admin/stores", { method: "POST", body: jsonBody(body) }),
  managers: (companyId: string) => apiRequest<ManagerResponse[]>(`/api/admin/users/managers?companyId=${q(companyId)}`),
  createManager: (body: CreateManagerRequest) => apiRequest<ManagerResponse>("/api/admin/users/managers", { method: "POST", body: jsonBody(body) }),

  publicCategories: (companyId: string) => apiRequest<CategoryResponse[]>(`/api/catalog/categories?companyId=${q(companyId)}`, {}, false),
  publicProducts: (companyId: string) => apiRequest<ProductResponse[]>(`/api/catalog/products?companyId=${q(companyId)}`, {}, false),
  publicProduct: (companyId: string, id: string) => apiRequest<ProductResponse>(`/api/catalog/products/${id}?companyId=${q(companyId)}`, {}, false),
  managedCategories: (companyId: string) => apiRequest<CategoryResponse[]>(`/api/catalog/manage/categories?companyId=${q(companyId)}`),
  createCategory: (body: CategoryRequest) => apiRequest<CategoryResponse>("/api/catalog/manage/categories", { method: "POST", body: jsonBody(body) }),
  managedProducts: (companyId: string) => apiRequest<ProductResponse[]>(`/api/catalog/manage/products?companyId=${q(companyId)}`),
  createProduct: (body: ProductRequest) => apiRequest<ProductResponse>("/api/catalog/manage/products", { method: "POST", body: jsonBody(body) }),
  createVariant: (productId: string, body: VariantRequest) => apiRequest<VariantResponse>(`/api/catalog/manage/products/${productId}/variants`, { method: "POST", body: jsonBody(body) }),
  createImage: (productId: string, body: ImageRequest) => apiRequest<ImageResponse>(`/api/catalog/manage/products/${productId}/images`, { method: "POST", body: jsonBody(body) }),

  cart: () => apiRequest<CartResponse>("/api/customer/cart"),
  addCartItem: (body: AddCartItemRequest) => apiRequest<CartResponse>("/api/customer/cart/items", { method: "POST", body: jsonBody(body) }),
  updateCartItem: (id: string, body: UpdateCartItemRequest) => apiRequest<CartResponse>(`/api/customer/cart/items/${id}`, { method: "PUT", body: jsonBody(body) }),
  removeCartItem: (id: string) => apiRequest<CartResponse>(`/api/customer/cart/items/${id}`, { method: "DELETE" }),
  clearCart: () => apiRequest<void>("/api/customer/cart", { method: "DELETE" }),

  customerProfile: () => apiRequest<UserProfile>("/api/customer/profile"),
  updateCustomerProfile: (body: CustomerProfileUpdateRequest) => apiRequest<UserProfile>("/api/customer/profile", { method: "PUT", body: jsonBody(body) }),
  addresses: () => apiRequest<CustomerAddressResponse[]>("/api/customer/addresses"),
  createAddress: (body: CustomerAddressRequest) => apiRequest<CustomerAddressResponse>("/api/customer/addresses", { method: "POST", body: jsonBody(body) }),
  updateAddress: (id: string, body: CustomerAddressRequest) => apiRequest<CustomerAddressResponse>(`/api/customer/addresses/${id}`, { method: "PUT", body: jsonBody(body) }),
  deleteAddress: (id: string) => apiRequest<void>(`/api/customer/addresses/${id}`, { method: "DELETE" }),
  favorites: () => apiRequest<CustomerFavoriteResponse[]>("/api/customer/favorites"),
  addFavorite: (productId: string) => apiRequest<CustomerFavoriteResponse>(`/api/customer/favorites/${productId}`, { method: "POST" }),
  removeFavorite: (productId: string) => apiRequest<void>(`/api/customer/favorites/${productId}`, { method: "DELETE" }),

  checkoutWarehouses: () => apiRequest<CheckoutWarehouseResponse[]>("/api/customer/checkout/warehouses"),
  createOrder: (body: CreateOrderRequest) => apiRequest<OrderResponse>("/api/customer/orders", { method: "POST", body: jsonBody(body) }),
  syncOfflineOrder: (body: SyncOfflineOrderRequest) => apiRequest<OrderResponse>("/api/customer/orders/offline-sync", { method: "POST", body: jsonBody(body) }),
  orders: () => apiRequest<OrderResponse[]>("/api/customer/orders"),
  cancelOrder: (id: string) => apiRequest<OrderResponse>(`/api/customer/orders/${id}/cancel`, { method: "POST", body: "{}" }),
  paymentsForOrder: (orderId: string) => apiRequest<PaymentResponse[]>(`/api/customer/orders/${orderId}/payments`),
  createPayment: (orderId: string, body: CreatePaymentRequest) => apiRequest<PaymentResponse>(`/api/customer/orders/${orderId}/payments`, { method: "POST", body: jsonBody(body) }),
  cancelPayment: (id: string, body: PaymentActionRequest) => apiRequest<PaymentResponse>(`/api/customer/payments/${id}/cancel`, { method: "POST", body: jsonBody(body) }),
  paymentHistory: (id: string) => apiRequest<PaymentHistoryResponse[]>(`/api/customer/payments/${id}/history`),
  stripeCheckout: (orderId: string) => apiRequest<StripeCheckoutResponse>(`/api/customer/orders/${orderId}/payments/stripe-checkout`, { method: "POST", body: "{}" }),

  warehouses: () => apiRequest<WarehouseResponse[]>("/api/inventory/warehouses"),
  createWarehouse: (body: WarehouseRequest) => apiRequest<WarehouseResponse>("/api/inventory/warehouses", { method: "POST", body: jsonBody(body) }),
  stock: (warehouseId: string) => apiRequest<InventoryStock[]>(`/api/inventory/warehouses/${warehouseId}/stock`),
  inventoryHistory: (warehouseId: string) => apiRequest<InventoryMovementResponse[]>(`/api/inventory/warehouses/${warehouseId}/movements`),
  movement: (body: InventoryMovementRequest) => apiRequest<InventoryStock>("/api/inventory/movements", { method: "POST", body: jsonBody(body) }),

  operationalOrders: (role: "ADMIN" | "STORE_MANAGER", companyId?: string) => {
    const base = role === "ADMIN" ? "/api/admin/orders" : "/api/manager/orders";
    return apiRequest<OperationalOrderListItem[]>(companyId ? `${base}?companyId=${q(companyId)}` : base);
  },
  confirmPayment: (role: "ADMIN" | "STORE_MANAGER", id: string, reason: string | null) => apiRequest<PaymentResponse>(`/api/${role === "ADMIN" ? "admin" : "manager"}/payments/${id}/confirm`, { method: "POST", body: jsonBody({ reason }) }),
  failPayment: (role: "ADMIN" | "STORE_MANAGER", id: string, reason: string | null) => apiRequest<PaymentResponse>(`/api/${role === "ADMIN" ? "admin" : "manager"}/payments/${id}/fail`, { method: "POST", body: jsonBody({ reason }) }),
  refundPayment: (role: "ADMIN" | "STORE_MANAGER", id: string, reason: string | null) => apiRequest<PaymentResponse>(`/api/${role === "ADMIN" ? "admin" : "manager"}/payments/${id}/refund`, { method: "POST", body: jsonBody({ reason }) }),
  fulfillOrder: (role: "ADMIN" | "STORE_MANAGER", id: string) => apiRequest<OrderResponse>(`/api/${role === "ADMIN" ? "admin" : "manager"}/orders/${id}/fulfill`, { method: "POST", body: "{}" }),
};

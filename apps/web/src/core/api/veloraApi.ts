import type {
  AddCartItemRequest,
  AuthResponse,
  CartResponse,
  CashMovementRequest,
  CashMovementResponse,
  CashSessionResponse,
  CategoryRequest,
  CategoryResponse,
  CheckoutWarehouseResponse,
  CloseCashSessionRequest,
  CompanyResponse,
  ConfirmPosPaymentRequest,
  CreateManagerRequest,
  CreateOrderRequest,
  CreatePaymentRequest,
  CreatePointOfSaleRequest,
  CreatePosSaleRequest,
  CustomerAddressRequest,
  CustomerAddressResponse,
  CustomerFavoriteResponse,
  CustomerProfileUpdateRequest,
  ImageRequest,
  ImageResponse,
  InventoryMovementRequest,
  InventoryMovementResponse,
  InventoryStock,
  LoginRequest,
  ManagerResponse,
  OpenCashSessionRequest,
  OperationalOrderListItem,
  OrderResponse,
  PaymentActionRequest,
  PaymentHistoryResponse,
  PaymentResponse,
  PointOfSaleResponse,
  PosPaymentResolutionResponse,
  PosSaleResponse,
  ProductRequest,
  ProductResponse,
  RegisterRequest,
  StoreResponse,
  StripeCheckoutResponse,
  SyncOfflineOrderRequest,
  UpdateCartItemRequest,
  UpdatePointOfSaleRequest,
  UserProfile,
  VariantRequest,
  VariantResponse,
  WarehouseRequest,
  WarehouseResponse,
} from "@velora/contracts";

import {
  apiRequest,
  jsonBody,
} from "./apiClient";

const q = (
  value: string,
) => encodeURIComponent(value);

const operationsPrefix = (
  role:
    "ADMIN" |
    "STORE_MANAGER",
) =>
  role === "ADMIN"
    ? "admin"
    : "manager";

export const veloraApi = {
  login: (
    body: LoginRequest,
  ) =>
    apiRequest<AuthResponse>(
      "/api/auth/login",
      {
        method: "POST",
        body: jsonBody(body),
      },
      false,
    ),

  register: (
    body: RegisterRequest,
  ) =>
    apiRequest<AuthResponse>(
      "/api/auth/register",
      {
        method: "POST",
        body: jsonBody(body),
      },
      false,
    ),

  me: () =>
    apiRequest<UserProfile>(
      "/api/auth/me",
    ),

  companies: () =>
    apiRequest<CompanyResponse[]>(
      "/api/companies",
      {},
      false,
    ),

  adminCompanies: () =>
    apiRequest<CompanyResponse[]>(
      "/api/admin/companies",
    ),

  managerCompany: () =>
    apiRequest<CompanyResponse>(
      "/api/manager/company",
    ),

  adminStores: (
    companyId: string,
  ) =>
    apiRequest<StoreResponse[]>(
      `/api/admin/stores?companyId=${q(companyId)}`,
    ),

  createStore: (
    body: {
      companyId: string;
      code: string;
      name: string;
      address?: string | null;
    },
  ) =>
    apiRequest<StoreResponse>(
      "/api/admin/stores",
      {
        method: "POST",
        body: jsonBody(body),
      },
    ),

  managers: (
    companyId: string,
  ) =>
    apiRequest<ManagerResponse[]>(
      `/api/admin/users/managers?companyId=${q(companyId)}`,
    ),

  createManager: (
    body: CreateManagerRequest,
  ) =>
    apiRequest<ManagerResponse>(
      "/api/admin/users/managers",
      {
        method: "POST",
        body: jsonBody(body),
      },
    ),

  publicCategories: (
    companyId: string,
  ) =>
    apiRequest<CategoryResponse[]>(
      `/api/catalog/categories?companyId=${q(companyId)}`,
      {},
      false,
    ),

  publicProducts: (
    companyId: string,
  ) =>
    apiRequest<ProductResponse[]>(
      `/api/catalog/products?companyId=${q(companyId)}`,
      {},
      false,
    ),

  publicProduct: (
    companyId: string,
    id: string,
  ) =>
    apiRequest<ProductResponse>(
      `/api/catalog/products/${id}?companyId=${q(companyId)}`,
      {},
      false,
    ),

  managedCategories: (
    companyId: string,
  ) =>
    apiRequest<CategoryResponse[]>(
      `/api/catalog/manage/categories?companyId=${q(companyId)}`,
    ),

  createCategory: (
    body: CategoryRequest,
  ) =>
    apiRequest<CategoryResponse>(
      "/api/catalog/manage/categories",
      {
        method: "POST",
        body: jsonBody(body),
      },
    ),

  managedProducts: (
    companyId: string,
  ) =>
    apiRequest<ProductResponse[]>(
      `/api/catalog/manage/products?companyId=${q(companyId)}`,
    ),

  createProduct: (
    body: ProductRequest,
  ) =>
    apiRequest<ProductResponse>(
      "/api/catalog/manage/products",
      {
        method: "POST",
        body: jsonBody(body),
      },
    ),

  createVariant: (
    productId: string,
    body: VariantRequest,
  ) =>
    apiRequest<VariantResponse>(
      `/api/catalog/manage/products/${productId}/variants`,
      {
        method: "POST",
        body: jsonBody(body),
      },
    ),

  createImage: (
    productId: string,
    body: ImageRequest,
  ) =>
    apiRequest<ImageResponse>(
      `/api/catalog/manage/products/${productId}/images`,
      {
        method: "POST",
        body: jsonBody(body),
      },
    ),

  cart: (companyId: string) =>
    apiRequest<CartResponse>(
      `/api/customer/cart?companyId=${q(companyId)}`,
    ),

  addCartItem: (
    body: AddCartItemRequest,
  ) =>
    apiRequest<CartResponse>(
      "/api/customer/cart/items",
      {
        method: "POST",
        body: jsonBody(body),
      },
    ),

  updateCartItem: (
    id: string,
    body: UpdateCartItemRequest,
  ) =>
    apiRequest<CartResponse>(
      `/api/customer/cart/items/${id}`,
      {
        method: "PUT",
        body: jsonBody(body),
      },
    ),

  removeCartItem: (
    id: string,
  ) =>
    apiRequest<CartResponse>(
      `/api/customer/cart/items/${id}`,
      {
        method: "DELETE",
      },
    ),

  clearCart: (companyId: string) =>
    apiRequest<void>(
      `/api/customer/cart?companyId=${q(companyId)}`,
      { method: "DELETE" },
    ),

  customerProfile: () =>
    apiRequest<UserProfile>(
      "/api/customer/profile",
    ),

  updateCustomerProfile: (
    body: CustomerProfileUpdateRequest,
  ) =>
    apiRequest<UserProfile>(
      "/api/customer/profile",
      {
        method: "PUT",
        body: jsonBody(body),
      },
    ),

  addresses: () =>
    apiRequest<CustomerAddressResponse[]>(
      "/api/customer/addresses",
    ),

  createAddress: (
    body: CustomerAddressRequest,
  ) =>
    apiRequest<CustomerAddressResponse>(
      "/api/customer/addresses",
      {
        method: "POST",
        body: jsonBody(body),
      },
    ),

  updateAddress: (
    id: string,
    body: CustomerAddressRequest,
  ) =>
    apiRequest<CustomerAddressResponse>(
      `/api/customer/addresses/${id}`,
      {
        method: "PUT",
        body: jsonBody(body),
      },
    ),

  deleteAddress: (
    id: string,
  ) =>
    apiRequest<void>(
      `/api/customer/addresses/${id}`,
      {
        method: "DELETE",
      },
    ),

  favorites: () =>
    apiRequest<CustomerFavoriteResponse[]>(
      "/api/customer/favorites",
    ),

  addFavorite: (
    productId: string,
  ) =>
    apiRequest<CustomerFavoriteResponse>(
      `/api/customer/favorites/${productId}`,
      {
        method: "POST",
      },
    ),

  removeFavorite: (
    productId: string,
  ) =>
    apiRequest<void>(
      `/api/customer/favorites/${productId}`,
      {
        method: "DELETE",
      },
    ),

  checkoutWarehouses: (companyId: string) =>
    apiRequest<CheckoutWarehouseResponse[]>(
      `/api/customer/checkout/warehouses?companyId=${q(companyId)}`,
    ),

  createOrder: (body: CreateOrderRequest, idempotencyKey: string) =>
    apiRequest<OrderResponse>(
      "/api/customer/orders",
      { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: jsonBody(body) },
    ),

  syncOfflineOrder: (
    body: SyncOfflineOrderRequest,
  ) =>
    apiRequest<OrderResponse>(
      "/api/customer/orders/offline-sync",
      {
        method: "POST",
        body: jsonBody(body),
      },
    ),

  orders: () =>
    apiRequest<OrderResponse[]>(
      "/api/customer/orders",
    ),

  cancelOrder: (
    id: string,
  ) =>
    apiRequest<OrderResponse>(
      `/api/customer/orders/${id}/cancel`,
      {
        method: "POST",
        body: "{}",
      },
    ),

  paymentsForOrder: (
    orderId: string,
  ) =>
    apiRequest<PaymentResponse[]>(
      `/api/customer/orders/${orderId}/payments`,
    ),

  createPayment: (
    orderId: string,
    body: CreatePaymentRequest,
  ) =>
    apiRequest<PaymentResponse>(
      `/api/customer/orders/${orderId}/payments`,
      {
        method: "POST",
        body: jsonBody(body),
      },
    ),

  cancelPayment: (
    id: string,
    body: PaymentActionRequest,
  ) =>
    apiRequest<PaymentResponse>(
      `/api/customer/payments/${id}/cancel`,
      {
        method: "POST",
        body: jsonBody(body),
      },
    ),

  paymentHistory: (
    id: string,
  ) =>
    apiRequest<PaymentHistoryResponse[]>(
      `/api/customer/payments/${id}/history`,
    ),

  stripeCheckout: (
    orderId: string,
  ) =>
    apiRequest<StripeCheckoutResponse>(
      `/api/customer/orders/${orderId}/payments/stripe-checkout`,
      {
        method: "POST",
        body: "{}",
      },
    ),

  warehouses: () =>
    apiRequest<WarehouseResponse[]>(
      "/api/inventory/warehouses",
    ),

  createWarehouse: (
    body: WarehouseRequest,
  ) =>
    apiRequest<WarehouseResponse>(
      "/api/inventory/warehouses",
      {
        method: "POST",
        body: jsonBody(body),
      },
    ),

  stock: (
    warehouseId: string,
  ) =>
    apiRequest<InventoryStock[]>(
      `/api/inventory/warehouses/${warehouseId}/stock`,
    ),

  inventoryHistory: (
    warehouseId: string,
  ) =>
    apiRequest<InventoryMovementResponse[]>(
      `/api/inventory/warehouses/${warehouseId}/movements`,
    ),

  movement: (
    body: InventoryMovementRequest,
  ) =>
    apiRequest<InventoryStock>(
      "/api/inventory/movements",
      {
        method: "POST",
        body: jsonBody(body),
      },
    ),

  operationalOrders: (
    role:
      "ADMIN" |
      "STORE_MANAGER",
    companyId?: string,
  ) => {
    const base =
      role === "ADMIN"
        ? "/api/admin/orders"
        : "/api/manager/orders";

    return apiRequest<OperationalOrderListItem[]>(
      companyId
        ? `${base}?companyId=${q(companyId)}`
        : base,
    );
  },

  confirmPayment: (
    role:
      "ADMIN" |
      "STORE_MANAGER",
    id: string,
    reason: string | null,
  ) =>
    apiRequest<PaymentResponse>(
      `/api/${operationsPrefix(role)}/payments/${id}/confirm`,
      {
        method: "POST",
        body: jsonBody({
          reason,
        }),
      },
    ),

  failPayment: (
    role:
      "ADMIN" |
      "STORE_MANAGER",
    id: string,
    reason: string | null,
  ) =>
    apiRequest<PaymentResponse>(
      `/api/${operationsPrefix(role)}/payments/${id}/fail`,
      {
        method: "POST",
        body: jsonBody({
          reason,
        }),
      },
    ),

  refundPayment: (
    role:
      "ADMIN" |
      "STORE_MANAGER",
    id: string,
    reason: string | null,
  ) =>
    apiRequest<PaymentResponse>(
      `/api/${operationsPrefix(role)}/payments/${id}/refund`,
      {
        method: "POST",
        body: jsonBody({
          reason,
        }),
      },
    ),

  fulfillOrder: (
    role:
      "ADMIN" |
      "STORE_MANAGER",
    id: string,
  ) =>
    apiRequest<OrderResponse>(
      `/api/${operationsPrefix(role)}/orders/${id}/fulfill`,
      {
        method: "POST",
        body: "{}",
      },
    ),

  pointsOfSale: (
    role:
      "ADMIN" |
      "STORE_MANAGER",
    companyId?: string,
  ) => {
    const prefix =
      operationsPrefix(role);

    return apiRequest<PointOfSaleResponse[]>(
      role === "ADMIN"
        ? `/api/${prefix}/points-of-sale?companyId=${q(companyId ?? "")}`
        : `/api/${prefix}/points-of-sale`,
    );
  },

  createPointOfSale: (
    body: CreatePointOfSaleRequest,
  ) =>
    apiRequest<PointOfSaleResponse>(
      "/api/admin/points-of-sale",
      {
        method: "POST",
        body: jsonBody(body),
      },
    ),

  updatePointOfSale: (
    id: string,
    body: UpdatePointOfSaleRequest,
  ) =>
    apiRequest<PointOfSaleResponse>(
      `/api/admin/points-of-sale/${id}`,
      {
        method: "PUT",
        body: jsonBody(body),
      },
    ),

  openCash: (
    role:
      "ADMIN" |
      "STORE_MANAGER",
    body: OpenCashSessionRequest,
  ) =>
    apiRequest<CashSessionResponse>(
      `/api/${operationsPrefix(role)}/cash-sessions/open`,
      {
        method: "POST",
        body: jsonBody(body),
      },
    ),

  openCashSession: (
    role:
      "ADMIN" |
      "STORE_MANAGER",
    pointOfSaleId: string,
  ) =>
    apiRequest<CashSessionResponse>(
      `/api/${operationsPrefix(role)}/cash-sessions/open/${pointOfSaleId}`,
    ),

  registerCashMovement: (
    role:
      "ADMIN" |
      "STORE_MANAGER",
    sessionId: string,
    body: CashMovementRequest,
  ) =>
    apiRequest<CashMovementResponse>(
      `/api/${operationsPrefix(role)}/cash-sessions/${sessionId}/movements`,
      {
        method: "POST",
        body: jsonBody(body),
      },
    ),

  cashMovements: (
    role:
      "ADMIN" |
      "STORE_MANAGER",
    sessionId: string,
  ) =>
    apiRequest<CashMovementResponse[]>(
      `/api/${operationsPrefix(role)}/cash-sessions/${sessionId}/movements`,
    ),

  closeCash: (
    role:
      "ADMIN" |
      "STORE_MANAGER",
    sessionId: string,
    body: CloseCashSessionRequest,
  ) =>
    apiRequest<CashSessionResponse>(
      `/api/${operationsPrefix(role)}/cash-sessions/${sessionId}/close`,
      {
        method: "POST",
        body: jsonBody(body),
      },
    ),

  createPosSale: (
    role:
      "ADMIN" |
      "STORE_MANAGER",
    body: CreatePosSaleRequest,
  ) =>
    apiRequest<PosSaleResponse>(
      `/api/${operationsPrefix(role)}/pos/sales`,
      {
        method: "POST",
        body: jsonBody(body),
      },
    ),

  pendingPosSales: (
    role:
      "ADMIN" |
      "STORE_MANAGER",
    sessionId: string,
  ) =>
    apiRequest<PosSaleResponse[]>(
      `/api/${operationsPrefix(role)}/pos/sales/pending/${sessionId}`,
    ),

  confirmPosPayment: (
    role:
      "ADMIN" |
      "STORE_MANAGER",
    paymentId: string,
    body: ConfirmPosPaymentRequest,
  ) =>
    apiRequest<PosPaymentResolutionResponse>(
      `/api/${operationsPrefix(role)}/pos/sales/payments/${paymentId}/confirm`,
      {
        method: "POST",
        body: jsonBody(body),
      },
    ),

  failPosPayment: (
    role:
      "ADMIN" |
      "STORE_MANAGER",
    paymentId: string,
    body: PaymentActionRequest,
  ) =>
    apiRequest<PosPaymentResolutionResponse>(
      `/api/${operationsPrefix(role)}/pos/sales/payments/${paymentId}/fail`,
      {
        method: "POST",
        body: jsonBody(body),
      },
    ),

  cancelPosPayment: (
    role:
      "ADMIN" |
      "STORE_MANAGER",
    paymentId: string,
    body: PaymentActionRequest,
  ) =>
    apiRequest<PosPaymentResolutionResponse>(
      `/api/${operationsPrefix(role)}/pos/sales/payments/${paymentId}/cancel`,
      {
        method: "POST",
        body: jsonBody(body),
      },
    ),
};
